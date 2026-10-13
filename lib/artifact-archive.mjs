import { ZipReader, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js';
import { digest, bounds, formatOf } from './artifact-binary.mjs';
import path from 'node:path';
import fs from 'node:fs/promises';
import { xarEntries, packagePayloadEntries } from './artifact-installer.mjs';
import { dmgEntries } from './artifact-diskimage.mjs';

export function safeRelative(name){if(typeof name!=='string'||!name||name.includes('\0')||name.includes('\\')||name.startsWith('/')||/^[A-Za-z]:/.test(name))throw new Error(`Unsafe archive path ${JSON.stringify(name)}`);const parts=name.split('/');if(process.platform==='win32'&&parts.some(p=>/[<>:\"|?*]/.test(p)||/[. ]$/.test(p)||/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p)))throw new Error(`Unsafe archive path ${JSON.stringify(name)}`);if(parts.some(p=>p==='..'||p==='.'))throw new Error(`Unsafe archive path ${JSON.stringify(name)}`);return parts.filter(Boolean).join('/');}
export async function zipEntries(b,{maxEntries=10000,maxBytes=256*1024*1024}={}) {
  const zip=new ZipReader(new Uint8ArrayReader(b),{useWebWorkers:false});const out=[];let total=0;const names=new Set();try{const entries=await zip.getEntries();if(entries.length>maxEntries)throw new Error('Archive entry count exceeds bound');for(const e of entries){const name=safeRelative(e.filename);if(!name||e.directory)continue;if(names.has(name))throw new Error('Duplicate archive member path');names.add(name);const mode=(e.externalFileAttributes>>>16)&0xffff;if((mode&0xf000)===0xa000)throw new Error('Archive symlinks are not published');if(e.encrypted)throw new Error('Encrypted archive requires an explicitly supplied provider');total+=e.uncompressedSize;if(total>maxBytes)throw new Error('Archive expanded size exceeds bound');const data=Buffer.from(await e.getData(new Uint8ArrayWriter(),{checkSignature:true,useWebWorkers:false}));if(data.length!==e.uncompressedSize)throw new Error('Archive member size mismatch');out.push({name,data,sha256:digest(data),format:formatOf(data,name)});}}finally{await zip.close();}return out;
}
export function asarEntries(b,{maxEntries=10000,maxBytes=256*1024*1024}={}) {
  bounds(b,0,16);const headerSize=b.readUInt32LE(4),jsonSize=b.readUInt32LE(12);bounds(b,16,jsonSize);const header=JSON.parse(b.subarray(16,16+jsonSize).toString('utf8')),start=8+headerSize,out=[];let total=0;
  function visit(tree,prefix=''){for(const [name,v] of Object.entries(tree.files??{})){const rel=safeRelative(prefix+name);if(v.files){visit(v,rel+'/');continue;}if(v.link||v.unpacked)throw new Error(`ASAR member ${rel} needs external data or is a link`);if(out.length>=maxEntries)throw new Error('ASAR member count exceeds bound');const size=Number(v.size),offset=Number(v.offset);if(!Number.isSafeInteger(size)||!Number.isSafeInteger(offset)||size<0||offset<0)throw new Error('Invalid ASAR integer');total+=size;if(total>maxBytes)throw new Error('ASAR expanded size exceeds bound');bounds(b,start+offset,size);const data=b.subarray(start+offset,start+offset+size),sha256=digest(data);if(v.integrity?.algorithm==='SHA256'&&v.integrity.hash!==sha256)throw new Error(`ASAR integrity mismatch for ${rel}`);out.push({name:rel,data,sha256,format:formatOf(data,rel)});}}visit(header);return out;
}
export async function archiveEntries(b,format,opts={}){
 if(format==='dmg')return dmgEntries(b,opts);
 if(format==='pkg'){
  const entries=xarEntries(b,opts);if(opts.expandPayloads===false)return entries;
  const expanded=[...entries],maxEntries=opts.maxEntries??10000,maxBytes=opts.maxBytes??256*1024*1024;let bytes=entries.reduce((total,e)=>total+e.data.length,0);
  for(const entry of entries.filter(e=>/(?:^|\/)Payload$/.test(e.name))){const members=packagePayloadEntries(entry.data,{...opts,maxEntries:maxEntries-expanded.length,maxBytes:maxBytes-bytes});for(const member of members){bytes+=member.data.length;if(expanded.length>=maxEntries||bytes>maxBytes)throw new Error('Expanded package inventory exceeds bound');expanded.push({...member,name:entry.name+'!/'+member.name,derivation:{container_name:entry.name,container_sha256:entry.sha256,operation:'bounded-cpio-payload-decode'}});}}
  return expanded;
 }
 return format==='asar'?asarEntries(b,opts):['zip','apk','ipa','appx','msix'].includes(format)?zipEntries(b,opts):[{name:'artifact.bin',data:b,sha256:digest(b),format}];
}
export async function publishEntries(entries,root,{maxBytes=256*1024*1024,maxFiles=10000}={}) {
  root=path.resolve(root);await fs.mkdir(root,{recursive:true,mode:0o700});const st=await fs.lstat(root);if(st.isSymbolicLink()||!st.isDirectory())throw new Error('Output root must be a real directory');const realRoot=await fs.realpath(root),created=[],out=[];let bytes=0;
  try{for(const e of entries){if(out.length>=maxFiles||(bytes+=e.data.length)>maxBytes)throw new Error('Publication limit exceeded');const rel=safeRelative(e.name),dest=path.resolve(root,...rel.split('/'));if(!dest.startsWith(root+path.sep))throw new Error('Archive destination escaped output root');const parts=rel.split('/');let current=root;for(const piece of parts.slice(0,-1)){current=path.join(current,piece);try{await fs.mkdir(current,{mode:0o700});}catch(err){if(err.code!=='EEXIST')throw err;}const s=await fs.lstat(current);if(s.isSymbolicLink()||!s.isDirectory())throw new Error('Output ancestor is not a real directory');const real=await fs.realpath(current);if(!real.startsWith(realRoot+path.sep))throw new Error('Output ancestor escaped root');}await fs.writeFile(dest,e.data,{flag:'wx',mode:0o600});created.push(dest);out.push({artifact_id:`art_${e.sha256}`,relative_path:rel,sha256:e.sha256,bytes_written:e.data.length,created:true,path:dest});}return out;}catch(error){for(const p of created)await fs.rm(p,{force:true});throw error;}
}
