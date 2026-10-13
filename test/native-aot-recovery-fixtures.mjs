import { hex } from '../lib/artifact-binary.mjs';

// This specimen is authored here from field widths and offsets. It is not a
// capture of compiler/runtime memory and makes no execution-validity claim.
export function aotRecoveryFixture({pointerSize=8,legacy=false,sourceBase=0x400000n}={}) {
  const source=BigInt(sourceBase),destination=source+0x3000n,code=source+0x2000n,streamAddress=source+0x100n,b=Buffer.alloc(8192),rebuilt=Buffer.alloc(1024);
  const ptr=(buffer,offset,value)=>pointerSize===8?buffer.writeBigUInt64LE(value,offset):buffer.writeUInt32LE(Number(value),offset);
  const head=16+pointerSize,align=n=>Math.ceil(n/pointerSize)*pointerSize;
  const mt={string:destination+0x100n,object:destination+0x180n,array:destination+0x200n,interface:destination+0x240n,byte:destination+0x280n,boxed:destination+0x2c0n,unanchored:destination+0x300n};
  function table(at,flags,base,related,slots=[],interfaces=[]) {
    rebuilt.writeUInt32LE(flags>>>0,at);rebuilt.writeUInt32LE(base,at+4);ptr(rebuilt,at+8,related);rebuilt.writeUInt16LE(slots.length,at+8+pointerSize);rebuilt.writeUInt16LE(interfaces.length,at+10+pointerSize);rebuilt.writeUInt32LE(0xa07a0000+at,at+12+pointerSize);
    slots.forEach((value,index)=>ptr(rebuilt,at+head+index*pointerSize,value));interfaces.forEach((value,index)=>ptr(rebuilt,at+head+(slots.length+index)*pointerSize,value));
  }
  table(0x100,0xd0000002,pointerSize*2+6,mt.object,[code+16n],[mt.interface]);
  table(0x180,20<<26,pointerSize*3,0n,[code+16n]);
  table(0x200,0xe0020001,pointerSize*2+(pointerSize===8?8:4),mt.byte,[code+16n]);
  table(0x240,21<<26,0,0n,[0n]);
  table(0x280,5<<26,pointerSize*3,mt.object);
  table(0x2c0,8<<26,pointerSize*3,mt.object);
  table(0x300,20<<26,pointerSize*3,0n);
  let cursor=0;const text='Owned α🚀',encoded=Buffer.from(text,'utf16le'),instances=[];
  ptr(rebuilt,cursor+pointerSize,mt.string);rebuilt.writeUInt32LE(encoded.length/2,cursor+pointerSize*2);encoded.copy(rebuilt,cursor+pointerSize*2+4);instances.push(destination+BigInt(cursor+pointerSize));cursor+=align(Math.max(pointerSize*3,pointerSize*2+6+encoded.length));
  const arrayHeader=pointerSize*2+(pointerSize===8?8:4),values=Buffer.from([1,2,3,5,8]);ptr(rebuilt,cursor+pointerSize,mt.array);rebuilt.writeUInt32LE(values.length,cursor+pointerSize*2);values.copy(rebuilt,cursor+arrayHeader);instances.push(destination+BigInt(cursor+pointerSize));cursor+=align(arrayHeader+values.length);
  ptr(rebuilt,cursor+pointerSize,mt.boxed);rebuilt.writeInt32LE(42,cursor+pointerSize*2);instances.push(destination+BigInt(cursor+pointerSize));cursor+=pointerSize*3;
  const frozenSize=cursor;
  const header=legacy?4:8,tag=Buffer.from([(30<<3),((rebuilt.length-28)&255),((rebuilt.length-28)>>>8)]),stream=Buffer.alloc(header+tag.length+rebuilt.length);
  stream.writeInt32LE(Number(destination-streamAddress),0);if(!legacy)stream.writeUInt32LE(stream.length,4);tag.copy(stream,header);rebuilt.copy(stream,header+tag.length);stream.copy(b,0x500);
  const entrySize=legacy?8+pointerSize*2:8+pointerSize;b.writeUInt32LE(0x00525452,0x400);b.writeUInt16LE(legacy?9:10,0x404);b.writeUInt16LE(legacy?1:0,0x406);b.writeUInt16LE(3,0x40c);b[0x40e]=entrySize;b[0x40f]=1;
  for(const [index,id,address,size] of [[0,204,source+0xf00n,pointerSize],[1,206,destination,frozenSize],[2,207,streamAddress,stream.length]]){const at=0x410+index*entrySize;b.writeUInt32LE(id,at);b.writeUInt32LE(legacy?1:size,at+4);ptr(b,at+8,address);if(legacy)ptr(b,at+8+pointerSize,address+BigInt(size));}
  const model={segments:[{start:hex(source),end:hex(source+4096n),file_offset:1024,file_size:4096,read:true,write:false,execute:false},{start:hex(code),end:hex(code+256n),file_offset:6144,file_size:256,read:true,write:false,execute:true},{start:hex(destination),end:hex(destination+1024n),file_offset:0,file_size:0,read:true,write:true,execute:false}],symbols:[{address:hex(source),name:'owned___ReadyToRunHeader'}],functions:[{address:hex(code+16n),name:'owned_virtual_slot'}]};
  return {bytes:b,model,architecture:pointerSize===8?'x86_64':'x86',source,destination,streamAddress,stream,rebuilt,mt,instances:instances.map(hex),frozenSize,pointerSize,legacy,text};
}

export function asAotElf(fixture) {
  const b=Buffer.from(fixture.bytes),wide=fixture.pointerSize===8;b.set([0x7f,0x45,0x4c,0x46,wide?2:1,1,1]);b.writeUInt16LE(2,16);b.writeUInt16LE(wide?62:3,18);b.writeUInt32LE(1,20);
  const phoff=wide?64:52,phsize=wide?56:32;
  const entry=BigInt(fixture.model.segments[1].start)+16n;
  if(wide){b.writeBigUInt64LE(entry,24);b.writeBigUInt64LE(BigInt(phoff),32);b.writeUInt16LE(64,52);b.writeUInt16LE(phsize,54);b.writeUInt16LE(3,56);}else{b.writeUInt32LE(Number(entry),24);b.writeUInt32LE(phoff,28);b.writeUInt16LE(52,40);b.writeUInt16LE(phsize,42);b.writeUInt16LE(3,44);}
  for(const [index,map] of fixture.model.segments.entries()){const at=phoff+index*phsize;b.writeUInt32LE(1,at);const flags=map.execute?5:map.write?6:4;
    if(wide){b.writeUInt32LE(flags,at+4);b.writeBigUInt64LE(BigInt(map.file_offset),at+8);b.writeBigUInt64LE(BigInt(map.start),at+16);b.writeBigUInt64LE(BigInt(map.start),at+24);b.writeBigUInt64LE(BigInt(map.file_size),at+32);b.writeBigUInt64LE(BigInt(map.end)-BigInt(map.start),at+40);b.writeBigUInt64LE(0x1000n,at+48);}else{b.writeUInt32LE(map.file_offset,at+4);b.writeUInt32LE(Number(BigInt(map.start)),at+8);b.writeUInt32LE(Number(BigInt(map.start)),at+12);b.writeUInt32LE(map.file_size,at+16);b.writeUInt32LE(Number(BigInt(map.end)-BigInt(map.start)),at+20);b.writeUInt32LE(flags,at+24);b.writeUInt32LE(0x1000,at+28);}}
  return b;
}
