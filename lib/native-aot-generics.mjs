import { digest, hex } from './artifact-binary.mjs';
import { NativeCursor, nativeHashtable } from './native-format.mjs';
import { checkAotSignal } from './native-aot-memory.mjs';
import { decodeAotMethodTable } from './native-aot-types.mjs';

const unique=bindings=>[...new Map(bindings.map(binding=>[JSON.stringify(binding),binding])).values()];
const control=error=>error.code==='capacity'||error.name==='AbortError'||error.code==='cancelled';

// This finite layout profile comes from authored .NET 8 win-x64 compiler
// specimens and the declared fixed header/EETypeField order. It is not a
// general decoder for optional, imported, dynamic or multi-argument tails.
export function associateNativeAotConstructed({bytes,model,module,output,memory,references,maps,binding,budget,charge,retain,options,maximumTypes}){
  const signal=options.signal;checkAotSignal(signal);
  const pe=bytes.length>=64&&bytes.readUInt16LE(0)===0x5a4d?bytes.readUInt32LE(60):-1;
  if(pe<0||pe+26>bytes.length||bytes.readUInt32LE(pe)!==0x4550||bytes.readUInt16LE(pe+4)!==0x8664||bytes.readUInt16LE(pe+24)!==0x20b||module.format_major!==9||module.format_minor!==1)return;
  const candidates=new Map(),originalTypes=[...output.types],originalMembers={methods:[...output.methods],fields:[...output.fields]};
  const namedTypes=new Map(),memberIndexes={method:new Map(),field:new Map()},memberTokens={method:new Set(),field:new Set()};
  for(const type of originalTypes.filter(type=>type.binding_status==='associated')){const old=namedTypes.get(type.method_table_address)??[];old.push(type);namedTypes.set(type.method_table_address,old);}
  for(const [kind,list]of [['method',originalMembers.methods],['field',originalMembers.fields]])for(const member of list){const key=member.declaring_type_handle.offset+':'+member.handle.offset,old=memberIndexes[kind].get(key)??[];old.push(member);memberIndexes[kind].set(key,old);memberTokens[kind].add(member.handle.offset);}
  const named=address=>namedTypes.get(hex(address))??[];
  const pending=[],processed=new Set(),existing=new Map([...module.types,...output.extra_types].map(type=>[type.address,type]));
  const evidence=(address,size,role)=>{const source=memory.describe(address,size),raw=memory.read(address,size);if(!source||!raw)return null;budget.take('bindings');budget.take('capture_bytes',size);return {section_id:source.source==='rehydrated-memory'?207:null,address:hex(address),size_bytes:size,file_offset:source.file_offset,sha256:digest(raw),role,...(source.source==='rehydrated-memory'?{derived_memory_sha256:module.reconstruction.sha256}:{})};};
  const unresolved=(address,reason,details={})=>retain(output.constructed_candidates,{method_table_address:hex(address),status:'unresolved',reason,...details});
  for(const [map,kind]of maps){
    if(!map)continue;const mapPending=[];
    try{
      const table=nativeHashtable(map.bytes,{signal,budget}),starts=[...new Set(table.entries.map(entry=>entry.target))].sort((a,b)=>a-b),ends=new Map(starts.map((start,index)=>[start,starts[index+1]??map.bytes.length]));
      for(const entry of table.entries){
        checkAotSignal(signal);if(entry.target<table.entry_end)throw new Error('Constructed owner packet overlaps bucket entries');
        const c=new NativeCursor(map.bytes.subarray(0,ends.get(entry.target)),entry.target,{signal,budget}),flags=c.u();
        if(kind==='method'&&![0x24,0x2c,0x36].includes(flags)||kind==='field'&&flags!==0x28)continue;
        const first=c.u(),second=c.u(),ownerIndex=kind==='method'?second:first,token=kind==='method'?first:second;
        if(token>=0x1000000||ownerIndex>=references.bytes.length/4)continue;
        const slot=ownerIndex*4,address=references.address+BigInt(slot)+BigInt(references.bytes.readInt32LE(slot)),head=memory.read(address,24);
        if(!head)continue;const mtFlags=head.readUInt32LE(0);
        if(!(mtFlags&0x02000000)||((mtFlags>>>16)&3)!==0)continue;
        if(processed.has(hex(address))||mapPending.some(item=>item.identity.method_table_address===hex(address)))continue;
        if(!memberTokens[kind].has(token))continue;
        if(mtFlags&0x81dc0000||((mtFlags>>>26)&31)!==20){unresolved(address,'Unsupported constructed generic tail flags or element kind.',{flags:hex(mtFlags)});continue;}
        const fixed=24+8*(head.readUInt16LE(16)+head.readUInt16LE(18));
        if(fixed>24+16384){unresolved(address,'Constructed fixed header exceeds slot/interface budget.');continue;}
        const tail=memory.read(address+BigInt(fixed),16);
        if(!tail){unresolved(address,'Constructed relative tail is not uniquely backed.');continue;}
        const definitionAddress=address+BigInt(fixed+8)+BigInt(tail.readInt32LE(8)),argumentAddress=address+BigInt(fixed+12)+BigInt(tail.readInt32LE(12));
        const definitions=named(definitionAddress).filter(type=>type.generic_parameter_count===1&&(memberIndexes[kind].get(type.handle.offset+':'+token)??[]).length===1),arguments_=named(argumentAddress).filter(type=>!type.generic_parameter_count);
        if(definitions.length!==1||arguments_.length!==1||tail.readInt32LE(8)&1||tail.readInt32LE(12)&1){unresolved(address,'No unique validated one-argument definition/argument identity; shared canonical or imported arguments remain unknown.',{generic_definition_address:hex(definitionAddress),generic_argument_address:hex(argumentAddress)});continue;}
        const definition=definitions[0],argument=arguments_[0],members=memberIndexes[kind].get(definition.handle.offset+':'+token),definitionType=existing.get(definition.method_table_address),hash=head.readUInt32LE(20);
        if(definitionType?.kind!=='generic-definition'||definitionType.generic_parameter_count!==1||entry.hash!==(hash&255)||entry.bucket!==((hash>>>8)&(table.bucket_count-1))){unresolved(address,'Definition kind/arity or owner hash/bucket does not validate.');continue;}
        const size=Buffer.byteLength(definition.qualified_name)+Buffer.byteLength(argument.qualified_name)+2;if(size>65536)throw Object.assign(new Error('Constructed generic qualified name exceeds 64 KiB'),{code:'capacity'});budget.take('expanded_name_bytes',size);
        const qualified=definition.qualified_name+'<'+argument.qualified_name+'>',already=named(address);
        if(already.length&&already.some(type=>type.qualified_name!==qualified)){unresolved(address,'Existing nominal association conflicts with constructed identity.');continue;}
        let type=existing.get(hex(address));if(!type){if(existing.size>=maximumTypes)throw Object.assign(new Error('Constructed generic module type budget exceeded'),{code:'capacity'});type=decodeAotMethodTable(memory,address,8,model,module,options);if(!type)continue;existing.set(type.address,type);}
        if(type.kind!=='canonical')continue;
        const layout=evidence(address,type.layout.size_bytes,'validated-constructed-generic-fixed-layout'),tailProof=evidence(address+BigInt(fixed),16,'win-x64-dotnet8-single-argument-relative-tail');
        if(!layout||!tailProof)continue;
        const sourceBindings=unique([...definition.source_bindings,...argument.source_bindings,...members.filter(member=>member.declaring_type_handle.offset===definition.handle.offset).flatMap(member=>member.source_bindings),binding(map,entry.offset,entry.size,'constructed-generic-owner-bucket'),binding(map,entry.target,c.offset-entry.target,'constructed-generic-member-owner'),binding(references,slot,4,'constructed-generic-owner-common-fixup'),layout,tailProof]);
        const identity={...definition,qualified_name:qualified,identity_kind:'constructed-generic',method_table_address:hex(address),runtime_hash_code:hex(hash),binding_status:'associated',generic_definition:{qualified_name:definition.qualified_name,method_table_address:definition.method_table_address,handle:definition.handle},generic_arguments:[{qualified_name:argument.qualified_name,method_table_address:argument.method_table_address,assembly:argument.assembly,scope_identity:argument.scope_identity,handle:argument.handle}],source_bindings:sourceBindings,limitations:['Constructed identity uses the observed .NET 8 win-x64 one-argument relative tail profile. Optional/dynamic/imported/multiple-argument profiles and complete instance layouts remain unknown.']};
        charge(identity);mapPending.push({identity,type});
      }
      pending.push(...mapPending);for(const item of mapPending)processed.add(item.identity.method_table_address);
    }catch(error){checkAotSignal(signal);if(control(error))throw error;retain(output.diagnostics,'Constructed generic map pass rejected: '+error.message);}
  }
  for(const item of pending){const list=candidates.get(item.identity.method_table_address)??[];list.push(item);candidates.set(item.identity.method_table_address,list);}
  for(const [address,list]of candidates){
    checkAotSignal(signal);if(new Set(list.map(item=>JSON.stringify([item.identity.qualified_name,item.identity.assembly,item.identity.scope_identity]))).size!==1){retain(output.conflicts,{method_table_address:address,reason:'Constructed generic identity conflict; contextual annotation suppressed.'});continue;}
    const {identity,type}=list[0];retain(output.types,identity);
    if(!module.types.some(type=>type.address===address)&&!output.extra_types.some(type=>type.address===address)){type.anchors.push({kind:'reflection-map-constructed-generic',address:identity.source_bindings.find(proof=>proof.role==='constructed-generic-member-owner').address});retain(output.extra_types,type);}
    for(const key of ['methods','fields'])for(const member of originalMembers[key].filter(member=>member.declaring_type_handle.offset===identity.handle.offset)){
      const size=Buffer.byteLength(identity.qualified_name)+Buffer.byteLength(member.name)+1;if(size>65536)throw Object.assign(new Error('Constructed member name exceeds 64 KiB'),{code:'capacity'});budget.take('expanded_name_bytes',size);
      retain(output[key],{...member,declaring_type:identity.qualified_name,qualified_name:identity.qualified_name+'.'+member.name,metadata_qualified_name:member.qualified_name,identity_kind:'constructed-context',declaring_method_table_address:address,binding_status:'metadata-only',...(key==='methods'?{target_address:null}:{offset_bytes:null}),generic_context:identity.generic_arguments});
    }
  }
}
