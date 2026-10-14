import { digest, hex } from './artifact-binary.mjs';
import { AOT_LIMIT, inRange, aotMemory, checkAotSignal, aotBound, aotRecoveryBudget } from './native-aot-memory.mjs';
import { recoverAotObjects } from './native-aot-types.mjs';
import { recoverNativeAotIdentities, attachNativeAotIdentities } from './native-aot-identity.mjs';

function structuralMethodTables(rebuilt,pointerSize,options) {
  if(!rebuilt)return [];
  const candidates=[],b=rebuilt.bytes,head=16+pointerSize;
  for(let at=0;at+head<=b.length;at+=pointerSize){
    if(at%4096===0)checkAotSignal(options.signal);
    const flags=b.readUInt32LE(at),kind=(flags>>>16)&3,element=(flags>>>26)&31,base=b.readUInt32LE(at+4),slots=b.readUInt16LE(at+8+pointerSize),interfaces=b.readUInt16LE(at+10+pointerSize);
    if(![0,2].includes(kind)||element<2||element>27||[17,19].includes(element)||base>AOT_LIMIT||slots>1024||interfaces>1024||at+head+(slots+interfaces)*pointerSize>b.length||(base<pointerSize*2&&element!==21&&![25,26].includes(element)))continue;
    options.aggregateBudget?.take('candidates');candidates.push({address:hex(rebuilt.address+BigInt(at)),reason:'Structural header resemblance only; no validated frozen-instance or method-table relationship anchor.'});
    if(candidates.length>=10000)break;
  }
  return candidates;
}

export function rehydrateAot(section,address,pointerSize,{maxBytes=AOT_LIMIT,legacyStreamBytes=null,maxCommands=1000000,signal,aggregateBudget}={}) {
  checkAotSignal(signal);
  if(!Buffer.isBuffer(section)||![4,8].includes(pointerSize))throw new Error('NativeAOT rehydration bounds are invalid');
  maxBytes=aotBound(maxBytes,AOT_LIMIT,AOT_LIMIT,'rehydration');maxCommands=aotBound(maxCommands,1000000,1000000,'command');
  const header=legacyStreamBytes===null?8:4;if(section.length<header)throw new Error('NativeAOT dehydrated header is truncated');
  const start=BigInt(address),destination=start+BigInt(section.readInt32LE(0)),end=legacyStreamBytes??section.readUInt32LE(4),pointerLimit=1n<<BigInt(pointerSize*8);
  if(start<0n||start+BigInt(section.length)>pointerLimit||destination<0n||destination>=pointerLimit||!Number.isSafeInteger(end)||end<header||end>section.length||(legacyStreamBytes===null&&(section.length-end)%4))throw new Error('NativeAOT dehydrated stream/table range is invalid');
  const chunks=[],provenance=[];let position=header,written=0,commands=0;
  function append(bytes,origin){if(written+bytes.length>maxBytes)throw Object.assign(new Error('NativeAOT rehydrated output exceeds budget'),{code:'capacity'});if(destination+BigInt(written+bytes.length)>pointerLimit)throw new Error('NativeAOT rehydrated output exceeds pointer range');aggregateBudget?.take('bytes',bytes.length);if(bytes.length){chunks.push(bytes);provenance.push({offset_bytes:written,size_bytes:bytes.length,...origin});written+=bytes.length;}}
  function pointer(target,relative,referenceOffset,kind){const size=relative?4:pointerSize,bytes=Buffer.alloc(size),value=relative?target-destination-BigInt(written):target;if(relative){if(value<-(1n<<31n)||value>=(1n<<31n))throw new Error('NativeAOT relative relocation exceeds signed 32-bit range');bytes.writeInt32LE(Number(value));}else if(pointerSize===8){if(value<0n||value>0xffffffffffffffffn)throw new Error('NativeAOT pointer exceeds 64-bit range');bytes.writeBigUInt64LE(value);}else{if(value<0n||value>0xffffffffn)throw new Error('NativeAOT pointer exceeds 32-bit range');bytes.writeUInt32LE(Number(value));}append(bytes,{kind,source_address:hex(start+BigInt(referenceOffset)),target_address:hex(target),relative});}
  function rel(at){if(!inRange(section,at,4))throw new Error('NativeAOT relocation reference is truncated');return start+BigInt(at)+BigInt(section.readInt32LE(at));}
  while(position<end){checkAotSignal(signal);aggregateBudget?.take('commands');if(++commands>maxCommands)throw Object.assign(new Error('NativeAOT dehydrated command budget exceeded'),{code:'capacity'});const tag=section[position++],kind=tag&7,small=tag>>>3;let payload=small;
    if(small>28){const extra=small-28;if(position+extra>end)throw new Error('NativeAOT extended command is truncated');payload=28;for(let n=0;n<extra;n++)payload+=section[position++]*(2**(8*n));}
    if(kind===0){if(!payload||position+payload>end)throw new Error('NativeAOT literal copy is truncated or empty');append(section.subarray(position,position+payload),{kind:'literal',source_address:hex(start+BigInt(position))});position+=payload;}
    else if(kind===1){if(written+payload>maxBytes)throw Object.assign(new Error('NativeAOT zero-fill exceeds output budget'),{code:'capacity'});aggregateBudget?.check('bytes',payload);append(Buffer.alloc(payload),{kind:'zero-fill',source_address:null});}
    else if(kind===2||kind===3){const slot=end+payload*4;if(!inRange(section,slot,4))throw new Error('NativeAOT fixup index is outside the lookup table');pointer(rel(slot),kind===2,slot,'lookup-relocation');}
    else if(kind===4||kind===5){if(!payload||position+payload*4>end)throw new Error('NativeAOT inline relocations are truncated or empty');for(let n=0;n<payload;n++){checkAotSignal(signal);pointer(rel(position),kind===4,position,'inline-relocation');position+=4;}}
    else throw new Error('NativeAOT dehydrated opcode is unsupported');
  }
  checkAotSignal(signal);
  return {address:destination,bytes:Buffer.concat(chunks,written),commands,provenance};
}

function directoryCandidates(bytes,memory,pointerSize,model,options) {
  const candidates=[],seen=new Set();
  for(const map of memory.maps)for(let offset=map.file_offset;offset+16<=map.file_offset+map.file_size;offset+=pointerSize){
    if((offset-map.file_offset)%4096===0)checkAotSignal(options.signal);
    if(bytes.readUInt32LE(offset)!==0x00525452)continue;
    const count=bytes.readUInt16LE(offset+12),entrySize=bytes[offset+14],entryType=bytes[offset+15],withEndPointer=entrySize===8+2*pointerSize;
    if(!count||count>256||(!withEndPointer&&entrySize!==8+pointerSize)||entryType!==1||!inRange(bytes,offset+16,count*entrySize)||offset+16+count*entrySize>map.file_offset+map.file_size)continue;
    const headerAddress=map.address+BigInt(offset-map.file_offset);
    if(!memory.read(headerAddress,16+count*entrySize)||seen.has(hex(headerAddress)))continue;
    const sections=[];let previous=-1,valid=true;
    for(let n=0;n<count;n++){const at=offset+16+n*entrySize,id=bytes.readUInt32LE(at),field=bytes.readUInt32LE(at+4),address=pointerSize===8?bytes.readBigUInt64LE(at+8):BigInt(bytes.readUInt32LE(at+8));let size=field;
      if(withEndPointer){if(field&~1){valid=false;break;}const end=pointerSize===8?bytes.readBigUInt64LE(at+16):BigInt(bytes.readUInt32LE(at+12));if(field&1){if(end<address||end-address>BigInt(AOT_LIMIT)){valid=false;break;}size=Number(end-address);}else{if(end!==0n){valid=false;break;}size=0;}}
      if(id<=previous||id<124||id>399||size>AOT_LIMIT||address+BigInt(size)>(1n<<BigInt(pointerSize*8))){valid=false;break;}previous=id;sections.push({id,size,address,directory_kind:withEndPointer?'end-pointer':'byte-length'});
    }
    if(!valid||!sections.some(s=>s.id===204||s.id===207))continue;
    seen.add(hex(headerAddress));candidates.push({header_address:hex(headerAddress),format_major:bytes.readUInt16LE(offset+4),format_minor:bytes.readUInt16LE(offset+6),sections,legacy:withEndPointer,discovery:(model.symbols??[]).some(s=>s.address===hex(headerAddress)&&typeof s.name==='string'&&s.name.includes('__ReadyToRunHeader'))?'symbol':'signature-heuristic'});
    if(candidates.length>=64)return candidates;
  }
  return candidates;
}

export function recoverNativeAotDetailed(bytes,model,targetSha,architecture,options={}) {
  checkAotSignal(options.signal);
  if(!Buffer.isBuffer(bytes))throw new Error('NativeAOT recovery requires source bytes');
  const observed=digest(bytes);if(observed!==targetSha)throw new Error('NativeAOT selected-source SHA256 does not match supplied source bytes');
  options={...options,aggregateBudget:aotRecoveryBudget(options)};
  const pointerSize=['x86_64','arm64'].includes(architecture)?8:['x86','arm'].includes(architecture)?4:null;
  const detail={source_sha256:observed,pointer_size:pointerSize,records:[],modules:[]};if(!pointerSize)return detail;
  const memory=aotMemory(bytes,model.segments??[]),modules=directoryCandidates(bytes,memory,pointerSize,model,options);
  for(const module of modules){
    checkAotSignal(options.signal);module.reconstruction=null;module.types=[];module.instances=[];module.structural_candidates=[];module.frozen_object_candidates=0;module.diagnostics=[];module.limitations=[];
    const record={format:'dotnet-nativeaot',status:'partial',reason:'Bounded NativeAOT metadata recovered; no transient type or instance annotation has been committed by this pure reader',analysis_artifact_sha256:observed,header_address:module.header_address,discovery:module.discovery,format_major:module.format_major,format_minor:module.format_minor,method_tables:0,types:[],derived_memory:null,coverage:null,diagnostics:module.diagnostics,limitations:module.limitations};
    module.limitations.push('NativeAOT-shaped metadata is byte-derived. Signature discovery and validated format records do not prove compiler provenance or runtime validity.','Original type and method names, generic layouts, reflection blobs and optional dispatch structures remain unknown.','Derived zero-fill bytes assume an initially zeroed destination; this reconstruction does not observe runtime memory.');
    if(modules.length===64)module.limitations.push('Header inventory is bounded to 64 recognized directories and is not asserted exhaustive.');
    module.diagnostics.push(`Section directory: ${module.sections.length} entries; ${module.sections.filter(s=>memory.locate(s.address,s.size)!==null).length} uniquely file-backed`);
    const dehydrated=module.sections.find(s=>s.id===207);
    if(dehydrated){const raw=module.legacy?memory.tail(dehydrated.address):memory.read(dehydrated.address,dehydrated.size);
      if(!raw||raw.length<dehydrated.size)module.diagnostics.push('Dehydrated section is not uniquely file-backed');
      else try{const rebuilt=rehydrateAot(raw,dehydrated.address,pointerSize,{...options,...(module.legacy?{legacyStreamBytes:dehydrated.size}:{})});module.reconstruction={...rebuilt,sha256:digest(rebuilt.bytes)};record.derived_memory={address:hex(rebuilt.address),size_bytes:rebuilt.bytes.length,sha256:module.reconstruction.sha256,file_offset:null};module.diagnostics.push(`Decoded dehydrated commands: ${rebuilt.commands}`);
        if(module.legacy)module.limitations.push('Legacy relocation lookup has no explicit count; referenced slots are bounded to the uniquely file-backed segment and 16 MiB capture.');
        if(!memory.containsDestination(rebuilt.address,rebuilt.bytes.length))module.limitations.push('Reconstructed destination is not wholly inside one declared non-file-backed memory extent. The bytes are retained as derived evidence; instance/type publication requires an unambiguous mapped view.');
      }catch(error){checkAotSignal(options.signal);if(error.code==='capacity'||error.name==='AbortError'||error.code==='cancelled')throw error;module.diagnostics.push(error.message);}
    }
    const overlay=module.reconstruction&&memory.containsDestination(module.reconstruction.address,module.reconstruction.bytes.length)?module.reconstruction:null,decodedMemory=aotMemory(bytes,model.segments??[],overlay);
    const frozen=module.sections.find(s=>s.id===206);
    if(frozen&&frozen.size>0){
      const recovered=recoverAotObjects(decodedMemory,frozen,pointerSize,model,module,options);module.types=recovered.types;module.instances=recovered.instances;module.frozen_object_candidates=recovered.instances.length+recovered.structural_candidates.length;module.diagnostics.push(...recovered.diagnostics,`Frozen region: ${recovered.instances.length} validated static instances; ${recovered.types.length} anchored fixed method tables; ${recovered.consumed_bytes}/${frozen.size} bytes decoded.`);
      if(!recovered.complete)module.limitations.push('Frozen region was decoded only through its validated contiguous prefix; no resynchronization or guessed object counts were used.');
    }else module.limitations.push('No nonempty declared FrozenObjectRegion was available to anchor static instance/type records.');
    if(module.instances.length&&!module.reconstruction)module.limitations.push('Frozen records are directly source-file-backed; no rehydrated range or NativeAOT datatype derived-memory metadata block is invented.');
    const anchored=new Set(module.types.map(type=>type.address));module.structural_candidates=structuralMethodTables(module.reconstruction,pointerSize,options).filter(candidate=>!anchored.has(candidate.address));
    if(module.structural_candidates.length)module.diagnostics.push(`Unanchored structural method-table candidates: ${module.structural_candidates.length}; none committed.`);
    detail.modules.push(module);detail.records.push(record);
  }
  checkAotSignal(options.signal);
  if(options.recoverIdentities!==false)attachNativeAotIdentities(detail,recoverNativeAotIdentities(bytes,model,detail,options),options);
  checkAotSignal(options.signal);return detail;
}

// Receipt addresses identify actual annotations adopted by the caller's owned
// transient analysis session. Discovery alone does not increment a count.
export function projectNativeAotRecovery(detail,{typeAddresses=[],instanceAddresses=[]}={}) {
  const types=new Set(typeAddresses),instances=new Set(instanceAddresses),knownTypes=new Set(detail.modules.flatMap(m=>m.types.map(t=>t.address))),knownInstances=new Map(detail.modules.flatMap(m=>m.instances.map(i=>[i.address,i])));
  for(const address of types)if(!knownTypes.has(address))throw new Error('NativeAOT commitment refers to an unvalidated method table');
  for(const address of instances){const instance=knownInstances.get(address);if(!instance||!types.has(instance.method_table_address))throw new Error('NativeAOT instance commitment requires its validated committed method table');}
  return detail.records.map((record,index)=>{const module=detail.modules[index],committed=module.types.filter(type=>types.has(type.address)),annotated=module.instances.filter(instance=>instances.has(instance.address));return {...record,method_tables:committed.length,types:committed.map(type=>({address:type.address,type:type.name})),coverage:module.sections.some(s=>s.id===206)?{frozen_object_candidates:module.frozen_object_candidates,frozen_objects_annotated:annotated.length,basis:'rehydrated-pointer-candidates-and-committed-instance-types'}:null,reason:committed.length||annotated.length?('Validated byte-derived layouts and static instances committed into an owned transient analysis session; '+committed.filter(type=>type.identity?.binding_status==='associated').length+' committed method tables have byte-associated non-generic identities; remaining identities, optional layouts and runtime validity remain unknown'):record.reason,diagnostics:[...record.diagnostics,`Transient session commitment: ${committed.length} method tables and ${annotated.length} frozen instances.`]};});
}

export function recoverNativeAot(bytes,model,targetSha,architecture,options={}) { return recoverNativeAotDetailed(bytes,model,targetSha,architecture,options).records; }
