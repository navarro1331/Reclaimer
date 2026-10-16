import {bounds,number} from './artifact-binary.mjs';
import {InvestigationError} from './core.mjs';

/** Read exact declared allocation chains. The overflow tree itself must bootstrap
 * entirely from its volume-header extents (Apple TN1150). */
export function readHfsFork(volume,description,{blockSize,totalBlocks,limit,signal,fileID,overflow}={}){
 signal?.throwIfAborted();bounds(description,0,80);const length=number(description.readBigUInt64BE(0)),declared=description.readUInt32BE(12);if(length>limit||declared>totalBlocks||length>declared*blockSize)throw new Error('HFS fork size exceeds allocation or decode bound');
 const parts=[],ranges=[];let blocks=0,left=length,records=0;
 const append=record=>{let ended=false,added=0;for(let i=0;i<8;i++){signal?.throwIfAborted();const first=record.readUInt32BE(i*8),count=record.readUInt32BE(i*8+4);if(!count){if(first)throw new Error('Invalid unused HFS extent');ended=true;continue;}if(ended)throw new Error('Noncontiguous HFS extent records');if(first+count>totalBlocks||blocks+count>declared)throw new Error('HFS extents exceed declared allocation');const begin=first*blockSize,end=(first+count)*blockSize;bounds(volume,begin,end-begin);ranges.push({begin,end});const used=Math.min(left,end-begin);parts.push(volume.subarray(begin,begin+used));left-=used;blocks+=count;added+=count;}return added;};
 append(description.subarray(16,80));while(blocks<declared){signal?.throwIfAborted();if(++records>10000)throw new Error('HFS fork overflow record count exceeds bound');const row=overflow?.get(fileID+':0:'+blocks);if(!row)throw new InvestigationError('unavailable','extract_artifact','HFS extents overflow chain is absent or incomplete',{reason:'unsupported_disk_image_variant',remediation:'Supply a complete supported HFS extents chain; missing extents are never guessed.'});if(!append(row))throw new Error('HFS overflow record makes no allocation progress');}
 if(left)throw new Error('HFS fork has incomplete byte coverage');ranges.sort((a,b)=>a.begin-b.begin);for(let i=1;i<ranges.length;i++)if(ranges[i].begin<ranges[i-1].end)throw new Error('Overlapping HFS fork physical extents');signal?.throwIfAborted();return Buffer.concat(parts,length);
}

/** Inventory sorted extents leaf records. No filesystem repair, allocation bitmap
 * validation, journal replay or index reconstruction is performed. */
export function hfsOverflowRecords(tree,{maxEntries=10000,signal}={}){
 signal?.throwIfAborted();const result=new Map();if(!tree.length)return result;bounds(tree,0,120);const u32=at=>tree.readUInt32BE(at),u16=at=>tree.readUInt16BE(at),nodeSize=u16(32),totalNodes=u32(36),firstLeaf=u32(24),lastLeaf=u32(28),declared=u32(20),root=u32(16),depth=u16(14),attributes=u32(52);
 if(tree.readInt8(8)!==1||u32(4)||u16(10)!==3||nodeSize<512||nodeSize>32768||(nodeSize&(nodeSize-1))||!totalNodes||totalNodes*nodeSize!==tree.length||u16(34)!==10||tree[50]!==0||!(attributes&2)||(attributes&4))throw new Error('Invalid HFS overflow B-tree header or geometry');
 if(declared>maxEntries||totalNodes>100000)throw new Error('HFS overflow tree exceeds record/node bound');if(!declared){if(firstLeaf||lastLeaf||root||depth)throw new Error('Empty HFS overflow tree has active leaf pointers');return result;}if(!root||root>=totalNodes||!depth||depth>64||tree[root*nodeSize+9]!==depth)throw new Error('Invalid HFS overflow root');
 const seen=new Set();let leaf=firstLeaf,previous=0,counted=0,priorKey=null;
 while(leaf){signal?.throwIfAborted();if(leaf>=totalNodes||seen.has(leaf))throw new Error('Invalid or cyclic HFS overflow leaf chain');seen.add(leaf);const begin=leaf*nodeSize;bounds(tree,begin,nodeSize);if(tree.readInt8(begin+8)!==-1||tree[begin+9]!==1||u32(begin+4)!==previous)throw new Error('Invalid HFS overflow leaf links');const count=u16(begin+10);if(count>nodeSize/4||(counted+=count)>maxEntries)throw new Error('HFS overflow leaf record count exceeds bound');let prior=14;
  for(let i=0;i<count;i++){signal?.throwIfAborted();const at=u16(begin+nodeSize-2*(i+1)),end=u16(begin+nodeSize-2*(i+2));if(at<prior||end-at!==76||end>nodeSize-2*(count+1))throw new Error('Invalid HFS overflow leaf record offsets');prior=end;const p=begin+at,fork=tree[p+2],file=u32(p+4),start=u32(p+8),key=[file,fork,start];if(u16(p)!==10||![0,255].includes(fork)||!file||!start)throw new Error('Invalid HFS overflow key');if(priorKey){let order=0;for(let j=0;j<3&&!order;j++)order=key[j]-priorKey[j];if(order<=0)throw new Error('Duplicate or unsorted HFS overflow keys');}priorKey=key;result.set(file+':'+fork+':'+start,tree.subarray(p+12,p+76));}
  previous=leaf;leaf=u32(begin);
 }
 if(previous!==lastLeaf||counted!==declared)throw new Error('HFS overflow leaf/record count mismatch');signal?.throwIfAborted();return result;
}
