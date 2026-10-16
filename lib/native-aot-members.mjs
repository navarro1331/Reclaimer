import { digest, hex } from './artifact-binary.mjs';
import { NativeCursor, nativeHashtable } from './native-format.mjs';
import { checkAotSignal } from './native-aot-memory.mjs';

const control=error=>error.code==='capacity'||error.name==='AbortError'||error.code==='cancelled';
const unique=bindings=>[...new Map(bindings.map(binding=>[JSON.stringify(binding),binding])).values()];

// These finite packet shapes are established by owned compiler output and the
// official InvokeTableFlags/FieldTableFlags declarations. Unsupported variants
// remain inventories and cannot lend an unrelated member an address or offset.
export function associateNativeAotMembers({invoke,fields,references,memory,output,pointerSize,binding,budget,charge,retain,signal}) {
  checkAotSignal(signal);
  const owners=new Map(output.types.filter(type=>type.binding_status==='associated'&&(!type.generic_parameter_count||type.identity_kind==='constructed-generic')).map(type=>[type.method_table_address,type]));
  const fixed=new Map(output.extra_types.map(type=>[type.address,type]));
  const memberIndexes={method:new Map(),field:new Map()};
  for(const [kind,list]of [['method',output.methods],['field',output.fields]])for(const member of list){const key=member.declaring_type_handle.offset+':'+member.handle.offset+':'+(member.identity_kind==='constructed-context'?member.declaring_method_table_address:'nominal'),old=memberIndexes[kind].get(key)??[];old.push(member);memberIndexes[kind].set(key,old);}
  const candidates=[];
  const resolve=index=>{
    if(!Number.isSafeInteger(index)||index<0||index>=references.bytes.length/4)return null;
    const slot=index*4,address=references.address+BigInt(slot)+BigInt(references.bytes.readInt32LE(slot));
    return {address,proof:()=>binding(references,slot,4,'common-fixup-relative-member-pointer')};
  };
  for(const [map,kind] of [[invoke,'method'],[fields,'field']]){
    if(!map)continue;
    const begin=candidates.length;
    try{
      const table=nativeHashtable(map.bytes,{signal,budget}),ends=[...new Set(table.entries.map(entry=>entry.target))].sort((a,b)=>a-b),positions=new Map(ends.map((at,index)=>[at,ends[index+1]??map.bytes.length]));
      for(const entry of table.entries){
        checkAotSignal(signal);
        if(entry.target<table.entry_end)throw new Error('Reflection member packet overlaps its bucket table');
        const end=positions.get(entry.target),c=new NativeCursor(map.bytes.subarray(0,end),entry.target,{signal,budget}),flags=c.u();
        if(kind==='method'&&flags!==0x24&&flags!==0x2c||kind==='field'&&flags!==0x28){retain(output.diagnostics,`${kind==='method'?'InvokeMap':'FieldAccessMap'} entry at ${hex(map.address+BigInt(entry.target))} has unsupported flags ${hex(flags)}; no member association is inferred.`);continue;}
        const first=c.u(),second=c.u(),last=c.u(),ownerIndex=kind==='method'?second:first,token=kind==='method'?first:second,ownerRef=resolve(ownerIndex),owner=ownerRef&&owners.get(hex(ownerRef.address));
        if(!owner||token>=0x1000000){retain(output.diagnostics,`${kind} reflection map has no unique non-generic owner or supported metadata offset.`);continue;}
        const hash=Number(BigInt(owner.runtime_hash_code));
        if(entry.hash!==(hash&255)||entry.bucket!==((hash>>>8)&(table.bucket_count-1))){retain(output.diagnostics,`${kind} reflection-map hash/bucket contradicts its recorded owner method-table hash.`);continue;}
        const matched=memberIndexes[kind].get(owner.handle.offset+':'+token+':'+(owner.identity_kind==='constructed-generic'?owner.method_table_address:'nominal'))??[];
        if(matched.length!==1){retain(output.diagnostics,`${kind} reflection map member token does not have unique ownership by ${owner.qualified_name}.`);continue;}
        const member=matched[0];let target=null,codeProof=null;
        if(kind==='method'){
          if(member.generic_parameter_count){retain(output.diagnostics,`InvokeMap non-generic packet contradicts generic method declaration ${member.qualified_name}.`);continue;}
          const code=resolve(last);
          if(!code||!memory.executable(code.address)){retain(output.diagnostics,`InvokeMap target for ${member.qualified_name} is not uniquely executable mapped memory.`);continue;}
          const tail=memory.tail(code.address),description=tail?.length?memory.describe(code.address,Math.min(16,tail.length)):null;
          if(!description||description.source!=='source-file'){retain(output.diagnostics,`InvokeMap entrypoint for ${member.qualified_name} has no unique selected-file bytes.`);continue;}
          const size=description.size_bytes;budget.take('bindings');budget.take('capture_bytes',size);
          codeProof={section_id:null,address:hex(code.address),size_bytes:size,file_offset:description.file_offset,sha256:digest(memory.read(code.address,size)),role:'invoke-map-selected-executable-bytes'};
          target={target_address:hex(code.address),entrypoint_kind:'recorded-reflection-entrypoint',entrypoint_fixup:code.proof()};
        }else{
          const type=fixed.get(owner.method_table_address),raw=memory.read(ownerRef.address,16+pointerSize),base=type?.base_size_bytes??raw?.readUInt32LE(4),element=raw?(raw.readUInt32LE(0)>>>26)&31:null;
          const unboxed=element>=2&&element<=18,min=unboxed?0:pointerSize,extent=base-pointerSize*(unboxed?2:1);
          if(member.flags&0x50||!Number.isSafeInteger(last)||!base||last<min||last>=extent){retain(output.diagnostics,`FieldAccessMap instance offset or field flags contradict the fixed owner extent for ${member.qualified_name}.`);continue;}
          target={offset_bytes:last,storage_class:'instance',field_size_bytes:null,offset_basis:unboxed?'unboxed-value-data':'object-address'};
        }
        const added=[binding(map,entry.offset,entry.size,kind==='method'?'invoke-map-bucket-entry':'field-access-map-bucket-entry'),binding(map,entry.target,c.offset-entry.target,kind==='method'?'invoke-map-member-owner-entrypoint':'field-access-map-member-owner-offset'),ownerRef.proof(),...(kind==='method'?[target.entrypoint_fixup,codeProof]:[])];
        const limitations=[kind==='method'?'A recorded reflection entrypoint can be an invocation or unboxing stub; original IL and complete native body extent are not reconstructed.':'An instance field offset does not decode field width, GC ownership or a complete original instance layout.'];
        const proof=unique([...member.source_bindings,...owner.source_bindings,...added]),value={member,kind,declaring_method_table_address:owner.method_table_address,reflection_map_flags:hex(flags),...(kind==='method'?{target_address:target.target_address,entrypoint_kind:target.entrypoint_kind}:{offset_bytes:target.offset_bytes,storage_class:target.storage_class,field_size_bytes:null,offset_basis:target.offset_basis}),source_bindings:proof,limitations};
        charge({declaring_method_table_address:value.declaring_method_table_address,reflection_map_flags:value.reflection_map_flags,...target,source_bindings:unique([...owner.source_bindings,...added]),limitations});
        candidates.push(value);
      }
    }catch(error){checkAotSignal(signal);if(control(error))throw error;candidates.splice(begin);retain(output.diagnostics,`${kind} reflection-map pass is incomplete: ${error.message}; no associations from this map are retained.`);}
  }
  const grouped=new Map();for(const candidate of candidates){const old=grouped.get(candidate.member)??[];old.push(candidate);grouped.set(candidate.member,old);}
  for(const [member,list] of grouped){
    checkAotSignal(signal);
    const keys=new Set(list.map(value=>JSON.stringify([value.declaring_method_table_address,value.target_address??null,value.offset_bytes??null,value.storage_class??null])));
    if(keys.size!==1){retain(output.conflicts,{member_handle:member.handle,declaring_type_handle:member.declaring_type_handle,candidates:list.map(({member:ignored,...value})=>value),reason:'Reflection map gives contradictory member targets or offsets; association suppressed.'});continue;}
    const {member:ignored,kind,...value}=list[0];
    Object.assign(member,value,{binding_status:'associated'});
  }
}
