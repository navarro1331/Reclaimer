import * as plist from 'plist';
import { bounds, number } from './artifact-binary.mjs';

// Apple binary property list object decoding. UIDs remain explicit references.
export function parseBinaryPlist(b,{maxObjects=100000,maxDepth=128}={}) {
  if(b.subarray(0,8).toString()!=='bplist00')throw new Error('Expected bplist00');bounds(b,b.length-32,32);
  const t=b.length-32,offsetWidth=b[t+6],refWidth=b[t+7],count=number(b.readBigUInt64BE(t+8)),root=number(b.readBigUInt64BE(t+16)),offsetTable=number(b.readBigUInt64BE(t+24));
  if(!offsetWidth||offsetWidth>8||!refWidth||refWidth>8||count>maxObjects||root>=count||offsetTable<8||offsetTable+count*offsetWidth>t)throw new Error('Invalid or oversized binary plist trailer');
  const uint=(at,n)=>{bounds(b,at,n);let v=0n;for(let i=0;i<n;i++)v=v*256n+BigInt(b[at+i]);return v;};
  bounds(b,offsetTable,count*offsetWidth);const offsets=Array.from({length:count},(_,i)=>number(uint(offsetTable+i*offsetWidth,offsetWidth))),cache=new Map(),active=new Set();if(offsets.some(o=>o<8||o>=offsetTable))throw new Error('Binary plist object offset escapes object data');
  const objectBounds=(at,size)=>{bounds(b,at,size);if(at<8||at+size>offsetTable)throw new Error('Binary plist object payload escapes object data');};
  function parse(index,depth=0){if(cache.has(index))return cache.get(index);if(depth>maxDepth)throw new Error('Binary plist depth bound exceeded');if(index<0||index>=count)throw new Error('Binary plist reference out of range');if(active.has(index))return{$cycle:index};active.add(index);let at=offsets[index];objectBounds(at,1);const marker=b[at++],kind=marker>>4,info=marker&15;let len=info;
    if([4,5,6,7,10,11,12,13].includes(kind)&&info===15){objectBounds(at,1);const n=b[at++];if(n>>4!==1)throw new Error('Invalid plist extended length');const width=2**(n&15);if(width>8)throw new Error('Oversized plist extended length');objectBounds(at,width);len=number(uint(at,width));at+=width;}
    let value;if(kind===0){value=info===0?null:info===8?false:info===9?true:{$unknown_simple:info};}
    else if(kind===1){const width=2**info;if(width>16)throw new Error('Oversized plist integer');objectBounds(at,width);let n=uint(at,width);if(width>=8&&(b[at]&128))n-=1n<<BigInt(width*8);value=n>=BigInt(Number.MIN_SAFE_INTEGER)&&n<=BigInt(Number.MAX_SAFE_INTEGER)?Number(n):{$integer:n.toString()};}
    else if(kind===2){const width=2**info;objectBounds(at,width);value=width===4?b.readFloatBE(at):width===8?b.readDoubleBE(at):{$unknown_real:b.subarray(at,at+width).toString('base64')};if(typeof value==='number'&&!Number.isFinite(value))value={$real:String(value)};}
    else if(kind===3){objectBounds(at,8);value={$date:new Date((b.readDoubleBE(at)+978307200)*1000).toISOString()};}
    else if(kind===4){objectBounds(at,len);value={$data:b.subarray(at,at+len).toString('base64')};}
    else if(kind===5||kind===7){objectBounds(at,len);value=b.subarray(at,at+len).toString(kind===5?'ascii':'utf8');}
    else if(kind===6){objectBounds(at,len*2);let text='';for(let i=0;i<len;i++)text+=String.fromCharCode(b.readUInt16BE(at+i*2));value=text;}
    else if(kind===8){objectBounds(at,info+1);value={$uid:number(uint(at,info+1))};}
    else if(kind===10||kind===11||kind===12){objectBounds(at,len*refWidth);value=Array.from({length:len},(_,i)=>parse(number(uint(at+i*refWidth,refWidth)),depth+1));if(kind!==10)value={$set:value};}
    else if(kind===13){objectBounds(at,len*refWidth*2);value=Object.create(null);for(let i=0;i<len;i++){const key=parse(number(uint(at+i*refWidth,refWidth)),depth+1),val=parse(number(uint(at+(len+i)*refWidth,refWidth)),depth+1);if(typeof key!=='string')throw new Error('Non-string plist dictionary key');value[key]=val;}}
    else value={$unknown_object_kind:kind};cache.set(index,value);active.delete(index);return value;
  }return parse(root);
}
export function parsePlist(b) {
  if(b.subarray(0,8).toString()==='bplist00')return{format:'binary',value:parseBinaryPlist(b)};
  const text=b.toString('utf8');if(/^\s*[\[{]/.test(text))return{format:'json',value:JSON.parse(text)};
  if(/<plist[\s>]/.test(text)){if(/<!ENTITY/i.test(text))throw new Error('Custom XML entities are not accepted');const normalize=v=>v instanceof Uint8Array?{$data:Buffer.from(v).toString('base64')}:v instanceof Date?{$date:v.toISOString()}:Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,normalize(x)])):v;return{format:'xml',value:normalize(plist.parse(text))};}
  throw new Error('Unsupported property list serialization');
}
export function keyedArchive(parsed,offset=0,limit=200) {
  const value=parsed.value;if(!Array.isArray(value?.$objects)||!value?.$top)throw new Error('Property list is not an NSKeyedArchive object table');
  const table=value.$objects,refs=[];const uid=x=>Number.isInteger(x?.$uid)?x.$uid:Number.isInteger(x?.['CF$UID'])?x['CF$UID']:null;
  function scan(x,source,path=[],depth=0){if(depth>128)return;const target=uid(x);if(target!==null){refs.push({source,path,target:target<0?null:target,status:target<0?'malformed':target>=table.length?'unresolved':target===0&&(table[0]===null||table[0]==='$null')?'nil':'resolved',raw:x});return;}if(Array.isArray(x))x.forEach((v,i)=>scan(v,source,[...path,i],depth+1));else if(x&&typeof x==='object')for(const [k,v] of Object.entries(x))scan(v,source,[...path,k],depth+1);}
  scan(value.$top,null);table.forEach((v,i)=>scan(v,i));
  const objects=table.slice(offset,offset+limit).map((v,j)=>{const id=offset+j,cid=uid(v?.$class),cls=cid===null?null:table[cid],nil=v===null||v==='$null';return{id,kind:nil?'nil':Array.isArray(v)?'array':typeof v==='object'?(v.$classname?'class-descriptor':cid===null?'dictionary':'archived-object'):'scalar',class_id:cid,class_name:typeof cls?.$classname==='string'?cls.$classname:null,status:nil?'nil':cid!==null&&!cls?'unresolved-class':'observed',value:v};});
  return{archive_format:parsed.format==='binary'?'binary-plist':'xml-plist',roots:value.$top,objects,references:refs,total_objects:table.length,total_references:refs.length,offset,next_offset:offset+objects.length<table.length?offset+objects.length:null,truncated:offset+objects.length<table.length,limitations:['Objects are decoded as data; archived Objective-C classes are never instantiated.']};
}
