// Independently authored byte packets. These are grammar probes, not captures
// or claims that the deliberately adverse combinations are executable Swift.
export function swiftExtensionPacket({types,selected=types.length,version=903}={}){
 const bits=[],frames=[],declOffsets=[],typeOffsets=[];let width=2;
 const fixed=(value,n)=>{value=BigInt(value);for(let i=0;i<n;i++)bits.push(Number(value>>BigInt(i)&1n));};
 const vbr=(value,n)=>{value=BigInt(value);const mask=(1n<<BigInt(n-1))-1n;do{const part=value&mask;value>>=BigInt(n-1);fixed(part|(value?1n<<BigInt(n-1):0n),n);}while(value);};
 const align=()=>{while(bits.length%32)bits.push(0);};
 function enter(id){fixed(1,width);vbr(id,8);vbr(3,4);align();const at=bits.length;fixed(0,32);frames.push({width,at,start:bits.length,abbreviations:0,block:id});width=3;}
 function end(){fixed(0,width);align();const f=frames.pop(),words=(bits.length-f.start)/32;for(let i=0;i<32;i++)bits[f.at+i]=words>>>i&1;width=f.width;}
 function code(value){if(frames.at(-1).block!==11)return value;if(version===944)return value===41?21:value>=21&&value<=39?value+1:value;if(version===871)return value>=5&&value<=37?value+1:value>=50&&value<=75?value-10:value;return value;}
 function record(value,values=[]){const at=bits.length;fixed(3,width);vbr(code(value),6);vbr(values.length,6);for(const value of values)vbr(value,6);return at;}
 function blob(value,bytes,values=[]){const f=frames.at(-1),id=4+f.abbreviations++;fixed(2,width);vbr(2+values.length,5);fixed(1,1);vbr(code(value),8);for(const value of values){fixed(0,1);fixed(2,3);vbr(6,5);}fixed(0,1);fixed(5,3);const at=bits.length;fixed(id,width);for(const value of values)vbr(value,6);vbr(bytes.length,6);align();for(const value of bytes)fixed(value,8);align();return at;}
 const strings=Buffer.from('\0Token\0Elements\0shape\0'),offsets=[1,7,16];
 fixed(0x0ea89ce2,32);enter(8);enter(9);blob(1,Buffer.alloc(0),[0,version,0,0,0,0,0,0]);blob(2,Buffer.from('OwnedExtension'));blob(3,Buffer.from('x86_64-apple-macosx10.15'));end();
 enter(10);blob(1,Buffer.from('../never-read/extension.swift'));end();enter(11);
 declOffsets.push(record(53,[6,0,0,0,0,4,0,0]));declOffsets.push(record(51,[7,0,0,0]));
 const property=Array(24).fill(0);property[0]=8;property[16]=selected;property[19]=4;declOffsets.push(record(55,property));
 for(const type of types){typeOffsets.push(type.blob!==undefined?blob(type.code,Buffer.from(type.blob),type.values??[]):record(type.code,type.values??[]));for(const tail of type.trailing??[])record(tail.code,tail.values);}
 end();enter(12);blob(1,strings);end();enter(13);record(1,typeOffsets);record(2,declOffsets);record(3,offsets);record(12,[]);record(15,[]);record(17,[]);record(18,[]);end();end();
 const bytes=Buffer.alloc(bits.length/8);bits.forEach((value,i)=>{if(value)bytes[i>>>3]|=1<<(i&7);});return bytes;
}
