// Original byte writer for small, explicitly owned LLVM/Swift format packets.
export function declarationModule({name='OwnedPacket',access=4,final=true,attribute=182,invalidOffset=false,orphan=false,duplicate=false,version=903,path='owned-source-unread.swift',records=0,arrayLength=0}={}){
 const bits=[],frames=[];let width=2;
 const fixed=(value,n)=>{value=BigInt(value);for(let i=0;i<n;i++)bits.push(Number((value>>BigInt(i))&1n));},vbr=(value,n)=>{value=BigInt(value);const mask=(1n<<BigInt(n-1))-1n;do{const part=value&mask;value>>=BigInt(n-1);fixed(part|(value?1n<<BigInt(n-1):0n),n);}while(value);},align=()=>{while(bits.length%32)bits.push(0);},patch=(at,value,n)=>{for(let i=0;i<n;i++)bits[at+i]=Number((BigInt(value)>>BigInt(i))&1n);};
 fixed(0x0ea89ce2,32);
 function enter(id){fixed(1,width);vbr(id,8);vbr(3,4);align();const size=bits.length;fixed(0,32);frames.push({oldWidth:width,size,body:bits.length,abbreviations:0});width=3;}
 function end(){fixed(0,width);align();const frame=frames.pop();patch(frame.size,(bits.length-frame.body)/32,32);width=frame.oldWidth;}
 function record(code,values=[]){const start=bits.length;fixed(3,width);vbr(code,6);vbr(values.length,6);for(const value of values)vbr(value,6);return start;}
 function blob(code,data,values=[]){const frame=frames.at(-1),id=4+frame.abbreviations++;if(id>=8)throw new Error('Owned blob abbreviation count exceeded');fixed(2,width);vbr(2+values.length,5);fixed(1,1);vbr(code,8);for(const ignored of values){fixed(0,1);fixed(2,3);vbr(6,5);}fixed(0,1);fixed(5,3);const start=bits.length;fixed(id,width);for(const value of values)vbr(value,6);vbr(data.length,6);align();for(const value of data)fixed(value,8);align();return start;}
 enter(8);enter(9);blob(1,Buffer.alloc(0),[0,version,0,0,0,0,0,0]);blob(2,Buffer.from(name));blob(3,Buffer.from('x86_64-apple-macosx10.15'));end();
 enter(10);blob(1,Buffer.from(path));end();
 enter(11);const prefix=final?record(attribute,[0]):null;const declaration=record(67,[6,0,0,0,0,0,0,0,0,access,0,0]);for(let i=0;i<records;i++)record(150,[i]);if(arrayLength)record(150,Array(arrayLength).fill(0));end();
 enter(12);blob(1,Buffer.from('\0Packet\0'));end();enter(13);record(1,[]);record(2,duplicate?[prefix??declaration,declaration]:[(invalidOffset?1:0)+(orphan?declaration:prefix??declaration)]);record(3,[1]);record(17,[]);end();end();
 const bytes=Buffer.alloc(bits.length/8);bits.forEach((bit,i)=>{if(bit)bytes[i>>>3]|=1<<(i&7);});return {bytes,positions:{declaration,prefix},path};
}

export function declarationMacho(module){const bytes=Buffer.alloc(184+module.length),base=0x200000n;bytes.writeUInt32LE(0xfeedfacf);bytes.writeUInt32LE(0x1000007,4);bytes.writeUInt32LE(3,8);bytes.writeUInt32LE(1,12);bytes.writeUInt32LE(1,16);bytes.writeUInt32LE(152,20);bytes.writeUInt32LE(25,32);bytes.writeUInt32LE(152,36);bytes.write('__TEXT',40);bytes.writeBigUInt64LE(base,56);bytes.writeBigUInt64LE(BigInt(module.length),64);bytes.writeBigUInt64LE(184n,72);bytes.writeBigUInt64LE(BigInt(module.length),80);bytes.writeUInt32LE(1,88);bytes.writeUInt32LE(1,92);bytes.writeUInt32LE(1,96);bytes.write('__swift_ast',104);bytes.write('__TEXT',120);bytes.writeBigUInt64LE(base,136);bytes.writeBigUInt64LE(BigInt(module.length),144);bytes.writeUInt32LE(184,152);bytes.writeUInt32LE(2,156);module.copy(bytes,184);return bytes;}
