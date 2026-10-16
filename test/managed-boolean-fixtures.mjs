import {peFixture} from './artifact-fixtures.mjs';

// Authored metadata packets; no assembly code is executed. Binary rules:
// ECMA-335, sixth edition, II.23.3 (custom attributes) and II.24 (metadata).
export const u16=value=>{const out=Buffer.alloc(2);out.writeUInt16LE(value);return out;};
export const i32=value=>{const out=Buffer.alloc(4);out.writeInt32LE(value);return out;};
export const serString=value=>{const bytes=Buffer.from(value);if(bytes.length>=128)throw new Error('Owned string extent');return Buffer.concat([Buffer.from([bytes.length]),bytes]);};
export const named=(kind,type,name,value)=>Buffer.concat([Buffer.from([kind,...type]),serString(name),Buffer.from(value)]);
const align=value=>(value+3)&~3;
const compressed=value=>value<128?Buffer.from([value]):value<16384?Buffer.from([0x80|(value>>8),value&255]):(()=>{throw new Error('Owned blob extent');})();

export function managedBooleanFixture({types=[[2],[2]],fixed=Buffer.from([0,1]),named:entries=[]}={}){
 const bytes=peFixture(),strings=[Buffer.from([0])],blobs=[Buffer.from([0])];let stringSize=1,blobSize=1;
 const str=value=>{const at=stringSize,b=Buffer.from(value+'\0');strings.push(b);stringSize+=b.length;return at;};
 const blob=value=>{const at=blobSize,b=Buffer.from(value),prefix=compressed(b.length);blobs.push(prefix,b);blobSize+=prefix.length+b.length;return at;};
 const signature=Buffer.from([0x20,types.length,1,...types.flat()]),attribute=Buffer.concat([Buffer.from([1,0]),Buffer.from(fixed),u16(entries.length),...entries]);
 const rows={0:[[0,str('owned-boolean.dll'),1,0,0]],1:[[0,str('BooleanAttribute'),str('Owned')]],2:[[1,str('Subject'),str('Owned'),0,1,1]],10:[[9,str('.ctor'),blob(signature)]],12:[[46,11,blob(attribute)]],32:[[0x8004,1,0,0,0,0,0,str('Owned.BooleanValues'),0]]};
 const widths={0:[2,2,2,2,2],1:[2,2,2],2:[4,2,2,2,2,2],10:[2,2,2],12:[2,2,2],32:[4,2,2,2,2,4,2,2,2]},present=Object.keys(rows).map(Number).sort((a,b)=>a-b);
 const tables=Buffer.alloc(24+present.length*4+present.reduce((n,id)=>n+rows[id].length*widths[id].reduce((sum,width)=>sum+width,0),0));tables[4]=2;tables.writeBigUInt64LE(present.reduce((mask,id)=>mask|(1n<<BigInt(id)),0n),8);
 let cursor=24;for(const id of present){tables.writeUInt32LE(rows[id].length,cursor);cursor+=4;}for(const id of present)for(const row of rows[id])row.forEach((value,index)=>{if(widths[id][index]===2)tables.writeUInt16LE(value,cursor);else tables.writeUInt32LE(value,cursor);cursor+=widths[id][index];});
 const version=Buffer.from('v4.0.30319\0\0'),streams=[['#~',tables],['#Strings',Buffer.concat(strings)],['#Blob',Buffer.concat(blobs)],['#GUID',Buffer.alloc(16,0x62)]];
 let offset=align(20+version.length+streams.reduce((n,[name])=>n+8+align(name.length+1),0));const metadata=Buffer.alloc(offset+streams.reduce((n,[,data])=>n+align(data.length),0));
 metadata.writeUInt32LE(0x424a5342);metadata.writeUInt16LE(1,4);metadata.writeUInt16LE(1,6);metadata.writeUInt32LE(version.length,12);version.copy(metadata,16);metadata.writeUInt16LE(streams.length,18+version.length);
 let header=20+version.length;for(const [name,data]of streams){metadata.writeUInt32LE(offset,header);metadata.writeUInt32LE(data.length,header+4);metadata.write(name+'\0',header+8);data.copy(metadata,offset);header+=8+align(name.length+1);offset+=align(data.length);}
 if(metadata.length>bytes.length-0x300)throw new Error('Owned metadata extent');bytes.fill(0,0x300);metadata.copy(bytes,0x300);bytes.writeUInt32LE(metadata.length,0x20c);return {bytes,attribute,signature};
}
