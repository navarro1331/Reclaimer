import Ajv2020 from 'ajv/dist/2020.js';
import { outputSchema } from './contracts.mjs';
import { digest, hex } from './artifact-binary.mjs';
import { aotMemory, checkAotSignal } from './native-aot-memory.mjs';
import { projectNativeAotRecovery } from './native-aot.mjs';

const checkType = new Ajv2020({strict:false,addUsedSchema:false}).compile(outputSchema('inspect_native_data_type'));
function dataType(record, instance = false) {
  const layout=record.layout;
  return {status:'available',reason:null,id:instance?record.type_id:record.id,name:record.name,
    kind:'struct',source:'analysis-database',source_archive:'Reclaimer owned transient NativeAOT analysis',
    address:record.address,size_bytes:layout.size_bytes,alignment_bytes:layout.alignment_bytes,
    packing_enabled:null,referenced_type:null,array_count:null,array_stride_bytes:null,
    fields:layout.fields.map((field,ordinal)=>({ordinal,name:field.name,offset_bytes:field.offset_bytes,
      size_bytes:field.size_bytes,type_id:field.type,bit_size:null,bit_offset:null,status:'observed',flexible_tail:'unknown'})),
    members:[],total_fields:layout.fields.length,truncated:!layout.complete,
    limitations:instance?[...record.limitations,`Instance method-table pointer: ${record.method_table_address}. Only recorded storage fields are defined.`]:record.limitations,
    ...(!instance&&record.metadata_recovery?{metadata_recovery:record.metadata_recovery}:{})};
}

// Construct and validate the entire replacement before exposing any annotation.
// This owns a transient analysis database; it never modifies a vendor database.
export function stageNativeRecovery(detail, sourceBytes, model, signal) {
  checkAotSignal(signal);
  if(digest(sourceBytes)!==detail.source_sha256)throw new Error('NativeAOT staging source SHA256 mismatch');
  const types=new Map(),addresses=new Map(),ranges=[];let derivedBytes=0;
  function adopt(record,instance){
    if(types.size>=20000)throw Object.assign(new Error('NativeAOT transient datatype aggregate budget exceeded'),{code:'capacity'});
    const value=dataType(record,instance);
    if(!checkType(value))throw new Error('Recovered NativeAOT datatype does not satisfy the public contract: '+JSON.stringify(checkType.errors));
    if(types.has(value.id)||addresses.has(record.address))throw new Error('Ambiguous NativeAOT type/instance commitment');
    types.set(value.id,value);addresses.set(record.address,value.id);
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
    for(const record of module.types)adopt(record,false);
    for(const record of module.instances)adopt(record,true);
  }
  const records=projectNativeAotRecovery(detail,{typeAddresses:detail.modules.flatMap(m=>m.types.map(t=>t.address)),instanceAddresses:detail.modules.flatMap(m=>m.instances.map(i=>i.address))});
  checkAotSignal(signal);
  return {source_sha256:detail.source_sha256,types,addresses,ranges,records};
}

export function recoveredType(session,args){
  const recovery=session.nativeRecovery;if(!recovery)return null;
  if(args.address){const selected=args.address.startsWith('ram:')?args.address.slice(4):args.address;if(selected.includes(':'))return null;const value=BigInt(selected.startsWith('0x')?selected:'0x'+selected),id=recovery.addresses.get(hex(value));return id?recovery.types.get(id):null;}
  return recovery.types.get(args.type)??[...recovery.types.values()].find(type=>type.name===args.type)??null;
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
