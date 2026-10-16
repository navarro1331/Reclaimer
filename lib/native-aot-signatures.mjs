import { NativeCursor, NATIVE_HANDLE } from './native-format.mjs';
import { nativeHandle } from './native-format-metadata.mjs';
import { checkAotSignal, aotBound } from './native-aot-memory.mjs';

// Record tags and field order are official NativeFormat declarations. This
// reader is original and does not invoke or translate a vendor deserializer.
const TAG={Array:1,ByRef:2,FunctionPointer:0x25,GenericParameter:0x26,MethodVariable:0x2c,
  Modified:0x2d,Pointer:0x32,SZArray:0x37,Instantiation:0x3c,Specification:0x3e,TypeVariable:0x3f};
const fail=message=>{throw new Error('NativeFormat signature '+message);};
const capacity=message=>{throw Object.assign(new Error('NativeFormat signature '+message),{code:'capacity'});};
export function aotSignatureProvenanceBudget(options={}){
  const maximum=aotBound(options.maxSignatureProvenanceWork,1000000,1000000,'signature provenance work');
  return {maximum,used:0,take(signal){checkAotSignal(signal);if(++this.used>maximum)capacity('aggregate provenance traversal budget exceeded');}};
}

export class AotNativeSignatures {
  constructor(reader,options={}){this.reader=reader;this.records=new Map();this.cache=new Map();this.provenanceBudget=options.provenanceBudget??aotSignatureProvenanceBudget(options);}
  provenance(groups){
    const records=new Map();
    for(const group of groups)for(const record of group){
      this.provenanceBudget.take(this.reader.signal);
      const key=record.kind+':'+record.offset;if(!records.has(key))records.set(key,record);
    }
    return [...records.values()];
  }
  record(kind,offset){
    const reader=this.reader;checkAotSignal(reader.signal);
    if(!Number.isSafeInteger(offset)||offset<reader.header_size||offset>=reader.bytes.length)fail('record exceeds metadata extent');
    const key=kind+':'+offset;if(this.records.has(key))return this.records.get(key);
    if([NATIVE_HANDLE.Type,NATIVE_HANDLE.TypeReference,NATIVE_HANDLE.MethodSignature,NATIVE_HANDLE.FieldSignature].includes(kind))return reader.record(kind,offset);
    reader.budget?.take('nodes');
    const c=new NativeCursor(reader.bytes,offset,{signal:reader.signal,budget:reader.budget}),handle=()=>nativeHandle(c.u());
    const signedList=()=>{const count=c.u();reader.budget?.take('collection_items',count);if(count>250000||count>reader.bytes.length-c.offset)fail('signed collection exceeds metadata extent');return Array.from({length:count},()=>c.s());};
    let fields;
    if(kind===TAG.GenericParameter){const number=c.u();if(number>65535)fail('generic parameter number exceeds ushort');fields={number,flags:c.u(),parameter_kind:c.u(),name:c.u(),constraints:c.list().map(nativeHandle),custom_attributes:c.list()};}
    else if(kind===TAG.Instantiation)fields={generic_type:handle(),arguments:c.list().map(nativeHandle)};
    else if(kind===TAG.Specification)fields={signature:handle()};
    else if([TAG.SZArray,TAG.Pointer,TAG.ByRef].includes(kind))fields={element_type:handle()};
    else if(kind===TAG.Array)fields={element_type:handle(),rank:c.s(),sizes:signedList(),lower_bounds:signedList()};
    else if([TAG.TypeVariable,TAG.MethodVariable].includes(kind))fields={number:c.s()};
    else if(kind===TAG.FunctionPointer)fields={signature:c.u()};
    else if(kind===TAG.Modified)fields={optional:c.u(),modifier:handle(),type:handle()};
    else fail('record kind '+kind+' is unsupported');
    const value={kind,offset,size:c.offset-offset,fields};this.records.set(key,value);return value;
  }
  named(name){
    if(Buffer.byteLength(name)>65536)capacity('expanded display name exceeds 64 KiB');
    this.reader.budget?.take('expanded_name_bytes',Buffer.byteLength(name));return name;
  }
  signature(handle,{typeArity=0,methodArity=0}={},ancestors=new Set()){
    checkAotSignal(this.reader.signal);
    if(!handle||!Number.isSafeInteger(handle.kind)||!Number.isSafeInteger(handle.offset))fail('type handle is absent or malformed');
    const key=handle.kind+':'+handle.offset+':'+typeArity+':'+methodArity;
    if(ancestors.has(key)||ancestors.size>=64)fail('cycle or depth limit');
    if(this.cache.has(key))return this.cache.get(key);
    const seen=new Set(ancestors).add(key),context={typeArity,methodArity},decode=value=>this.signature(value,context,seen);
    let record,value,groups=[];
    if(handle.kind===NATIVE_HANDLE.Type){
      const type=this.reader.type(handle.offset);groups=[type.records];
      value={kind:'type-definition',handle:{kind:'TypeDefinition',offset:handle.offset},display_name:type.qualified_name,
        namespace:type.namespace,assembly:type.assembly,generic_parameter_count:type.generic_parameter_count};
    }else if(handle.kind===NATIVE_HANDLE.TypeReference){
      record=this.reader.record(handle.kind,handle.offset);const name=this.reader.string(record.fields.name);if(!name)fail('type reference has no name');
      const parent=record.fields.parent;let display,assembly,namespace;
      if(parent?.kind===NATIVE_HANDLE.NamespaceReference){const ns=this.reader.namespace(parent);namespace=ns.namespace;assembly=ns.assembly;
        if(Buffer.byteLength(namespace)+Buffer.byteLength(name)+Number(!!namespace)>65536)capacity('qualified reference exceeds 64 KiB');
        display=this.named([namespace,name].filter(Boolean).join('.'));groups=[[record],ns.records];
      }else if(parent?.kind===NATIVE_HANDLE.TypeReference){const enclosing=decode(parent);assembly=enclosing.value.assembly;namespace=enclosing.value.namespace;
        if(Buffer.byteLength(enclosing.value.display_name)+Buffer.byteLength(name)+1>65536)capacity('nested reference exceeds 64 KiB');
        display=this.named(enclosing.value.display_name+'+'+name);groups=[[record],enclosing.records];
      }else fail('type reference parent has an unsupported kind');
      value={kind:'type-reference',handle:{kind:'TypeReference',offset:handle.offset},display_name:display,namespace,assembly};
    }else{
      record=this.record(handle.kind,handle.offset);const f=record.fields;groups=[[record]];
      if(handle.kind===TAG.Specification){const child=decode(f.signature);value={kind:'type-specification',display_name:child.value.display_name,signature:child.value};groups.push(child.records);}
      else if([TAG.TypeVariable,TAG.MethodVariable].includes(handle.kind)){
        const method=handle.kind===TAG.MethodVariable,arity=method?methodArity:typeArity;
        if(f.number<0||f.number>=arity||f.number>=1024)fail('generic variable exceeds its owning arity');
        value={kind:method?'method-variable':'type-variable',number:f.number,display_name:(method?'!!':'!')+f.number};
      }else if(handle.kind===TAG.Instantiation){
        if(!f.arguments.length||f.arguments.length>1024)fail('generic instantiation has invalid arity');
        const definition=decode(f.generic_type),arguments_=f.arguments.map(decode);
        if(definition.value.kind==='type-definition'&&definition.value.generic_parameter_count!==arguments_.length)fail('generic instantiation arity contradicts its definition');
        if(!['type-definition','type-reference','type-specification'].includes(definition.value.kind))fail('generic instantiation has invalid definition kind');
        const names=arguments_.map(argument=>argument.value.display_name),size=Buffer.byteLength(definition.value.display_name)+names.reduce((sum,name)=>sum+Buffer.byteLength(name),0)+2+Math.max(0,names.length-1);
        if(size>65536)capacity('generic display name exceeds 64 KiB');
        value={kind:'generic-instantiation',display_name:this.named(definition.value.display_name+'<'+names.join(',')+'>'),definition:definition.value,arguments:arguments_.map(argument=>argument.value)};
        groups.push(definition.records);for(const argument of arguments_)groups.push(argument.records);
      }else if([TAG.SZArray,TAG.Array,TAG.Pointer,TAG.ByRef].includes(handle.kind)){
        const element=decode(f.element_type);let suffix,kind;
        if(handle.kind===TAG.Array){if(f.rank<1||f.rank>32||f.sizes.length>f.rank||f.lower_bounds.length>f.rank||f.sizes.some(size=>size<0))fail('multidimensional array shape is invalid');kind='array';suffix='['+(f.rank===1?'*':','.repeat(f.rank-1))+']';}
        else{kind=handle.kind===TAG.SZArray?'szarray':handle.kind===TAG.Pointer?'pointer':'byref';suffix=kind==='szarray'?'[]':kind==='pointer'?'*':'&';}
        if(Buffer.byteLength(element.value.display_name)+suffix.length>65536)capacity('compound display name exceeds 64 KiB');
        value={kind,display_name:this.named(element.value.display_name+suffix),element_type:element.value,...(handle.kind===TAG.Array?{rank:f.rank,sizes:f.sizes,lower_bounds:f.lower_bounds}:{})};groups.push(element.records);
      }else if(handle.kind===TAG.Modified){
        if(f.optional>1)fail('modifier optional flag is invalid');
        if(![NATIVE_HANDLE.Type,NATIVE_HANDLE.TypeReference,TAG.Specification].includes(f.modifier?.kind))fail('modifier handle kind is invalid');
        const modifier=decode(f.modifier),type=decode(f.type),prefix=f.optional?'modopt':'modreq';
        if(Buffer.byteLength(modifier.value.display_name)+Buffer.byteLength(type.value.display_name)+prefix.length+3>65536)capacity('modified display name exceeds 64 KiB');
        value={kind:'modified',optional:!!f.optional,display_name:this.named(prefix+'('+modifier.value.display_name+') '+type.value.display_name),modifier:modifier.value,type:type.value};groups.push(modifier.records,type.records);
      }else if(handle.kind===TAG.FunctionPointer){
        const method=this.method(f.signature,context,seen),names=method.value.parameters.map(parameter=>parameter.display_name),size=12+Buffer.byteLength(method.value.return_type.display_name)+names.reduce((sum,name)=>sum+Buffer.byteLength(name),0)+Math.max(0,names.length-1);
        if(size>65536)capacity('function pointer display name exceeds 64 KiB');
        const display='methodptr('+method.value.return_type.display_name+'('+names.join(',')+'))';
        value={kind:'function-pointer',display_name:this.named(display),signature:method.value};groups.push(method.records);
      }else fail('unhandled compound record kind');
    }
    const result={value,records:this.provenance(groups)};this.cache.set(key,result);return result;
  }
  method(offset,context={},ancestors=new Set()){
    const key='method:'+offset;if(ancestors.has(key)||ancestors.size>=64)fail('method signature cycle or depth limit');
    const seen=new Set(ancestors).add(key),record=this.reader.record(NATIVE_HANDLE.MethodSignature,offset),f=record.fields;
    if(f.generic_parameter_count<0||f.generic_parameter_count>1024)fail('method generic arity is invalid');
    if(f.parameters.length>1024||f.vararg_parameters.length>1024)capacity('method parameter count exceeds 1024');
    if(context.methodArity!==undefined&&context.methodArity!==f.generic_parameter_count)fail('method signature generic arity contradicts its owner');
    const decode=handle=>this.signature(handle,{...context,methodArity:f.generic_parameter_count},seen),returned=decode(f.return_type),parameters=f.parameters.map(value=>decode(nativeHandle(value))),varargs=f.vararg_parameters.map(value=>decode(nativeHandle(value)));
    if(varargs.length&&(f.calling_convention&15)!==5)fail('vararg parameters contradict calling convention');
    const groups=[[record],returned.records];for(const parameter of parameters)groups.push(parameter.records);for(const parameter of varargs)groups.push(parameter.records);
    return {value:{calling_convention:f.calling_convention,generic_parameter_count:f.generic_parameter_count,return_type:returned.value,parameters:parameters.map(parameter=>parameter.value),vararg_parameters:varargs.map(parameter=>parameter.value)},records:this.provenance(groups)};
  }
  field(offset,context={}){const record=this.reader.record(NATIVE_HANDLE.FieldSignature,offset),type=this.signature(record.fields.type,context);return {value:type.value,records:this.provenance([[record],type.records])};}
  genericParameters(offsets,kind,context={}){
    if(offsets.length>1024)capacity('generic parameter count exceeds 1024');
    const results=offsets.map(offset=>{const record=this.record(TAG.GenericParameter,offset),f=record.fields,name=this.reader.string(f.name);
      if(!name||f.parameter_kind!==kind||f.number>=offsets.length)fail('generic parameter has invalid owner kind, ordinal or name');
      const constraints=f.constraints.map(handle=>this.signature(handle,context));
      const groups=[[record]];for(const constraint of constraints)groups.push(constraint.records);
      return {value:{number:f.number,name,flags:f.flags,kind:kind===0?'type':'method',constraints:constraints.map(constraint=>constraint.value)},records:this.provenance(groups)};});
    if(new Set(results.map(result=>result.value.number)).size!==offsets.length)fail('generic parameter ordinals are duplicated');
    return {value:results.map(result=>result.value).sort((a,b)=>a.number-b.number),records:this.provenance(results.map(result=>result.records))};
  }
}
