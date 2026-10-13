import { digest, hex } from './artifact-binary.mjs';

export function parseDosImage(bytes,format) {
 if(format==='dos-com') {
  if(!bytes.length||bytes.length>0xff00)throw new Error('DOS COM module must contain 1 through 65280 bytes');
  return {header_bytes:0,module_bytes:bytes.length,overlay_bytes:0,relative_segment:0,entry_offset:0x100,module_offset:0,origin:0x100,relocations:[]};
 }
 if(format!=='dos-mz'||bytes.length<28||!['MZ','ZM'].includes(bytes.toString('ascii',0,2)))throw new Error('DOS MZ header is missing or truncated');
 const last=bytes.readUInt16LE(2),pages=bytes.readUInt16LE(4),count=bytes.readUInt16LE(6),header=bytes.readUInt16LE(8)*16,table=bytes.readUInt16LE(24);
 if(!pages||last>=512||header<28)throw new Error('DOS MZ page/header extent is invalid');
 const declared=(pages-1)*512+(last||512);
 if(header>declared||declared>bytes.length||(count&&(table<28||table+count*4>header)))throw new Error('DOS MZ module or relocation table is outside declared bounds');
 if(declared-header>1024*1024)throw new Error('DOS MZ load module exceeds the 1 MiB reconstruction budget');
 const module=declared-header,relocations=[];
 for(let index=0;index<count;index++){const offset=bytes.readUInt16LE(table+index*4),segment=bytes.readUInt16LE(table+index*4+2),position=segment*16+offset;if(position+2>module)throw new Error('DOS MZ relocation word is outside the load module');relocations.push({segment,offset,position,original:bytes.readUInt16LE(header+position)});}
 return {header_bytes:header,module_bytes:module,overlay_bytes:bytes.length-declared,relative_segment:bytes.readUInt16LE(22),entry_offset:bytes.readUInt16LE(20),module_offset:header,origin:0,relocations};
}
export function loadObservations(model) {
 const actual=model.load_observations;
 if(actual){const {loaded_bytes,...publicFields}=actual;return publicFields;}
 return {executable_format:model.format??'unknown',language_id:model.language_id??'unknown',compiler_spec_id:model.compiler_spec_id??'unknown',image_base:model.image_base??'unknown',default_address_space:'ram',source_files:[],mappings:model.provider==='independent-byte-parser'?[]:(model.segments??[]).map(s=>({block:s.name,start:s.start,end:s.end,address_space:s.address_space??'ram',initialized:s.initialized??true,loaded:true,overlay:s.overlay??false,length:Number(BigInt(s.end)-BigInt(s.start)),source_file_index:null,file_offset:null,sha256:null})),relocations:[],entry_points:[],entry_context:[]};
}
export function verifyDosLoad(bytes,format,model,targetSha) {
 const observations=loadObservations(model),unsupported=reason=>({status:'unsupported',reason,observations,limitations:['A load-image verification requires bounded provider memory bytes and file-offset mappings. No absent bytes, relocation patches or entry-register values are invented.']});
 if(!['dos-mz','dos-com'].includes(format))return unsupported('This target does not have a DOS MZ/COM load module');
 const image=parseDosImage(bytes,format),maps=observations.mappings.filter(m=>m.initialized&&!m.overlay&&m.address_space==='ram'&&Number.isSafeInteger(m.file_offset)&&m.file_offset>=image.module_offset&&m.file_offset<image.module_offset+image.module_bytes&&/^0x[0-9a-f]+$/i.test(m.start));
 if(!maps.length)return unsupported('Provider did not export a file-backed DOS load-module mapping');
 const sourceIndexes=[...new Set(maps.map(m=>m.source_file_index))];if(sourceIndexes.some(index=>!Number.isSafeInteger(index)||index<0||index>=observations.source_files.length))return unsupported('Provider DOS module mapping has a missing or invalid source-file binding');
 const origins=maps.map(m=>Number(BigInt(m.start))-m.file_offset+image.module_offset-image.origin),origin=origins[0];
 if(!Number.isSafeInteger(origin)||origin<0||origin%16||origins.some(o=>o!==origin))return unsupported('Provider DOS mappings do not identify one paragraph-aligned load segment');
 const loadSegment=origin/16;if(loadSegment>0xffff)return unsupported('Provider DOS load segment is outside a 16-bit segment');
 const loaded=model.load_observations?.loaded_bytes??[];
 const captures=loaded.filter(c=>/^0x[0-9a-f]+$/i.test(c.start)&&typeof c.bytes_hex==='string'&&/^(?:[0-9a-f]{2})*$/i.test(c.bytes_hex)).map(c=>({start:Number(BigInt(c.start)),bytes:Buffer.from(c.bytes_hex,'hex')}));
 if(!captures.length)return unsupported('Provider did not export bounded actual DOS memory bytes');
 const read=(address,size)=>{const out=Buffer.alloc(size);for(let index=0;index<size;index++){const matches=captures.filter(c=>address+index>=c.start&&address+index-c.start<c.bytes.length);if(matches.length!==1)return null;out[index]=matches[0].bytes[address+index-matches[0].start];}return out;};
 const expected=Buffer.from(bytes.subarray(image.module_offset,image.module_offset+image.module_bytes));
 for(const relocation of image.relocations)expected.writeUInt16LE((expected.readUInt16LE(relocation.position)+loadSegment)&0xffff,relocation.position);
 const checks=[],check=(name,expected,observed,file_offset=null,address=null)=>checks.push({name,matched:JSON.stringify(expected)===JSON.stringify(observed),expected,observed,file_offset,address});
 const address=origin+image.origin,actual=read(address,image.module_bytes);
 check('loaded-module-sha256',digest(expected),actual?digest(actual):null,image.module_offset,hex(address));
 for(const index of sourceIndexes){const source=observations.source_files[index],suffix=sourceIndexes.length===1?'':'['+index+']';check('provider-original-source-sha256'+suffix,targetSha,source.original_sha256??null);check('provider-original-source-size'+suffix,bytes.length,source.size??null);}
 const entry=origin+image.origin+image.relative_segment*16+image.entry_offset-(format==='dos-com'?image.origin:0);
 check('entry-point',hex(entry),observations.entry_points.find(a=>a===hex(entry))??null,null,hex(entry));
 const relocations=image.relocations.map(r=>{const location=origin+r.position,memory=read(location,2),patched=expected.subarray(r.position,r.position+2);check('relocation-word',patched.toString('hex'),memory?.toString('hex')??null,image.module_offset+r.position,hex(location));return {address:hex(location),segment:r.segment,offset:r.offset,status:memory?.equals(patched)?'verified':'mismatch',type:0,values:[r.original,loadSegment],original_bytes_hex:bytes.subarray(image.module_offset+r.position,image.module_offset+r.position+2).toString('hex'),memory_bytes_hex:memory?.toString('hex')??null};});
 return {status:checks.every(c=>c.matched)?'verified':'mismatch',format,target_sha256:targetSha,load_segment:loadSegment,header_bytes:image.header_bytes,module_bytes:image.module_bytes,overlay_bytes:image.overlay_bytes,entry:{relative_segment:image.relative_segment,offset:image.entry_offset,linear_address:hex(entry)},observations:{...observations,relocations},checks,limitations:['Header-derived relocation words are compared with observed provider memory. Register values remain provider context observations, not live CPU state.','The comparison covers the file-backed load module and entry point; DOS services, allocation semantics, uninitialized memory and execution are not verified.']};
}
