// Owned format packets. No external application, reference implementation or
// vendor fixture is used by these constructors.
import {hfsFixture} from './artifact-parity-fixtures.mjs';
import {deflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
export function dex041ContainerFixture(){
 const bytes=Buffer.alloc(1024),headers=[0,512],strings=['LOwned/First;','LOwned/Second;','V','run'];let end=800;
 const stringOffsets=strings.map(text=>{const at=end;bytes[end++]=text.length;end+=bytes.write(text,end,'utf8');bytes[end++]=0;return at;});
 const uleb=value=>{const out=[];do{const next=value&127;value=Math.floor(value/128);out.push(next|(value?128:0));}while(value);return Buffer.from(out);};
 for(const [index,base]of headers.entries()){
  bytes.write('dex\n041\0',base,'ascii');bytes.writeUInt32LE(512,base+32);bytes.writeUInt32LE(120,base+36);bytes.writeUInt32LE(0x12345678,base+40);bytes.writeUInt32LE(bytes.length,base+112);bytes.writeUInt32LE(base,base+116);
  for(const [countAt,offsetAt,count,offset]of [[56,60,4,120],[64,68,2,136],[72,76,1,144],[88,92,1,156],[96,100,1,164]]){bytes.writeUInt32LE(count,base+countAt);bytes.writeUInt32LE(base+offset,base+offsetAt);}
  stringOffsets.forEach((offset,i)=>bytes.writeUInt32LE(offset,base+120+i*4));bytes.writeUInt32LE(index,base+136);bytes.writeUInt32LE(2,base+140);
  bytes.writeUInt32LE(2,base+144);bytes.writeUInt32LE(1,base+148);
  bytes.writeUInt32LE(3,base+160);
  bytes.writeUInt32LE(1,base+168);bytes.writeUInt32LE(0xffffffff,base+172);bytes.writeUInt32LE(0xffffffff,base+180);bytes.writeUInt32LE(base+196,base+188);
  Buffer.concat([Buffer.from([0,0,1,0,0,1]),uleb(base+224)]).copy(bytes,base+196);
  bytes.writeUInt16LE(1,base+224);bytes.writeUInt32LE(1,base+236);bytes.writeUInt16LE(0x000e,base+240);
 }
 return {bytes,headers,stringOffsets};
}

const u2=value=>{const b=Buffer.alloc(2);b.writeUInt16BE(value);return b;};
const u4=value=>{const b=Buffer.alloc(4);b.writeUInt32BE(value);return b;};
function mutf8(text){const chunks=[];for(let i=0;i<text.length;i++){const n=text.charCodeAt(i);chunks.push(Buffer.from(n>0&&n<128?[n]:n<2048?[0xc0|(n>>6),0x80|(n&63)]:[0xe0|(n>>12),0x80|((n>>6)&63),0x80|(n&63)]));}return Buffer.concat(chunks);}
export function jvmClassFixture({major=61,switchCode=false,unknownAttribute=false}={}){
 const cp=[];const entry=(tag,data)=>{const index=cp.length+1;cp.push(Buffer.concat([Buffer.from([tag]),data]));if(tag===5||tag===6)cp.push(null);return index;},utf=text=>{const b=mutf8(text);return entry(1,Buffer.concat([u2(b.length),b]));},classEntry=name=>entry(7,u2(utf(name))),nat=(name,descriptor)=>entry(12,Buffer.concat([u2(utf(name)),u2(utf(descriptor))]));
 const own=classEntry('owned/Specimen'),parent=classEntry('java/lang/Object'),init=utf('<init>'),voidMethod=utf('()V'),initTarget=entry(10,Buffer.concat([u2(parent),u2(nat('<init>','()V'))])),codeName=utf('Code'),lineName=utf('LineNumberTable'),sourceName=utf('SourceFile'),sourceValue=utf('OwnedSpecimen.java');
 const fieldName=utf('value'),intType=utf('I'),fieldTarget=entry(9,Buffer.concat([u2(own),u2(nat('value','I'))])),runName=utf('run'),runDescriptor=utf('(I)I'),getterName=utf('get'),getterDescriptor=utf('()I');
 const constantName=utf('ConstantValue'),textName=utf('text'),textDescriptor=utf('Ljava/lang/String;'),textValue=entry(8,u2(utf('owned\0text'))),longName=utf('wide'),longDescriptor=utf('J'),longBytes=Buffer.alloc(8);longBytes.writeBigInt64BE(9007199254740993n);const longValue=entry(5,longBytes),futureName=unknownAttribute?utf('OwnedFuture'):null;
 const attribute=(name,bytes)=>Buffer.concat([u2(name),u4(bytes.length),bytes]);
 function method(flags,name,descriptor,code,locals,stack){const lines=attribute(lineName,Buffer.concat([u2(1),u2(0),u2(7)])),body=Buffer.concat([u2(stack),u2(locals),u4(code.length),code,u2(0),u2(1),lines]);return Buffer.concat([u2(flags),u2(name),u2(descriptor),u2(1),attribute(codeName,body)]);}
 const switched=Buffer.alloc(28);switched[0]=0x1a;switched[1]=0xaa;switched.writeInt32BE(25,4);switched.writeInt32BE(0,8);switched.writeInt32BE(1,12);switched.writeInt32BE(23,16);switched.writeInt32BE(25,20);switched.set([0x04,0xac,0x05,0xac],24);
 const fields=[Buffer.concat([u2(1),u2(fieldName),u2(intType),u2(0)]),Buffer.concat([u2(0x19),u2(textName),u2(textDescriptor),u2(1),attribute(constantName,u2(textValue))]),Buffer.concat([u2(0x19),u2(longName),u2(longDescriptor),u2(1),attribute(constantName,u2(longValue))])];
 const methods=[method(1,init,voidMethod,Buffer.concat([Buffer.from([0x2a,0xb7]),u2(initTarget),Buffer.from([0xb1])]),1,1),method(9,runName,runDescriptor,switchCode?switched:Buffer.from([0x1a,0x04,0x60,0xac]),1,2),method(1,getterName,getterDescriptor,Buffer.concat([Buffer.from([0x2a,0xb4]),u2(fieldTarget),Buffer.from([0xac])]),1,1)];
 const attrs=[attribute(sourceName,u2(sourceValue)),...(unknownAttribute?[attribute(futureName,Buffer.from([1,2,3]))]:[])];
 const prefix=Buffer.concat([Buffer.from([0xca,0xfe,0xba,0xbe]),u2(0),u2(major),u2(cp.length+1),...cp.filter(Boolean)]),header=Buffer.concat([u2(0x21),u2(own),u2(parent),u2(0),u2(fields.length)]);
 return {bytes:Buffer.concat([prefix,header,...fields,u2(methods.length),...methods,u2(attrs.length),...attrs]),class_header_offset:prefix.length,fieldTarget,initTarget,switched};
}

export function binaryCpioFixture(files,{little=true,mode=0x81a4,links=1}={}){
 const chunks=[],records=[];let offset=0,inode=1;
 function add(name,value,type=mode){const data=Buffer.from(value),filename=Buffer.from(name+'\0'),header=Buffer.alloc(26),write=(n,at)=>little?header.writeUInt16LE(n,at):header.writeUInt16BE(n,at);for(const [at,n]of [[0,0o70707],[2,1],[4,inode++],[6,type],[8,2],[10,3],[12,links],[14,0],[16,0x1234],[18,0x5678],[20,filename.length],[22,Math.floor(data.length/65536)],[24,data.length&65535]])write(n,at);records.push({offset,name,data_at:offset+26+filename.length+(filename.length&1),size:data.length});const item=Buffer.concat([header,filename,Buffer.alloc(filename.length&1),data,Buffer.alloc(data.length&1)]);chunks.push(item);offset+=item.length;}
 for(const [name,value]of Object.entries(files))add(name,value);add('TRAILER!!!',Buffer.alloc(0),0);return {bytes:Buffer.concat(chunks),records};
}

export function hfsOverflowFixture({caseSensitive=false,catalogOverflow=true}={}){
 const {disk,files}=hfsFixture({caseSensitive}),catalogAt=4*512,leaf=catalogAt+4096,count=disk.readUInt16BE(leaf+10);let fileAt;
 for(let i=0;i<count;i++){const at=leaf+disk.readUInt16BE(leaf+4096-2*(i+1)),data=at+2+disk.readUInt16BE(at);if(disk.readUInt16BE(data)===2&&disk.readUInt32BE(data+8)===17)fileAt=data;}
 if(!fileAt)throw new Error('Owned HFS record was not located');const content=Buffer.alloc(10*512-7);for(let i=0;i<content.length;i++)content[i]=i%251;files['alpha.txt']=content;
 const description=(length,blocks,extents)=>{const b=Buffer.alloc(80);b.writeBigUInt64BE(BigInt(length));b.writeUInt32BE(blocks,12);extents.forEach(([first,n],i)=>{b.writeUInt32BE(first,16+i*8);b.writeUInt32BE(n,20+i*8);});return b;},physical=[20,22,24,26,28,30,32,34,36,38];description(content.length,10,physical.slice(0,8).map(first=>[first,1])).copy(disk,fileAt+88);physical.forEach((first,i)=>content.subarray(i*512,(i+1)*512).copy(disk,first*512));description(2048,4,[[40,4]]).copy(disk,1024+192);
 const rows=[];if(catalogOverflow){description(8192,16,Array.from({length:8},(_,i)=>[4+i,1])).copy(disk,1024+272);rows.push({file:4,start:8,extents:[[12,8]]});}rows.push({file:17,start:8,extents:[[36,1],[38,1]]});
 const tree=Buffer.alloc(2048),node=1024;tree.writeInt8(1,8);tree.writeUInt16BE(3,10);tree.writeUInt16BE(1,14);tree.writeUInt32BE(1,16);tree.writeUInt32BE(rows.length,20);tree.writeUInt32BE(1,24);tree.writeUInt32BE(1,28);tree.writeUInt16BE(1024,32);tree.writeUInt16BE(10,34);tree.writeUInt32BE(2,36);tree.writeUInt32BE(2,52);for(const [i,value]of [14,120,248,1016].entries())tree.writeUInt16BE(value,1024-2*(i+1));tree[248]=0xc0;tree.writeInt8(-1,node+8);tree[node+9]=1;tree.writeUInt16BE(rows.length,node+10);let at=14;const recordOffsets=[];for(const [i,row]of rows.entries()){tree.writeUInt16BE(at,node+1024-2*(i+1));recordOffsets.push(40*512+node+at);tree.writeUInt16BE(10,node+at);tree.writeUInt32BE(row.file,node+at+4);tree.writeUInt32BE(row.start,node+at+8);row.extents.forEach(([first,n],j)=>{tree.writeUInt32BE(first,node+at+12+j*8);tree.writeUInt32BE(n,node+at+16+j*8);});at+=76;}tree.writeUInt16BE(at,node+1024-2*(rows.length+1));tree.copy(disk,40*512);return {disk,files,fileAt,recordOffsets,treeAt:40*512};
}

export function xarCodecFixture(original,packed,{encoding='application/x-bzip2',name='Payload'}={}){
 const sha=b=>createHash('sha256').update(b).digest(),xml=Buffer.from(`<xar><toc><checksum style="sha256"><offset>0</offset><size>32</size></checksum><file id="1"><name>${name}</name><type>file</type><data><offset>32</offset><length>${packed.length}</length><size>${original.length}</size><encoding style="${encoding}"/><archived-checksum style="sha256">${sha(packed).toString('hex')}</archived-checksum><extracted-checksum style="sha256">${sha(original).toString('hex')}</extracted-checksum></data></file></toc></xar>`),toc=deflateSync(xml),header=Buffer.alloc(28);header.write('xar!');header.writeUInt16BE(28,4);header.writeUInt16BE(1,6);header.writeBigUInt64BE(BigInt(toc.length),8);header.writeBigUInt64BE(BigInt(xml.length),16);header.writeUInt32BE(3,24);return Buffer.concat([header,toc,sha(toc),packed]);
}
