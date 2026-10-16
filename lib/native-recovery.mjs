import Ajv2020 from 'ajv/dist/2020.js';
import { outputSchema } from './contracts.mjs';
import { digest, hex } from './artifact-binary.mjs';
import { aotMemory, checkAotSignal } from './native-aot-memory.mjs';
import { projectNativeAotRecovery } from './native-aot.mjs';

const checkType = new Ajv2020({strict:false,addUsedSchema:false}).compile(outputSchema('inspect_native_data_type'));
function dataType(record, instance = false, identity = null) {
  const layout=record.layout;
  return {status:'available',reason:null,id:instance?record.type_id:record.id,name:identity?.qualified_name??record.name,
    kind:'struct',source:'analysis-database',source_archive:'Reclaimer owned transient NativeAOT analysis',
    address:record.address,size_bytes:layout.size_bytes,alignment_bytes:layout.alignment_bytes,
    packing_enabled:null,referenced_type:null,array_count:null,array_stride_bytes:null,
    fields:layout.fields.map((field,ordinal)=>({ordinal,name:field.name,offset_bytes:field.offset_bytes,
      size_bytes:field.size_bytes,type_id:field.type,bit_size:null,bit_offset:null,status:'observed',flexible_tail:'unknown'})),
    members:[],total_fields:layout.fields.length,truncated:!layout.complete,
    limitations:instance?[...record.limitations,`Instance method-table pointer: ${record.method_table_address}. Only recorded storage fields are defined.`]:identity?[...record.limitations.filter(value=>!value.startsWith('Generated method-table name is an address label;')), 'The type name is derived from selected metadata and a validated method-table association. The legacy original_name field remains null under the unchanged wire contract.','Fields describe fixed method-table storage, not original managed instance or field layouts.']:record.limitations,
    ...(!instance&&record.metadata_recovery?{metadata_recovery:identity?{...structuredClone(record.metadata_recovery),name_origin:'inferred',original_name:null,limitations:[...record.metadata_recovery.limitations.filter(value=>!value.startsWith('Generated method-table name is an address label;')),'Identity association is retained in raw_result; no runtime loading or source-file authority is established.']}:structuredClone(record.metadata_recovery)}:{})};
}

// Construct and validate the entire replacement before exposing any annotation.
// This owns a transient analysis database; it never modifies a vendor database.
export function stageNativeRecovery(detail, sourceBytes, model, signal) {
  checkAotSignal(signal);
  if(digest(sourceBytes)!==detail.source_sha256)throw new Error('NativeAOT staging source SHA256 mismatch');
  const types=new Map(),addresses=new Map(),ranges=[],aliases=new Map(),identities=new Map(),recordsById=new Map(),bindingChecks=new Set();let derivedBytes=0;
  function verifiedIdentity(record,memory){
    const identity=record.identity;if(!identity||identity.binding_status!=='associated'||identity.method_table_address!==record.address)return null;
    if(typeof identity.qualified_name!=='string'||!identity.qualified_name.length||Buffer.byteLength(identity.qualified_name)>65536||identity.qualified_name.includes('\0'))throw new Error('NativeAOT associated identity name is invalid');
    if(!Array.isArray(identity.source_bindings)||identity.source_bindings.length===0||identity.source_bindings.length>4096)throw new Error('NativeAOT associated identity lacks bounded selected-byte bindings');
    for(const binding of identity.source_bindings){
      checkAotSignal(signal);
      const key=JSON.stringify(binding);if(bindingChecks.has(key))continue;if(bindingChecks.size>=200000)throw Object.assign(new Error('NativeAOT identity binding aggregate budget exceeded'),{code:'capacity'});
      if(!Number.isSafeInteger(binding.size_bytes)||binding.size_bytes<1||binding.size_bytes>16*1024*1024||typeof binding.address!=='string'||!/^0x[0-9a-f]+$/i.test(binding.address)||!Number.isSafeInteger(binding.file_offset)&&binding.file_offset!==null)throw new Error('NativeAOT identity byte binding is malformed');
      const found=memory.locate(BigInt(binding.address),binding.size_bytes),bytes=memory.read(BigInt(binding.address),binding.size_bytes);
      if(!found||found.file_offset!==binding.file_offset||!bytes||digest(bytes)!==binding.sha256)throw new Error('NativeAOT identity byte binding does not match selected memory');
      bindingChecks.add(key);
    }
    return structuredClone(identity);
  }
  function alias(name,id){const old=aliases.get(name);if(old===undefined)aliases.set(name,id);else if(old!==id)aliases.set(name,null);}
  function adopt(record,instance,memory){
    if(types.size>=20000)throw Object.assign(new Error('NativeAOT transient datatype aggregate budget exceeded'),{code:'capacity'});
    const identity=instance?null:verifiedIdentity(record,memory),value=dataType(record,instance,identity);
    if(!checkType(value))throw new Error('Recovered NativeAOT datatype does not satisfy the public contract: '+JSON.stringify(checkType.errors));
    if(types.has(value.id)||addresses.has(record.address))throw new Error('Ambiguous NativeAOT type/instance commitment');
    types.set(value.id,value);addresses.set(record.address,value.id);recordsById.set(value.id,record);
    alias(record.name,value.id);alias(value.name,value.id);if(identity){identities.set(value.id,identity);if(identity.assembly?.name)alias(identity.assembly.name+'::'+identity.qualified_name,value.id);}
  }
  for(const module of detail.modules){
    checkAotSignal(signal);
    const reconstruction=module.reconstruction;
    if(reconstruction&&aotMemory(sourceBytes,model.segments).containsDestination(reconstruction.address,reconstruction.bytes.length)){
      derivedBytes+=reconstruction.bytes.length;
      if(derivedBytes>16*1024*1024)throw Object.assign(new Error('NativeAOT transient reconstructed byte aggregate budget exceeded'),{code:'capacity'});
      const start=reconstruction.address,end=start+BigInt(reconstruction.bytes.length);
      if(ranges.some(range=>start<range.end&&end>range.start))throw new Error('Overlapping NativeAOT reconstructed ranges cannot be committed');
      ranges.push({start,end,bytes:Buffer.from(reconstruction.bytes),sha256:reconstruction.sha256});
    }
    const memory=aotMemory(sourceBytes,model.segments,reconstruction&&aotMemory(sourceBytes,model.segments).containsDestination(reconstruction.address,reconstruction.bytes.length)?reconstruction:null);
    for(const record of module.types)adopt(record,false,memory);
    for(const record of module.instances)adopt(record,true,memory);
  }
  const semanticName=address=>{const id=addresses.get(address);return id&&identities.has(id)?types.get(id).name:null;};
  for(const value of types.values())if(value.metadata_recovery){const metadata=value.metadata_recovery;metadata.related_type=metadata.related_type?{...metadata.related_type,type:semanticName(metadata.related_type.address)??metadata.related_type.type}:null;metadata.interfaces=metadata.interfaces.map(item=>({...item,type:semanticName(item.address)??item.type}));}
  const records=projectNativeAotRecovery(detail,{typeAddresses:detail.modules.flatMap(m=>m.types.map(t=>t.address)),instanceAddresses:detail.modules.flatMap(m=>m.instances.map(i=>i.address))}).map(record=>({...record,types:record.types.map(item=>({...item,type:types.get(addresses.get(item.address))?.name??item.type}))}));
  checkAotSignal(signal);
  return {source_sha256:detail.source_sha256,types,addresses,ranges,records,aliases,identities,recordsById,identity_recovery:detail.identity_recovery??null};
}

export function recoveredType(session,args){
  const recovery=session.nativeRecovery;if(!recovery)return null;
  if(args.address){const selected=args.address.startsWith('ram:')?args.address.slice(4):args.address;if(selected.includes(':'))return null;const value=BigInt(selected.startsWith('0x')?selected:'0x'+selected),id=recovery.addresses.get(hex(value));return id?recovery.types.get(id):null;}
  if(recovery.types.has(args.type))return recovery.types.get(args.type);
  if(recovery.aliases?.has(args.type)){const id=recovery.aliases.get(args.type);return id?recovery.types.get(id):null;}
  return [...recovery.types.values()].find(type=>type.name===args.type)??null;
}

export function recoveredTypeEvidence(session,value){
  const recovery=session.nativeRecovery,id=value?.id,identity=recovery?.identities?.get(id);
  if(!identity)return null;
  const out={nativeaot_identity:structuredClone(identity),source_sha256:recovery.source_sha256};
  const modules=(recovery.identity_recovery?.modules??[]).filter(module=>module.types.some(type=>
    type.binding_status==='associated'&&type.handle.kind===identity.handle.kind&&type.handle.offset===identity.handle.offset&&
    type.method_table_address===value.address&&type.qualified_name===identity.qualified_name&&
    JSON.stringify(type.assembly)===JSON.stringify(identity.assembly)&&JSON.stringify(type.scope_identity)===JSON.stringify(identity.scope_identity)));
  if(modules.length===1){
    const module=modules[0],owned=member=>member.binding_status==='associated'&&
      member.declaring_type_handle.kind===identity.handle.kind&&member.declaring_type_handle.offset===identity.handle.offset&&
      member.declaring_method_table_address===value.address;
    out.nativeaot_members=structuredClone({header_address:module.header_address,methods:module.methods.filter(owned),fields:module.fields.filter(owned),
      limitations:['Recorded reflection entrypoints may be stubs; instance field offsets do not establish complete layouts or execution.']});
  }
  return out;
}

export function recoveredBytes(session,address,length){
  const recovery=session.nativeRecovery;if(!recovery)return null;
  const start=BigInt(address),range=recovery.ranges.find(range=>start>=range.start&&start<range.end);
  if(!range)return null;
  return range.bytes.subarray(Number(start-range.start),Math.min(range.bytes.length,Number(start-range.start)+length));
}

export function recoveredRange(session,address){
  const start=BigInt(address),range=session.nativeRecovery?.ranges.find(range=>start>=range.start&&start<range.end);
  return range?{address:hex(range.start),size_bytes:range.bytes.length,sha256:range.sha256,file_offset:null}:null;
}
