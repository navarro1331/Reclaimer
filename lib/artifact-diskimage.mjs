import { inflateSync } from 'node:zlib';
import { bounds, number, digest, formatOf } from './artifact-binary.mjs';
import { parsePlist } from './artifact-plist.mjs';
import { safeRelative } from './artifact-archive.mjs';
import { InvestigationError } from './core.mjs';
import {readHfsFork,hfsOverflowRecords} from './artifact-hfs-extents.mjs';

const unsupported=reason=>new InvestigationError('unavailable','extract_artifact',reason,{reason:'unsupported_disk_image_variant',remediation:'Supply a single-segment raw/zlib UDIF image with HFS+/HFSX regular-file data forks, or select a compatible external unpacker.'});
const be64=(b,at)=>{bounds(b,at,8);return number(b.readBigUInt64BE(at));};
const be32=(b,at)=>{bounds(b,at,4);return b.readUInt32BE(at);};
function dataRecord(record){const data=record?.Data?.$data;if(typeof data!=='string')throw new Error('UDIF block map lacks plist data');return Buffer.from(data,'base64');}

/** Reconstruct validated, complete UDIF sector ranges; missing ranges are not guessed. */
export function udifDisk(bytes,{maxBytes=256*1024*1024,maxBlocks=100000,signal}={}){
 signal?.throwIfAborted();bounds(bytes,bytes.length-512,512);const footer=bytes.length-512;
 if(bytes.subarray(footer,footer+4).toString('ascii')!=='koly'||be32(bytes,footer+4)!==4||be32(bytes,footer+8)!==512)throw unsupported('Only version 4 UDIF trailers are implemented');
 if(be32(bytes,footer+60)>1)throw unsupported('Segmented UDIF images are unsupported');
 const dataOffset=be64(bytes,footer+24),dataSize=be64(bytes,footer+32),xmlOffset=be64(bytes,footer+216),xmlSize=be64(bytes,footer+224),sectors=be64(bytes,footer+492),size=sectors*512;
 if(!Number.isSafeInteger(size)||size>maxBytes)throw new Error('UDIF expanded disk size exceeds bound');if(xmlSize>16*1024*1024)throw new Error('UDIF plist size exceeds bound');bounds(bytes,dataOffset,dataSize);bounds(bytes,xmlOffset,xmlSize);if(dataOffset+dataSize>footer||xmlOffset+xmlSize>footer)throw new Error('UDIF data or plist escapes trailer boundary');
 const metadata=parsePlist(bytes.subarray(xmlOffset,xmlOffset+xmlSize)).value,maps=metadata?.['resource-fork']?.blkx;if(!Array.isArray(maps)||!maps.length)throw unsupported('UDIF has no supported XML block maps');
 if(be32(bytes,footer+80)===2&&be32(bytes,footer+84)===32&&crc32(bytes.subarray(dataOffset,dataOffset+dataSize))!==be32(bytes,footer+88))throw new Error('UDIF packed data fork CRC mismatch');
 const disk=Buffer.alloc(size),ranges=[],checksums=[];let blocks=0;
 for(const map of maps){signal?.throwIfAborted();const table=dataRecord(map);bounds(table,0,204);if(table.subarray(0,4).toString('ascii')!=='mish'||be32(table,4)!==1)throw new Error('Invalid UDIF block table');const first=be64(table,8),count=be64(table,16),base=be64(table,24),runs=be32(table,200);if((blocks+=runs)>maxBlocks)throw new Error('UDIF block count exceeds bound');bounds(table,204,runs*40);if(first+count>sectors)throw new Error('UDIF block map exceeds disk sectors');
  if(be32(table,64)===2&&be32(table,68)===32)checksums.push({start:first*512,length:count*512,expected:be32(table,72)});
  for(let i=0;i<runs;i++){signal?.throwIfAborted();const at=204+i*40,type=be32(table,at),sector=be64(table,at+8),sectorCount=be64(table,at+16),offset=be64(table,at+24),packed=be64(table,at+32);if(type===0xffffffff||type===0x7ffffffe)continue;if(sector+sectorCount>count)throw new Error('UDIF chunk exceeds its block map');const start=(first+sector)*512,length=sectorCount*512;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(length))throw new Error('UDIF chunk integer exceeds bound');bounds(disk,start,length);if(!length)continue;ranges.push({start,end:start+length});
   if(type===0||type===2){if(packed)throw new Error('UDIF sparse chunk has packed data');continue;}
   const physical=dataOffset+base+offset;if(base+offset+packed>dataSize)throw new Error('UDIF compressed extent escapes data fork');bounds(bytes,physical,packed);const input=bytes.subarray(physical,physical+packed);let data;
   if(type===1)data=input;else if(type===0x80000005)data=inflateSync(input,{maxOutputLength:length});else throw unsupported(`UDIF compression method 0x${type.toString(16)} is unsupported`);
   if(data.length!==length)throw new Error('UDIF chunk expanded size mismatch');data.copy(disk,start);
  }
 }
 ranges.sort((a,b)=>a.start-b.start);let covered=0;for(const range of ranges){if(range.start!==covered)throw new Error(range.start<covered?'Overlapping UDIF chunk extents':'Incomplete UDIF sector coverage');covered=range.end;}if(covered!==size)throw new Error('Incomplete UDIF sector coverage');for(const checksum of checksums)if(crc32(disk.subarray(checksum.start,checksum.start+checksum.length))!==checksum.expected)throw new Error('UDIF block map CRC mismatch');signal?.throwIfAborted();return disk;
}

function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function volumes(disk){
 if(disk.length>=1026&&['H+','HX'].includes(disk.subarray(1024,1026).toString('ascii')))return [{offset:0,size:disk.length}];
 if(disk.length>=1024&&disk.subarray(512,514).toString('ascii')==='PM'){const count=be32(disk,516);if(count>256)throw new Error('Apple partition count exceeds bound');const out=[];for(let i=0;i<count;i++){const at=(i+1)*512;bounds(disk,at,512);if(disk.subarray(at,at+2).toString('ascii')!=='PM')throw new Error('Malformed Apple partition map');const type=disk.subarray(at+48,at+80).toString('ascii').replace(/\0.*$/s,'');if(type==='Apple_HFS'||type==='Apple_HFSX'){const offset=be32(disk,at+8)*512,size=be32(disk,at+12)*512;bounds(disk,offset,size);out.push({offset,size});}else if(type==='Apple_APFS')throw unsupported('APFS filesystem extraction is unsupported');}if(out.length)return out;}
 if(disk.length>=1024&&disk.subarray(512,520).toString('ascii')==='EFI PART'){const at=512,headerSize=disk.readUInt32LE(at+12);if(headerSize<92||headerSize>512)throw new Error('Invalid GPT header size');const header=Buffer.from(disk.subarray(at,at+headerSize)),expected=header.readUInt32LE(16);header.writeUInt32LE(0,16);if(crc32(header)!==expected)throw new Error('GPT header CRC mismatch');const tableAt=number(disk.readBigUInt64LE(at+72))*512,count=disk.readUInt32LE(at+80),recordSize=disk.readUInt32LE(at+84);if(count>256||recordSize<128||recordSize>4096)throw new Error('GPT partition table exceeds bound');bounds(disk,tableAt,count*recordSize);const table=disk.subarray(tableAt,tableAt+count*recordSize);if(crc32(table)!==disk.readUInt32LE(at+88))throw new Error('GPT table CRC mismatch');const out=[];for(let i=0;i<count;i++){const p=tableAt+i*recordSize,type=disk.subarray(p,p+16).toString('hex');if(type==='ef57347c0000aa11aa1100306543ecac')throw unsupported('APFS filesystem extraction is unsupported');if(type!=='005346480000aa11aa1100306543ecac')continue;const first=number(disk.readBigUInt64LE(p+32)),last=number(disk.readBigUInt64LE(p+40));if(last<first)throw new Error('Invalid GPT partition range');const offset=first*512,size=(last-first+1)*512;bounds(disk,offset,size);out.push({offset,size});}if(out.length)return out;}
 throw unsupported('Disk image does not contain a supported HFS+/HFSX volume');
}

/** Read catalog leaves with exact inline/overflow allocation chains; unsupported
 * compressed files and resource forks fail before any output publication. */
export function hfsEntries(disk,{offset=0,size=disk.length-offset,maxEntries=10000,maxBytes=256*1024*1024,signal}={}){
 signal?.throwIfAborted();for(const [value,limit]of [[maxEntries,10000],[maxBytes,256*1024*1024]])if(!Number.isSafeInteger(value)||value<0||value>limit)throw new Error('HFS limit must be a lower-only nonnegative integer');bounds(disk,offset,size);const volume=disk.subarray(offset,offset+size);bounds(volume,1024,512);const header=1024,signature=volume.subarray(header,header+2).toString('ascii'),version=volume.readUInt16BE(header+2);if(!['H+','HX'].includes(signature)||version!==(signature==='HX'?5:4))throw unsupported('Unsupported HFS volume header');const blockSize=be32(volume,header+40),totalBlocks=be32(volume,header+44);if(blockSize<512||(blockSize&(blockSize-1))||totalBlocks*blockSize>volume.length)throw new Error('Invalid HFS allocation geometry');
 const forkOptions={blockSize,totalBlocks,limit:maxBytes,signal},extentTree=readHfsFork(volume,volume.subarray(header+192,header+272),{...forkOptions,fileID:3}),overflow=hfsOverflowRecords(extentTree,{signal,maxEntries}),catalog=readHfsFork(volume,volume.subarray(header+272,header+352),{...forkOptions,fileID:4,overflow});bounds(catalog,0,120);if(catalog.readInt8(8)!==1)throw new Error('HFS catalog lacks header node');const nodeSize=catalog.readUInt16BE(32),totalNodes=be32(catalog,36),firstLeaf=be32(catalog,24),lastLeaf=be32(catalog,28),declaredRecords=be32(catalog,20);if(nodeSize<4096||nodeSize>32768||(nodeSize&(nodeSize-1))||totalNodes*nodeSize>catalog.length)throw new Error('Invalid HFS catalog geometry');
 const folders=new Map(),files=[],visited=new Set();let leaf=firstLeaf,previous=0,records=0;
 while(leaf){signal?.throwIfAborted();if(leaf>=totalNodes||visited.has(leaf))throw new Error('Invalid or cyclic HFS catalog leaf chain');visited.add(leaf);const begin=leaf*nodeSize;bounds(catalog,begin,nodeSize);if(catalog.readInt8(begin+8)!==-1||be32(catalog,begin+4)!==previous)throw new Error('Invalid HFS catalog leaf links');const count=catalog.readUInt16BE(begin+10);if(count>nodeSize/4||(records+=count)>maxEntries)throw new Error('HFS catalog record count exceeds bound');let prior=14;
  for(let i=0;i<count;i++){const at=catalog.readUInt16BE(begin+nodeSize-2*(i+1)),end=catalog.readUInt16BE(begin+nodeSize-2*(i+2));if(at<prior||end<=at||end>nodeSize-2*(count+1))throw new Error('Invalid HFS catalog record offsets');prior=end;const p=begin+at,keyLength=catalog.readUInt16BE(p);if(keyLength<6||keyLength>516||keyLength+4>end-at)throw new Error('Invalid HFS catalog key');const parent=be32(catalog,p+2),nameLength=catalog.readUInt16BE(p+6);if(6+nameLength*2!==keyLength)throw new Error('HFS catalog name length mismatch');const name=Buffer.from(catalog.subarray(p+8,p+8+nameLength*2)).swap16().toString('utf16le'),dataAt=p+2+keyLength,type=catalog.readUInt16BE(dataAt),available=end-at-2-keyLength;
   if((type===1||type===2)&&(!name||name.includes('/')))throw new Error('Invalid HFS leaf name');
   if(type===1){if(available<88)throw new Error('Short HFS folder record');const id=be32(catalog,dataAt+8);if(folders.has(id))throw new Error('Duplicate HFS folder ID');folders.set(id,{parent,name});}
   else if(type===2){if(available<248)throw new Error('Short HFS file record');const mode=catalog.readUInt16BE(dataAt+42),fileType=catalog.subarray(dataAt+48,dataAt+52).toString('ascii');if((mode&0xf000)!==0&&(mode&0xf000)!==0x8000||fileType==='hlnk'||fileType==='slnk')throw unsupported('HFS links and special files are not published');if(catalog[dataAt+41]&0x20)throw unsupported('HFS compressed file attributes are unsupported');if(be64(catalog,dataAt+168))throw unsupported('HFS resource-fork extraction is unsupported');files.push({parent,name,id:be32(catalog,dataAt+8),forkAt:dataAt+88});}
   else if(type!==3&&type!==4)throw new Error('Unknown HFS catalog record type');
  }
  previous=leaf;leaf=be32(catalog,begin);
 }
 if(previous!==lastLeaf||records!==declaredRecords)throw new Error('HFS catalog leaf/record count mismatch');
 function prefix(id,active=new Set()){if(id===2)return '';if(active.has(id)||active.size>128)throw new Error('Cyclic HFS folder hierarchy');const folder=folders.get(id);if(!folder)throw new Error('HFS file parent is absent');active.add(id);return prefix(folder.parent,active)+folder.name+'/';}
 const entries=[],seen=new Set();let expanded=0;
 for(const file of files){signal?.throwIfAborted();const name=safeRelative(prefix(file.parent)+file.name),key=process.platform==='win32'?name.toLowerCase():name;if(!name||seen.has(key))throw new Error('Duplicate HFS member path');seen.add(key);const at=file.forkAt,length=be64(catalog,at);if(expanded+length>maxBytes)throw new Error('HFS extracted size exceeds bound');
  // Catalog forks describe physical volume extents, not offsets into the catalog.
  const data=readHfsFork(volume,catalog.subarray(at,at+80),{...forkOptions,limit:maxBytes-expanded,fileID:file.id,overflow});expanded+=data.length;entries.push({name,data,sha256:digest(data),format:formatOf(data,name)});
 }
 signal?.throwIfAborted();return entries;
}

export function dmgEntries(bytes,options={}){const disk=udifDisk(bytes,options),parts=volumes(disk);if(parts.length!==1)throw unsupported('Multiple HFS volumes require an explicit volume selector');return hfsEntries(disk,{...options,...parts[0]});}
export const capabilities={builtIn:['Single-segment raw/zlib/sparse UDIF sectors','Direct, Apple-partition-map and GPT HFS+/HFSX regular-file data forks','HFS catalog/data-fork overflow allocation chains from sorted bounded extents leaves'],limitations:['APFS, encryption, ADC/bzip2/lzfse chunks, resource forks, compressed files, links and multiple-volume selection are unsupported.','The extents tree must bootstrap from its volume-header extents; absent/incomplete chains fail explicitly.','Checksums and filesystem records do not establish signing trust, allocation bitmap consistency or journal recovery.']};
