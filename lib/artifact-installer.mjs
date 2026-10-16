import { inflateSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { DOMParser } from '@xmldom/xmldom';
import { bounds, digest, formatOf, number } from './artifact-binary.mjs';
import { safeRelative } from './artifact-archive.mjs';
import { InvestigationError } from './core.mjs';
import {decodeInstallerCodec,installerCodecName} from './artifact-installer-codecs.mjs';

const unsupported=reason=>new InvestigationError('unavailable','extract_artifact',reason,{reason:'unsupported_installer_variant',remediation:'Supply an unencrypted XAR with stored/zlib members, or unpack this variant with an explicitly selected compatible reader.'});
const elements=(parent,name)=>Array.from(parent.childNodes??[]).filter(n=>n.nodeType===1&&(!name||n.tagName===name));
function child(parent,name,required=false){const found=elements(parent,name);if(found.length>1||required&&!found.length)throw new Error(`XAR requires one ${name} element`);return found[0]??null;}
function text(parent,name,required=false){return child(parent,name,required)?.textContent??null;}
function precise(value,label){try{return number(value);}catch{throw new Error(`${label} exceeds the precise local integer range`);}}
function integer(value,label){if(typeof value!=='string'||!/^\d+$/.test(value))throw new Error(`Invalid ${label}`);return precise(BigInt(value),label);}
function hash(bytes,algorithm){const name=algorithm?.toLowerCase().replaceAll('-','');if(!['sha1','sha256','sha512','md5'].includes(name))throw unsupported(`XAR checksum ${algorithm??'unspecified'} is unsupported`);return createHash(name).update(bytes).digest('hex');}
function checksum(bytes,node){if(!node)return;const expected=node.textContent.trim().toLowerCase(),actual=hash(bytes,node.getAttribute('style'));if(!/^[a-f0-9]+$/.test(expected)||expected!==actual)throw new Error('XAR member checksum mismatch');}

/** Decode the XAR container layer. Signatures remain metadata, not trusted identities. */
function xarRecords(bytes,{maxEntries=10000,maxBytes=256*1024*1024,maxTocBytes=16*1024*1024,signal}={}){
 for(const [value,ceiling]of [[maxEntries,10000],[maxBytes,256*1024*1024],[maxTocBytes,16*1024*1024]])if(!Number.isSafeInteger(value)||value<0||value>ceiling)throw new Error('XAR limit must be a lower-only nonnegative integer');
 signal?.throwIfAborted();bounds(bytes,0,28);if(bytes.subarray(0,4).toString('ascii')!=='xar!')throw new Error('Invalid XAR signature');
 const header=bytes.readUInt16BE(4),version=bytes.readUInt16BE(6),packed=precise(bytes.readBigUInt64BE(8),'XAR compressed TOC length'),declared=precise(bytes.readBigUInt64BE(16),'XAR expanded TOC length'),algorithm=bytes.readUInt32BE(24);
 if(header<28||version!==1)throw unsupported('Only XAR version 1 headers are implemented');if(declared>maxTocBytes)throw new Error('XAR table of contents exceeds bound');bounds(bytes,header,packed);
 const compressed=bytes.subarray(header,header+packed),xml=inflateSync(compressed,{maxOutputLength:Math.max(1,declared)});if(xml.length!==declared)throw new Error('XAR table of contents size mismatch');
 const source=xml.toString('utf8');if(/<!DOCTYPE|<!ENTITY/i.test(source))throw new Error('XAR custom XML declarations are not accepted');
 const doc=new DOMParser({onError:(level,message)=>{if(level==='error'||level==='fatalError')throw new Error(message);}}).parseFromString(source,'application/xml');
 if(doc.documentElement?.tagName!=='xar')throw new Error('XAR table of contents lacks xar root');const toc=child(doc.documentElement,'toc',true),heap=header+packed,cs=child(toc,'checksum');
 if(algorithm){const names={1:'sha1',2:'md5',3:'sha256',4:'sha512'},name=names[algorithm];if(!name)throw unsupported(`XAR table checksum algorithm ${algorithm} is unsupported`);if(!cs||cs.getAttribute('style').toLowerCase().replaceAll('-','')!==name)throw new Error('XAR header/table checksum disagreement');const offset=integer(text(cs,'offset',true),'XAR checksum offset'),size=integer(text(cs,'size',true),'XAR checksum size'),expected=hash(compressed,name);bounds(bytes,heap+offset,size);if(bytes.subarray(heap+offset,heap+offset+size).toString('hex')!==expected)throw new Error('XAR table checksum mismatch');}
 else if(cs)throw new Error('XAR checksum exists but header declares none');
 const entries=[],seen=new Set();let expanded=0,records=0;
 function walk(node,prefix='',depth=0){
  signal?.throwIfAborted();if(depth>128)throw new Error('XAR directory depth exceeds bound');if(++records>maxEntries)throw new Error('XAR entry count exceeds bound');
  const leaf=text(node,'name',true);if(leaf.includes('/'))throw new Error('XAR leaf name contains a path separator');const name=safeRelative(prefix+leaf),key=process.platform==='win32'?name.toLowerCase():name;if(!name||seen.has(key))throw new Error('Duplicate XAR member path');seen.add(key);
  const type=text(node,'type',true);if(type==='directory'){for(const nested of elements(node,'file'))walk(nested,name+'/',depth+1);return;}
  if(type!=='file')throw unsupported(`XAR ${type} members are not published`);if(elements(node,'file').length)throw new Error('XAR file contains directory children');
  const dataNode=child(node,'data');let record={name,size:0,encoding:'application/octet-stream',packedData:Buffer.alloc(0),extractedChecksum:null};
  if(dataNode){const offset=integer(text(dataNode,'offset',true),'XAR member offset'),length=integer(text(dataNode,'length',true),'XAR compressed length'),size=integer(text(dataNode,'size',true),'XAR expanded size');if(expanded+size>maxBytes)throw new Error('XAR expanded size exceeds bound');bounds(bytes,heap+offset,length);const packedData=bytes.subarray(heap+offset,heap+offset+length);checksum(packedData,child(dataNode,'archived-checksum'));record={name,size,packedData,encoding:child(dataNode,'encoding',true).getAttribute('style'),extractedChecksum:child(dataNode,'extracted-checksum')};}
  expanded+=record.size;entries.push(record);
 }
 for(const file of elements(toc,'file'))walk(file);signal?.throwIfAborted();return entries;
}

function builtInMember(record){if(record.encoding==='application/octet-stream')return Buffer.from(record.packedData);if(record.encoding==='application/x-gzip')return inflateSync(record.packedData,{maxOutputLength:Math.max(1,record.size)});throw unsupported(`XAR member compression ${record.encoding} is unsupported`);}
function finishMember(record,data,codec){if(data.length!==record.size)throw new Error('XAR member size mismatch');checksum(data,record.extractedChecksum);return {name:record.name,data,sha256:digest(data),format:formatOf(data,record.name),...(codec?{codec}: {})};}
/** Compatibility API: stored/zlib remain synchronous and need no executable. */
export function xarEntries(bytes,options={}){return xarRecords(bytes,options).map(record=>{options.signal?.throwIfAborted();return finishMember(record,builtInMember(record));});}
/** Only explicitly configured, bounded stdlib child codecs add async variants. */
export async function xarEntriesAsync(bytes,options={}){
 const records=xarRecords(bytes,options),entries=[],timeout=options.codecTimeoutMs??60000;if(!Number.isSafeInteger(timeout)||timeout<1||timeout>60000)throw new Error('XAR codec timeout must be a lower-only integer');const deadline=Date.now()+timeout;
 for(const record of records){options.signal?.throwIfAborted();if(installerCodecName(record.encoding)){const remaining=deadline-Date.now();if(remaining<1)throw new Error('XAR aggregate codec deadline exceeded');const decoded=await decodeInstallerCodec(record.packedData,{encoding:record.encoding,expectedSize:record.size,pythonArgv:options.pkgCodecPythonArgv,signal:options.signal,timeoutMs:remaining,maxBytes:options.maxBytes??256*1024*1024});entries.push(finishMember(record,decoded.bytes,decoded.receipt));}else entries.push(finishMember(record,builtInMember(record)));}
 options.signal?.throwIfAborted();if(Date.now()>deadline)throw new Error('XAR aggregate codec deadline exceeded');return entries;
}

/** Decode ASCII newc/crc/odc and 16-bit-word binary CPIO regular files.
 * Binary four-byte sizes store the high word first in either word byte order.
 * No permissions, links, device records or archive code are applied/executed. */
export function cpioEntries(bytes,{maxEntries=10000,maxBytes=256*1024*1024,maxNameBytes=8*1024*1024,signal}={}){
 for(const [value,ceiling]of [[maxEntries,10000],[maxBytes,256*1024*1024],[maxNameBytes,8*1024*1024]])if(!Number.isSafeInteger(value)||value<0||value>ceiling)throw new Error('CPIO limit must be a lower-only nonnegative integer');if(bytes.length>256*1024*1024)throw new Error('CPIO input exceeds bound');
 const entries=[],seen=new Set(),utf8=new TextDecoder('utf-8',{fatal:true});let at=0,total=0,nameBytes=0,records=0,trailer=false;
 while(at<bytes.length){signal?.throwIfAborted();bounds(bytes,at,6);const magic=bytes.subarray(at,at+6).toString('ascii'),binary=bytes.readUInt16LE(at)===0o70707||bytes.readUInt16BE(at)===0o70707;let nameSize,size,mode,links,checksumValue=0,start,alignment=1;
  if(binary){bounds(bytes,at,26);const word=offset=>bytes.readUInt16LE(at)===0o70707?bytes.readUInt16LE(at+offset):bytes.readUInt16BE(at+offset);mode=word(6);links=word(12);nameSize=word(20);size=word(22)*65536+word(24);start=at+26;alignment=2;}
  else if(magic==='070701'||magic==='070702'){bounds(bytes,at,110);const field=i=>{const value=bytes.subarray(at+6+i*8,at+14+i*8).toString('ascii');if(!/^[a-f0-9]{8}$/i.test(value))throw new Error('Invalid newc integer');return Number.parseInt(value,16);};mode=field(1);links=field(4);size=field(6);nameSize=field(11);checksumValue=field(12);start=at+110;alignment=4;}
  else if(magic==='070707'){bounds(bytes,at,76);const field=(offset,length)=>{const value=bytes.subarray(at+offset,at+offset+length).toString('ascii');if(!/^[0-7]+$/.test(value))throw new Error('Invalid odc integer');return Number.parseInt(value,8);};mode=field(18,6);links=field(36,6);nameSize=field(59,6);size=field(65,11);start=at+76;}
  else throw unsupported(`CPIO header ${magic} is unsupported`);
  if(nameSize<1||nameSize>65536)throw new Error('Invalid CPIO name size');if((nameBytes+=nameSize)>maxNameBytes)throw new Error('CPIO aggregate name bytes exceed bound');bounds(bytes,start,nameSize);if(bytes[start+nameSize-1]!==0)throw new Error('CPIO name lacks terminator');const raw=bytes.subarray(start,start+nameSize-1);if(raw.includes(0))throw new Error('CPIO name contains NUL');const literal=utf8.decode(raw),dataAt=Math.ceil((start+nameSize)/alignment)*alignment;bounds(bytes,dataAt,size);const next=Math.ceil((dataAt+size)/alignment)*alignment;if(next>bytes.length)throw new Error('CPIO padding escapes input');if(binary&&(bytes.subarray(start+nameSize,dataAt).some(byte=>byte!==0)||bytes.subarray(dataAt+size,next).some(byte=>byte!==0)))throw new Error('CPIO binary padding must be zero');
  if(literal==='TRAILER!!!'){if(size!==0)throw new Error('CPIO trailer has data');trailer=true;at=next;break;}
  if(++records>maxEntries)throw new Error('CPIO entry count exceeds bound');const type=mode&0xf000;if((literal==='.'||literal==='./')&&type===0x4000&&size===0){at=next;continue;}const name=safeRelative(literal.replace(/^(?:\.\/)+/,'')),key=process.platform==='win32'?name.toLowerCase():name;if(!name||seen.has(key))throw new Error('Duplicate CPIO member path');seen.add(key);
  if(type===0x4000){if(size)throw new Error('CPIO directory contains data');at=next;continue;}
  if(type!==0x8000||links!==1)throw unsupported('CPIO links and special files are not published');if((total+=size)>maxBytes)throw new Error('CPIO expanded size exceeds bound');const data=Buffer.from(bytes.subarray(dataAt,dataAt+size));if(magic==='070702'){let sum=0;for(let i=0;i<data.length;i++){if(!(i%65536))signal?.throwIfAborted();sum=(sum+data[i])>>>0;}if(sum!==checksumValue)throw new Error('CPIO CRC checksum mismatch');}entries.push({name,data,sha256:digest(data),format:formatOf(data,name)});at=next;
 }
 if(!trailer)throw new Error('CPIO lacks trailer');for(let i=at;i<bytes.length;i++){if(!(i%65536))signal?.throwIfAborted();if(bytes[i]!==0)throw new Error('Non-padding data follows CPIO trailer');}signal?.throwIfAborted();return entries;
}

export function packagePayloadEntries(bytes,options={}){options.signal?.throwIfAborted();let payload=bytes;const streamBound=Math.min(options.maxPayloadBytes??256*1024*1024,256*1024*1024);if(bytes[0]===0x1f&&bytes[1]===0x8b){try{payload=gunzipSync(bytes,{maxOutputLength:Math.max(1,streamBound)});}catch(error){if(error.code==='ERR_BUFFER_TOO_LARGE')throw new Error('PKG gzip Payload stream exceeds decode size bound',{cause:error});throw error;}}if(payload.length>streamBound)throw new Error('PKG Payload stream exceeds decode size bound');return cpioEntries(payload,options);}
export const capabilities={builtIn:['XAR version 1 stored/zlib members and TOC/member hashes','ASCII newc/crc/odc and little/big-endian word binary CPIO regular files and gzip payloads'],configured:['Explicit Python stdlib bzip2/xz/LZMA-alone XAR member codecs'],limitations:['Installer scripts are retained bytes and never executed.','XAR signatures/trust, PBZX payloads, concatenated codec streams, links and special files are unsupported.','Configured codecs require a compatible explicit executable, a 60s aggregate publication deadline and a 64MiB LZMA decoder-memory limit.','Binary CPIO uses the documented Unix file-type layout; PWB and HP device variants are not inferred.']};
