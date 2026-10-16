import {bounds,digest} from './artifact-binary.mjs';
import {formatBudget} from './artifact-format-budget.mjs';
import {decodeModifiedUtf8} from './artifact-mutf8.mjs';
import {decodeJvmCode} from './artifact-jvm-code.mjs';
import {chargeJsonBytes} from './bounded-json.mjs';

// Finite class-file profiles exercised by owned packets and compiler producers.
const majors=new Set([52,55,61,65,69]);
const primitive={B:'byte',C:'char',D:'double',F:'float',I:'int',J:'long',S:'short',Z:'boolean',V:'void'};
const internalName=name=>typeof name==='string'&&name.length>0&&!/[.;\[\0]/.test(name)&&!name.split('/').some(part=>!part);
const memberName=(name,method=false)=>typeof name==='string'&&name.length>0&&!/[.;/\[\0]/.test(name)&&(method?(!/[<>]/.test(name)||['<init>','<clinit>'].includes(name)):!/[<>]/.test(name));

export function parseJvmDescriptor(text,{method=false,budget}={}){
 if(typeof text!=='string'||!text.length||text.length>65535)throw new Error('Invalid JVM descriptor extent');let at=0;
 function type(allowVoid=false){budget?.work();const begin=at;let arrays=0;while(text[at]==='['){at++;if(++arrays>255)throw new Error('JVM array rank exceeds 255');}const tag=text[at++];let display;
  if(tag==='L'){const end=text.indexOf(';',at);if(end<0||!internalName(text.slice(at,end)))throw new Error('Invalid JVM object descriptor');display=text.slice(at,end).replaceAll('/','.');at=end+1;}
  else if(primitive[tag]&&!(tag==='V'&&(!allowVoid||arrays)))display=primitive[tag];else throw new Error('Unsupported or malformed JVM descriptor element');
  return {descriptor:text.slice(begin,at),display:display+'[]'.repeat(arrays),array_dimensions:arrays,slots:arrays||tag==='L'?1:tag==='J'||tag==='D'?2:tag==='V'?0:1};
 }
 if(!method){const value=type();if(at!==text.length)throw new Error('Trailing JVM field descriptor bytes');return value;}
 if(text[at++]!=='(')throw new Error('JVM method descriptor lacks parameter list');const parameters=[];let slots=0;
 while(at<text.length&&text[at]!==')'){const value=type();slots+=value.slots;if(slots>255)throw new Error('JVM method parameter slot count exceeds 255');parameters.push(value);}
 if(text[at++]!==')')throw new Error('JVM method descriptor parameter list is unterminated');const result=type(true);if(at!==text.length)throw new Error('Trailing JVM method descriptor bytes');return {parameters,result,parameter_slots:slots};
}

export function parseJvmClass(bytes,{signal,limits={},budget=formatBudget({signal,...limits})}={}){
 budget.check();if(bytes.length>16*1024*1024)throw Object.assign(new Error('JVM class input exceeds 16 MiB'),{code:'capacity'});bounds(bytes,0,10);if(bytes.readUInt32BE(0)!==0xcafebabe)throw new Error('Expected JVM class magic');
 const minor=bytes.readUInt16BE(4),major=bytes.readUInt16BE(6);if(!majors.has(major)||minor!==0)throw new Error('Unqualified JVM class-file version '+major+'.'+minor);
 let at=8;const need=(size,end=bytes.length)=>{bounds(bytes,at,size);if(at+size>end)throw new Error('JVM record escapes its declared attribute extent');},u1=()=>{need(1);return bytes[at++];},u2=()=>{need(2);const value=bytes.readUInt16BE(at);at+=2;return value;},u4=()=>{need(4);const value=bytes.readUInt32BE(at);at+=4;return value;};
 const cpCount=u2();if(cpCount<1)throw new Error('JVM constant pool count is zero');budget.take('records',cpCount);const cp=new Array(cpCount).fill(null);
 for(let index=1;index<cpCount;index++){
  budget.work();const offset=at,tag=u1(),record={tag,offset};
  if(tag===1){const length=u2();need(length);budget.take('string_bytes',length);record.value=decodeModifiedUtf8(bytes.subarray(at,at+length),{budget});at+=length;}
  else if(tag===3){need(4);record.value=bytes.readInt32BE(at);at+=4;}
  else if(tag===4){need(4);const value=bytes.readFloatBE(at);record.value=Number.isFinite(value)?value:String(value);at+=4;}
  else if(tag===5||tag===6){need(8);const value=tag===5?bytes.readBigInt64BE(at):bytes.readDoubleBE(at);record.value=typeof value==='bigint'?String(value):Number.isFinite(value)?value:String(value);at+=8;if(index+1>=cpCount)throw new Error('Wide JVM constant has no reserved slot');}
  else if([7,8,16,19,20].includes(tag))record.index=u2();
  else if([9,10,11,12,17,18].includes(tag)){record.first=u2();record.second=u2();}
  else if(tag===15){record.reference_kind=u1();record.index=u2();}
  else throw new Error('Unsupported JVM constant-pool tag '+tag);
  if([15,16,18].includes(tag)&&major<51||[19,20].includes(tag)&&major<53||tag===17&&major<55)throw new Error('JVM constant-pool tag contradicts class version');
  record.size=at-offset;cp[index]=record;if(tag===5||tag===6)index++;
 }
 const constant=(index,tags)=>{const value=cp[index];if(!Number.isSafeInteger(index)||index<1||index>=cp.length||!value||tags&&!tags.includes(value.tag))throw new Error('JVM constant-pool index or tag mismatch');return value;};
 const utf=index=>constant(index,[1]).value;
 const classInfo=index=>{const raw=utf(constant(index,[7]).index);if(raw.startsWith('[')){const value=parseJvmDescriptor(raw,{budget});return {class_name:value.display,descriptor:raw};}if(!internalName(raw))throw new Error('Invalid JVM internal class name');return {class_name:raw.replaceAll('/','.'),descriptor:'L'+raw+';'};};
 const nameAndType=(index,method)=>{const record=constant(index,[12]),name=utf(record.first),descriptor=utf(record.second);if(!memberName(name,method))throw new Error('Invalid JVM member name');return {name,descriptor,signature:parseJvmDescriptor(descriptor,{method,budget})};};
 function resolve(index,kind){
  if(kind==='class')return classInfo(index);
  if(kind==='field'||kind==='method'||kind==='interface-method'||kind==='method-or-interface'){
   const record=constant(index,kind==='field'?[9]:kind==='method'?[10]:kind==='interface-method'?[11]:[10,11]),type=classInfo(record.first),member=nameAndType(record.second,kind!=='field');return {...type,...member,constant_pool_kind:record.tag};
  }
  if(kind==='dynamic'){const record=constant(index,[18]);return {...nameAndType(record.second,true),bootstrap_method_index:record.first};}
  const record=constant(index,kind==='wide-constant'?[5,6,17]:[3,4,7,8,15,16,17]);
  if(record.tag===7)return {kind:'class',...classInfo(index)};
  if(record.tag===8)return {kind:'string',value:utf(record.index)};
  if(record.tag===15)return {kind:'method-handle',reference_kind:record.reference_kind,target:resolve(record.index,record.reference_kind<=4?'field':record.reference_kind===9?'interface-method':'method-or-interface')};
  if(record.tag===16)return {kind:'method-type',descriptor:utf(record.index),signature:parseJvmDescriptor(utf(record.index),{method:true,budget})};
  if(record.tag===17){const value=nameAndType(record.second,false),wide=['J','D'].includes(value.descriptor);if(kind==='wide-constant'?!wide:wide)throw new Error('JVM ldc constant width contradicts descriptor');return {kind:'dynamic-constant',...value,bootstrap_method_index:record.first};}
  return {kind:{3:'integer',4:'float',5:'long',6:'double'}[record.tag],value:record.value};
 }
 for(let index=1;index<cp.length;index++){
  budget.work();const record=cp[index];if(!record)continue;
  if(record.tag===7)classInfo(index);else if(record.tag===8)utf(record.index);else if([9,10,11].includes(record.tag))resolve(index,record.tag===9?'field':record.tag===10?'method':'interface-method');
  else if(record.tag===12){if(!memberName(utf(record.first),true))throw new Error('Invalid JVM name-and-type name');utf(record.second);}
  else if(record.tag===15){const kind=record.reference_kind;if(kind<1||kind>9)throw new Error('Invalid JVM method-handle kind');const allowed=kind<=4?[9]:kind===9?[11]:kind===5||kind===8||major<52?[10]:[10,11];const target=constant(record.index,allowed);const member=nameAndType(target.second,kind>4);if(kind===8&&member.name!=='<init>'||kind>4&&kind!==8&&['<init>','<clinit>'].includes(member.name))throw new Error('JVM method-handle constructor kind mismatch');}
  else if(record.tag===16)parseJvmDescriptor(utf(record.index),{method:true,budget});else if(record.tag===17||record.tag===18)nameAndType(record.second,record.tag===18);else if(record.tag===19||record.tag===20)utf(record.index);
 }
 const flags=u2(),ownIndex=u2(),superIndex=u2(),own=classInfo(ownIndex);if(own.descriptor.startsWith('['))throw new Error('JVM this_class is an array');const parent=superIndex?classInfo(superIndex):null;if(parent?.descriptor.startsWith('['))throw new Error('JVM superclass is an array');
 const interfaceCount=u2(),interfaces=[];budget.take('records',interfaceCount);for(let i=0;i<interfaceCount;i++)interfaces.push(classInfo(u2()).class_name);
 if(new Set(interfaces).size!==interfaces.length)throw new Error('Duplicate JVM interface');
 const limitations=['Class-file parsing and bytecode operand inventory do not execute or verify the JVM operand stack, class loading, linkage, bootstrap results or original Java source.','Only exact non-preview class-file majors 52, 55, 61, 65 and 69 are qualified. Other versions remain unsupported.'],undecodedAttributes=[];
 function attributes(context,count=u2(),end=bytes.length){
  const out=[];budget.take('records',count);const singleton=new Set();
  for(let i=0;i<count;i++){
   budget.work();need(6,end);const offset=at,name=utf(u2()),length=u4(),start=at,finish=start+length;need(length,end);const row={name,file_offset:offset,data_offset:start,size:length,sha256:digest(bytes.subarray(start,finish)),status:'raw'};
   const owners={Code:['method'],ConstantValue:['field'],SourceFile:['class'],Signature:['class','field','method'],NestHost:['class'],Exceptions:['method'],InnerClasses:['class'],BootstrapMethods:['class'],MethodParameters:['method'],LineNumberTable:['code']};if(Object.hasOwn(owners,name)&&!owners[name].includes(context))throw new Error('JVM '+name+' attribute has an invalid owner');if(name==='NestHost'&&major<55)throw new Error('JVM NestHost attribute contradicts class version');
   if(['Code','ConstantValue','SourceFile','Signature','BootstrapMethods','MethodParameters','InnerClasses','EnclosingMethod','NestHost','Exceptions'].includes(name)){if(singleton.has(name))throw new Error('Duplicate singleton JVM attribute '+name);singleton.add(name);}
   if(name==='Code'){
    if(context!=='method')throw new Error('JVM Code attribute has an invalid owner');need(8,finish);const maxStack=u2(),maxLocals=u2(),length=u4();if(length<1||length>65535)throw new Error('Invalid JVM Code length');need(length,finish);const fileOffset=at,codeBytes=bytes.subarray(at,at+length);at+=length;const decoded=decodeJvmCode(codeBytes,{resolve,budget,baseOffset:fileOffset,maxLocals}),exceptionCount=u2(),exceptions=[];budget.take('records',exceptionCount);const boundaries=new Set(decoded.instructions.map(instruction=>instruction.bytecode_offset));
    for(let j=0;j<exceptionCount;j++){need(8,finish);const start=u2(),end=u2(),handler=u2(),catchType=u2();if(start>=end||end>length||handler>=length||decoded.status==='decoded'&&(!boundaries.has(start)||end!==length&&!boundaries.has(end)||!boundaries.has(handler)))throw new Error('JVM exception range escapes instruction boundaries');exceptions.push({start,end,handler,catch_type:catchType?classInfo(catchType):null});}
    need(2,finish);const nested=attributes('code',u2(),finish),lineNumbers=nested.filter(attribute=>attribute.name==='LineNumberTable').flatMap(attribute=>attribute.entries);
    for(const line of lineNumbers)if(line.start>=length||decoded.status==='decoded'&&!boundaries.has(line.start))throw new Error('JVM line number is outside instructions');
    row.status='decoded';row.code={...decoded,file_offset:fileOffset,byte_length:length,sha256:digest(codeBytes),bytes_hex:codeBytes.toString('hex'),max_stack:maxStack,max_locals:maxLocals,exceptions,line_numbers:lineNumbers,attributes:nested};
   }else if(name==='LineNumberTable'&&context==='code'){
    need(2,finish);const n=u2();budget.take('records',n);need(n*4,finish);row.entries=Array.from({length:n},()=>({start:u2(),line:u2()}));row.status='decoded';
   }else if(['SourceFile','Signature','NestHost','ConstantValue'].includes(name)){
    if(length!==2)throw new Error('JVM '+name+' attribute length mismatch');const index=u2();row.constant_pool_index=index;
    if(name==='SourceFile'||name==='Signature')row.value=utf(index);else if(name==='NestHost')row.value=classInfo(index);else row.value=resolve(index,[5,6].includes(constant(index).tag)?'wide-constant':'constant');row.status='decoded';
   }else if(name==='Exceptions'&&context==='method'){
    need(2,finish);const n=u2();need(n*2,finish);budget.take('records',n);row.classes=Array.from({length:n},()=>classInfo(u2()));row.status='decoded';
   }else if(name==='InnerClasses'&&context==='class'){
    need(2,finish);const n=u2();need(n*8,finish);budget.take('records',n);row.classes=Array.from({length:n},()=>{const inner=u2(),outer=u2(),name=u2(),flags=u2();return {inner:classInfo(inner),outer:outer?classInfo(outer):null,name:name?utf(name):null,flags};});row.status='decoded';
   }else if(name==='BootstrapMethods'&&context==='class'){
    need(2,finish);const n=u2();budget.take('records',n);row.methods=[];for(let j=0;j<n;j++){need(4,finish);const index=u2();constant(index,[15]);const n=u2();need(n*2,finish);budget.take('records',n);row.methods.push({method_handle_index:index,target:resolve(index,'constant'),argument_indices:Array.from({length:n},()=>{const index=u2();constant(index,[3,4,5,6,7,8,15,16,17]);return index;})});}row.status='decoded';
   }else if(name==='MethodParameters'&&context==='method'){
    need(1,finish);const n=u1();need(n*4,finish);row.parameters=Array.from({length:n},()=>{const name=u2(),flags=u2();return {name:name?utf(name):null,flags};});row.status='decoded';
   }else {undecodedAttributes.push({owner:context,name,size:length,sha256:row.sha256});at=finish;}
   if(at!==finish)throw new Error('JVM '+name+' attribute extent mismatch');budget.output(row);out.push(row);
  }
  return out;
 }
 function members(method){const count=u2(),out=[],seen=new Set();budget.take('records',count);for(let i=0;i<count;i++){
  budget.work();const fileOffset=at,flags=u2(),name=utf(u2()),descriptor=utf(u2());if(!memberName(name,method))throw new Error('Invalid JVM declared member name');const signature=parseJvmDescriptor(descriptor,{method,budget}),key=name+'\0'+descriptor;if(seen.has(key))throw new Error('Duplicate JVM declared member');seen.add(key);const attrs=attributes(method?'method':'field'),code=attrs.find(attribute=>attribute.name==='Code')?.code??null;
  if(method){if(!!(flags&0x500)===!!code)throw new Error('JVM native/abstract Code presence contradicts method flags');if(!['<init>','<clinit>'].includes(name)&&name.includes('<'))throw new Error('Invalid JVM special method');if(name==='<init>'&&signature.result.descriptor!=='V'||name==='<clinit>'&&descriptor!=='()V')throw new Error('Invalid JVM initializer descriptor');const slots=signature.parameter_slots+Number(!(flags&8));if(slots>255)throw new Error('JVM declared parameter slots exceed 255');if(code&&code.max_locals<slots)throw new Error('JVM parameter slots escape max_locals');}
  const constantValue=attrs.find(attribute=>attribute.name==='ConstantValue')?.value??null;
  if(!method&&constantValue){const expected={B:'integer',C:'integer',S:'integer',Z:'integer',I:'integer',J:'long',F:'float',D:'double','Ljava/lang/String;':'string'}[descriptor];if(!expected||constantValue.kind!==expected)throw new Error('JVM ConstantValue kind contradicts field descriptor');}
  const row={name,descriptor,flags,file_offset:fileOffset,signature,attributes:attrs,...(method?{code}:{constant_value:constantValue})};budget.output(row);out.push(row);
 }return out;}
 const fields=members(false),methods=members(true),attrs=attributes('class');if(at!==bytes.length)throw new Error('Trailing JVM class bytes');const bootstraps=attrs.find(attribute=>attribute.name==='BootstrapMethods')?.methods??[];
 for(const record of cp.filter(Boolean))if(record.tag===17||record.tag===18){if(record.first>=bootstraps.length)throw new Error('JVM dynamic constant references absent bootstrap method');}
 if(undecodedAttributes.length)limitations.push('Undecoded attribute payloads retain offsets, lengths and SHA256; annotation, generic-signature and stack-map semantics are not reconstructed.');
 const result={format:'jvm-class',name:own.class_name,descriptor:own.descriptor,super_class:parent?.class_name??null,interfaces,flags,version:{major,minor},sha256:digest(bytes),bytes:bytes.length,constant_pool_count:cpCount,source_file:attrs.find(attribute=>attribute.name==='SourceFile')?.value??null,fields,methods,attributes:attrs,inner_classes:attrs.find(attribute=>attribute.name==='InnerClasses')?.classes??[],bootstrap_methods:bootstraps,undecoded_attributes:undecodedAttributes,limitations};
 let outputBytes=0;chargeJsonBytes(result,size=>{outputBytes+=size;if(outputBytes>budget.limits.output_bytes)throw Object.assign(new Error('JVM final output budget exceeded'),{code:'capacity'});},budget.work);budget.check();return result;
}

export const capabilities={qualifiedMajors:[52,55,61,65,69],builtIn:['Modified UTF-8 constant pools and JVM descriptors','Class/field/method identities and finite standard attributes','Bytecode operands, static member/type references, switches and Code exception/line records'],limitations:['No JVM execution, operand-stack verification, Java decompilation or bootstrap-result resolution.','Preview/other versions and undecoded annotation/stack-map/generic attribute semantics remain unsupported.']};
