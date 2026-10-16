/** DEX/JVMS modified UTF-8 encodes UTF-16 units; it is not ordinary UTF-8. */
export function decodeModifiedUtf8(bytes,{budget,expectedUnits}={}){
 const units=new Uint16Array(bytes.length);let count=0,steps=0;
 for(let at=0;at<bytes.length;){if(steps++%1024===0)budget?.work();const first=bytes[at++];let value;
  if(first>0&&first<128)value=first;
  else if(first>=0xc0&&first<=0xdf){if(at>=bytes.length||(bytes[at]&0xc0)!==0x80)throw new Error('Invalid modified UTF-8 continuation');value=((first&31)<<6)|(bytes[at++]&63);if(value<128&&!(first===0xc0&&value===0))throw new Error('Noncanonical modified UTF-8 sequence');}
  else if(first>=0xe0&&first<=0xef){if(at+1>=bytes.length||(bytes[at]&0xc0)!==0x80||(bytes[at+1]&0xc0)!==0x80)throw new Error('Invalid modified UTF-8 continuation');value=((first&15)<<12)|((bytes[at++]&63)<<6)|(bytes[at++]&63);if(value<2048)throw new Error('Noncanonical modified UTF-8 sequence');}
  else throw new Error('Invalid modified UTF-8 leading byte');
  units[count++]=value;
 }
 if(expectedUnits!==undefined&&count!==expectedUnits)throw new Error('Modified UTF-8 UTF-16 length mismatch');
 let text='';for(let at=0;at<count;at+=16384){budget?.work();text+=String.fromCharCode(...units.subarray(at,Math.min(count,at+16384)));}return text;
}
