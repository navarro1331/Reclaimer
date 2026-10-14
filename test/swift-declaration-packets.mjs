// Independently authored format packets. No compiler output is translated into
// an expected packet; individual fields are declared explicitly for each case.
export function swiftDeclarationPacket({module='OwnedTraits',name='Root',access=4,actor=false,attributes=[],constructorKind=0,overrideId=0,requiredBit=0,boolean=0,inheritedPacket=0,conformancePacket=0,member=true,spareOperands=0,typeCycle=false,extensionContext=false}={}) {
 const bits=[],frames=[],decls=[],types=[],conf=[];let width=2;
 const fixed=(value,n)=>{value=BigInt(value);for(let i=0;i<n;i++)bits.push(Number(value>>BigInt(i)&1n));};
 const vbr=(value,n)=>{value=BigInt(value);const mask=(1n<<BigInt(n-1))-1n;do{const part=value&mask;value>>=BigInt(n-1);fixed(part|(value?1n<<BigInt(n-1):0n),n);}while(value);};
 const align=()=>{while(bits.length%32)bits.push(0);};
 function enter(id){fixed(1,width);vbr(id,8);vbr(3,4);align();const at=bits.length;fixed(0,32);frames.push({width,at,start:bits.length,abbrevs:0});width=3;}
 function end(){fixed(0,width);align();const f=frames.pop(),words=(bits.length-f.start)/32;for(let i=0;i<32;i++)bits[f.at+i]=words>>>i&1;width=f.width;}
 function record(code,values=[]){const at=bits.length;fixed(3,width);vbr(code,6);vbr(values.length,6);values.forEach(v=>vbr(v,6));return at;}
 function blob(code,bytes,values=[]){const f=frames.at(-1),id=4+f.abbrevs++;fixed(2,width);vbr(2+values.length,5);fixed(1,1);vbr(code,8);for(const value of values){fixed(0,1);fixed(2,3);vbr(6,5);}fixed(0,1);fixed(5,3);fixed(id,width);values.forEach(v=>vbr(v,6));vbr(bytes.length,6);align();bytes.forEach(v=>fixed(v,8));align();}
 const strings=[name,'member','seed','Extension'],data=[Buffer.from([0])],offsets=[];let cursor=1;for(const s of strings){offsets.push(cursor);const b=Buffer.from(s+'\0');data.push(b);cursor+=b.length;}
 fixed(0x0ea89ce2,32);enter(8);enter(9);blob(1,Buffer.alloc(0),[0,903,0,0,0,0,0,0]);blob(2,Buffer.from(module));blob(3,Buffer.from('x86_64-apple-macosx10.15'));end();
 enter(10);blob(1,Buffer.from('../owned-untrusted-source/never-read.swift'));end();
 enter(11);let root=record(67,[6,0,0,0,actor?1:0,0,0,0,0,access,conformancePacket?1:0,inheritedPacket?1:0,...(conformancePacket?[conformancePacket]:[]),...(inheritedPacket?[inheritedPacket]:[])]);decls.push(root);
 if(extensionContext)decls.push(record(71,[1,1,0,0,0,0,0]));
 if(member){const at=bits.length;for(const attr of attributes)record(attr.code,attr.values);decls.push(at);record(54,[extensionContext?2:1,boolean,0,0,0,0,0,0,0,constructorKind,0,overrideId,0,access,0,requiredBit,1,8]);}
 if(spareOperands)record(150,Array(spareOperands).fill(0));
 types.push(record(typeCycle?18:4,typeCycle?[1,0,1]:[1,0]));end();
 enter(12);blob(1,Buffer.concat(data));end();enter(13);record(1,types);record(2,decls);record(3,offsets);record(17,conf);record(18,[]);record(12,[]);end();end();
 const bytes=Buffer.alloc(bits.length/8);bits.forEach((v,i)=>{if(v)bytes[i>>>3]|=1<<(i&7);});return bytes;
}

export function swiftDeclarationImage(modules,{splitSections=false}={}) {
 const list=splitSections?modules:[Buffer.concat(modules)],header=32+72+80*list.length,total=header+list.reduce((n,b)=>n+b.length,0),bytes=Buffer.alloc(total);
 bytes.writeUInt32LE(0xfeedfacf);bytes.writeUInt32LE(0x1000007,4);bytes.writeUInt32LE(3,8);bytes.writeUInt32LE(1,12);bytes.writeUInt32LE(1,16);bytes.writeUInt32LE(header-32,20);bytes.writeUInt32LE(25,32);bytes.writeUInt32LE(header-32,36);bytes.write('__TEXT',40);bytes.writeBigUInt64LE(0x100000n,56);bytes.writeBigUInt64LE(BigInt(total-header),64);bytes.writeBigUInt64LE(BigInt(header),72);bytes.writeBigUInt64LE(BigInt(total-header),80);bytes.writeUInt32LE(1,88);bytes.writeUInt32LE(1,92);bytes.writeUInt32LE(list.length,96);
 let at=header,vm=0x100000;list.forEach((module,i)=>{const p=104+i*80;bytes.write('__swift_ast',p);bytes.write('__TEXT',p+16);bytes.writeBigUInt64LE(BigInt(vm),p+32);bytes.writeBigUInt64LE(BigInt(module.length),p+40);bytes.writeUInt32LE(at,p+48);bytes.writeUInt32LE(2,p+52);module.copy(bytes,at);at+=module.length;vm+=module.length;});return bytes;
}
