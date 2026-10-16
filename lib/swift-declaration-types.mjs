// Independent source-type grammar for qualified 0.871/0.903/0.944 records.
// Callbacks resolve only records already bounded by the selected module bytes.
const specifiers=['default','inout','borrowing','consuming','legacy_shared','legacy_owned','implicitly_copyable_consuming'];
const representations=['swift','block','thin','c'];
const metatypes=['none','thin','thick','objc'];
const defaults=['none','normal','file_id','file_id_spelled_as_file','file_path','file_path_spelled_as_file','line','column','function','inherited','dso_handle','nil_literal','empty_array','empty_dictionary','stored_property','expression_macro'];
const compound=t=>['function','generic_function','composition'].includes(t.kind)?'('+t.expression+')':t.expression;

export function swiftCompletionGrammar({profile,type,info,identifier,indexed,bundle,records,numbers,booleans,ancestry,work,budget,invalid,isIndexed}) {
 const signatures=new Map();
 const required=(id,path,facet)=>{const value=type(id,path);if(!value)throw invalid('Swift '+facet+' type reference is null');return value;};
 function signature(id,path=new Set()) {
  work();if(!id)return null;if(signatures.has(id))return signatures.get(id);
  const next=ancestry(path,'signature:'+id),{r}=indexed('generic signature',id),v=numbers(r);
  if(r.code!==121){if(r.code===125)throw new Error('SIL generic signature grammar is unsupported');throw invalid('Swift generic signature index has a contradictory record kind');}
  if(!v.length)throw invalid('Swift generic signature requirement count is absent');
  const requirements=[];let cursor=1;
  for(let n=0;n<v[0];n++){
   work();const kind=v[cursor++];if(!Number.isSafeInteger(kind)||kind>4)throw invalid('Swift generic requirement kind or extent is invalid');
   if(kind===4){if(cursor+4>v.length)throw invalid('Swift generic layout requirement is truncated');const layout=v[cursor++],subject=required(v[cursor++],next,'layout requirement'),size=v[cursor++],alignment=v[cursor++];if(layout>9)throw invalid('Swift generic layout requirement kind is invalid');requirements.push({kind:'layout',subject,layout_kind:layout,size_bits:size,alignment_bits:alignment});}
   else {if(cursor+2>v.length)throw invalid('Swift generic requirement is truncated');const first=required(v[cursor++],next,'requirement'),second=required(v[cursor++],next,'requirement');requirements.push({kind:['same_shape','conformance','same_type','superclass'][kind],first,second});}
  }
  const parameters=v.slice(cursor).map(id=>required(id,next,'generic parameter'));
  if(!parameters.length||parameters.some(p=>p.kind!=='generic_parameter'))throw invalid('Swift generic signature parameter list is malformed');
  const keys=parameters.map(p=>p.depth+':'+p.index);if(new Set(keys).size!==keys.length)throw invalid('Swift generic signature parameter list has duplicate identities');
  const result={id,bit_offset:r.startBit,parameters,requirements,record_code:r.code,values:[...v]};signatures.set(id,result);return result;
 }
 function functionParameter(r,path) {
  work();const v=numbers(r);if(v.length!==profile.functionParameterFields)throw invalid('Swift function type parameter record is malformed');booleans(v,[3,4,5,7,8,...Array.from({length:v.length-9},(_,n)=>9+n)]);if(!specifiers[v[6]])throw invalid('Swift function parameter specifier is invalid');
  return {label:identifier(v[0],{empty:true}),internal_label:identifier(v[1],{empty:true}),type:required(v[2],path,'function parameter'),is_variadic:!!v[3],is_autoclosure:!!v[4],is_non_ephemeral:!!v[5],specifier:specifiers[v[6]],is_isolated:!!v[7],is_no_derivative:!!v[8],...(profile.minor===944?{is_compile_time_literal:!!v[9],is_const:!!v[10],is_addressable:!!v[12]}:{is_compile_time_const:!!v[9]}),...(profile.legacy?{is_result_depends_on:!!v[10]}:{}),is_sending:!!v[profile.sendingParameter],bit_offset:r.startBit};
 }
 function decode({r,i,v,next}) {
  if([7,19].includes(r.code)){
   const generic=r.code===19;if(v.length!==(generic?10:11))throw invalid('Swift function type record is malformed');
   const positions=generic?{sendable:2,async:3,throws:4,error:5,diff:6,isolation:7,sending:8}:{sendable:4,async:5,throws:6,error:7,diff:8,isolation:9,sending:10};
   booleans(v,[positions.sendable,positions.async,positions.throws,positions.sending,...(generic?[]:[3])]);if(!representations[v[1]]||v[positions.diff]>4)throw invalid('Swift function type representation or differentiability is invalid');
   if(!v[positions.throws]&&v[positions.error])throw invalid('Nonthrowing Swift function stores a thrown error type');
   const result=required(v[0],next,'function result'),parameters=[];let at=i+1;
   while(records[at]?.code===8){if(isIndexed(records[at].startBit))throw invalid('Swift function parameter tail is independently indexed');parameters.push(functionParameter(records[at++],next));}
   if(records[at]?.code===158)throw new Error('Swift function lifetime dependence grammar is unsupported');
   const isolated=v[positions.isolation],isolation=isolated<profile.isolationOffset?{kind:['nonisolated','parameter','erased','nonisolated_caller'][isolated]}:{kind:'global_actor',type:required(isolated-profile.isolationOffset,next,'function isolation')};
   const thrown=v[positions.error]?required(v[positions.error],next,'thrown error'):null,genericSignature=generic?signature(v[9],next):null;if(generic&&!genericSignature)throw invalid('Swift generic function signature reference is null');
   const prefix=(v[1]?'@convention('+representations[v[1]]+') ':'')+(v[positions.sendable]?'@Sendable ':'')+(generic?'<'+genericSignature.parameters.map(p=>p.expression).join(', ')+'> ':'');
   const expression=budget.text(prefix+'('+parameters.map(p=>(p.label?p.label+': ':'')+(p.specifier==='default'?'':p.specifier+' ')+p.type.expression+(p.is_variadic?'...':'')).join(', ')+')'+(v[positions.async]?' async':'')+(v[positions.throws]?' throws'+(thrown?'('+thrown.expression+')':''):'')+' -> '+(v[positions.sending]?'sending ':'')+result.expression);
   return {kind:generic?'generic_function':'function',expression,canonical:expression,result,parameters,representation:representations[v[1]],foreign_type_id:generic?null:v[2],is_noescape:generic?null:!!v[3],is_sendable:!!v[positions.sendable],is_async:!!v[positions.async],is_throwing:!!v[positions.throws],thrown_error:thrown,differentiability_kind:v[positions.diff],isolation,sending_result:!!v[positions.sending],generic_signature:genericSignature};
  }
  if([9,28].includes(r.code)){
   if(v.length!==2||!metatypes[v[1]])throw invalid('Swift metatype record is malformed');const instance=required(v[0],next,'metatype instance'),expression=budget.text(compound(instance)+(r.code===9?'.Type':'.Protocol'));
   return {kind:r.code===9?'metatype':'existential_metatype',expression,canonical:expression,instance,representation:metatypes[v[1]]};
  }
  if(r.code===27){if(v.length!==1)throw invalid('Swift dynamic Self record is malformed');const self=required(v[0],next,'dynamic Self');return {kind:'dynamic_self',expression:'Self',canonical:'Self',self_type:self};}
  if(r.code===40&&profile.legacy){if(v.length!==1)throw invalid('Swift parenthesized type record is malformed');const inner=required(v[0],next,'parenthesized');return {...inner,expression:budget.text('('+inner.expression+')'),canonical:inner.canonical,wrapper_code:r.serialized_code};}
  if(r.code===3){if(v.length!==2)throw invalid('Swift dependent member record is malformed');const base=required(v[0],next,'dependent member base'),member=info(v[1]);if(member.kind!=='associated_type'&&member.kind!=='external')throw invalid('Swift dependent member references a non-associated declaration');const name=member.name.split('.').at(-1),expression=budget.text(compound(base)+'.'+name);return {kind:'dependent_member',expression,canonical:expression,base,associated_type_decl_id:member.id,associated_type:member.qualified};}
  if(r.code===20){if(v.length!==1)throw invalid('Swift array type record is malformed');const element=required(v[0],next,'array element'),expression=budget.text('['+element.expression+']');return {kind:'array',expression,canonical:expression,element};}
  if(r.code===21){if(v.length!==2)throw invalid('Swift dictionary type record is malformed');const key=required(v[0],next,'dictionary key'),value=required(v[1],next,'dictionary value'),expression=budget.text('['+key.expression+': '+value.expression+']');return {kind:'dictionary',expression,canonical:expression,key,value};}
  return null;
 }
 function callable(d,v) {
  if(d.kind!=='function')return null;
  let at=d.bundle.index+1;while(records[at]?.code===120){work();at++;}
  const list=records[at];if(list?.code!==100)return null;
  if(isIndexed(list.startBit))throw invalid('Swift callable parameter list is independently indexed');
  const references=numbers(list);if(new Set(references).size!==references.length)throw invalid('Swift callable parameter list repeats a declaration');
  const parameters=references.map(id=>{
   work();const {r}=bundle(id),p=numbers(r),def=profile.defaultArgument;if(r.code!==56||p.length!==profile.parameterFields)throw invalid('Swift callable parameter declaration is malformed');booleans(p,Array.from({length:def-5},(_,n)=>n+5));if(p[2]!==d.id)throw invalid('Swift callable parameter context contradicts its owner');if(!specifiers[p[3]]||!defaults[p[def]]||p[def+2]>profile.actorIsolationMax)throw invalid('Swift callable parameter specifier or default argument kind is invalid');
   let text=null;if(r.blob)try{text=budget.text(new TextDecoder('utf-8',{fatal:true}).decode(r.blob));}catch(error){if(error.code==='capacity')throw error;throw invalid('Swift default argument text is invalid UTF-8');}
   return {id,label:identifier(p[0],{empty:true}),name:identifier(p[1],{empty:true}),specifier:specifiers[p[3]],type:required(p[4],new Set(),'callable parameter'),is_iuo:!!p[5],is_variadic:!!p[6],is_autoclosure:!!p[7],is_isolated:!!p[8],...(profile.minor===944?{is_compile_time_literal:!!p[9],is_const:!!p[10],is_caller_isolated:!!p[12]}:{is_compile_time_const:!!p[9]}),is_sending:!!p[profile.minor===944?11:10],default_argument:{kind:defaults[p[def]],type:p[def+1]?required(p[def+1],new Set(),'default argument'):null,isolation_kind:p[def+2],global_actor:p[def+3]?required(p[def+3],new Set(),'default argument actor'):null,text},bit_offset:r.startBit};
  });
  return {parameters,result:v[11]?required(v[11],new Set(),'callable result'):null,generic_signature:signature(v[10]),is_async:!!v[7],is_throwing:!!v[8],thrown_error:v[9]?required(v[9],new Set(),'callable thrown error'):null,parameter_list_bit_offset:list.startBit};
 }
 return {decode,signature,callable};
}
