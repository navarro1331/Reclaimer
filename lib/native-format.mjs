import { checkAotSignal, aotBound, AOT_LIMIT } from './native-aot-memory.mjs';

export const NATIVE_HANDLE={String:0x1a,Field:0x23,FieldSignature:0x24,Method:0x28,MethodSignature:0x2b,Namespace:0x2f,NamespaceReference:0x30,Scope:0x38,ScopeReference:0x39,Type:0x3a,TypeReference:0x3d,TypeSpecification:0x3e};
export function nativeFormatBudget(options={}) {
  const limits={metadata_bytes:aotBound(options.maxMetadataBytes,AOT_LIMIT,AOT_LIMIT,'identity metadata byte'),nodes:aotBound(options.maxNodes,100000,100000,'identity node'),collection_items:aotBound(options.maxCollectionItems,250000,250000,'identity collection'),strings:aotBound(options.maxStringBytes,4*1024*1024,4*1024*1024,'identity string byte'),expanded_name_bytes:aotBound(options.maxExpandedNameBytes,4*1024*1024,4*1024*1024,'identity expanded name byte'),bindings:aotBound(options.maxBindings,250000,250000,'identity binding'),hash_entries:aotBound(options.maxHashEntries,100000,100000,'identity hash entry'),capture_bytes:aotBound(options.maxCaptureBytes,AOT_LIMIT,AOT_LIMIT,'identity capture byte'),output_bytes:aotBound(options.maxOutputBytes,8*1024*1024,8*1024*1024,'identity output byte')},used=Object.fromEntries(Object.keys(limits).map(key=>[key,0]));
  return {limits,used,take(kind,count=1){if(!Number.isSafeInteger(count)||count<0||used[kind]+count>limits[kind])throw Object.assign(new Error(`NativeAOT identity aggregate ${kind} budget exceeded`),{code:'capacity'});used[kind]+=count;}};
}

// Original implementation of the documented Native Format tagged integer
// representation. Cursor mutation happens only after the complete field exists.
export class NativeCursor {
  constructor(bytes,offset=0,{signal,budget}={}) {this.bytes=bytes;this.offset=offset;this.signal=signal;this.budget=budget;}
  require(size,at=this.offset){checkAotSignal(this.signal);if(!Number.isSafeInteger(at)||!Number.isSafeInteger(size)||at<0||size<0||at+size>this.bytes.length)throw new Error('NativeFormat field is outside its bounded blob');}
  integer(signed=false){this.require(1);const start=this.offset,tag=this.bytes[start],size=!(tag&1)?1:(tag&3)===1?2:(tag&7)===3?3:(tag&15)===7?4:5;this.require(size);let value=0,bits=32;
    if(size===5)value=this.bytes.readUInt32LE(start+1);else{for(let index=0;index<size;index++)value+=this.bytes[start+index]*2**(index*8);value=Math.floor(value/2**size);bits=size*7;}
    if(signed&&value>=2**(bits-1))value-=2**bits;this.offset+=size;return value;
  }
  u(){return this.integer(false);}
  s(){return this.integer(true);}
  list(){const count=this.u();this.budget?.take('collection_items',count);if(count>250000||count>this.bytes.length-this.offset)throw new Error('NativeFormat collection count exceeds its bounded byte extent');return Array.from({length:count},()=>this.u());}
  bytesArray(){const count=this.u();this.require(count);this.budget?.take('collection_items',count);const bytes=this.bytes.subarray(this.offset,this.offset+count);this.offset+=count;return bytes;}
  string(){const count=this.u();this.require(count);if(count>65536)throw Object.assign(new Error('NativeFormat individual UTF-8 name exceeds 64 KiB'),{code:'capacity'});this.budget?.take('strings',count);const bytes=this.bytes.subarray(this.offset,this.offset+count),value=new TextDecoder('utf-8',{fatal:true}).decode(bytes);this.offset+=count;return value;}
}

export function nativeHashtable(bytes,{signal,budget}={}) {
  const cursor=new NativeCursor(bytes,0,{signal,budget});cursor.require(1);const header=bytes[0],log=header>>>2,widthCode=header&3;
  if(log>16||widthCode>2)throw new Error('NativeFormat hashtable dimensions are unsupported or excessive');
  const buckets=2**log,width=2**widthCode,tableBytes=(buckets+1)*width;cursor.require(tableBytes,1);
  const boundaries=Array.from({length:buckets+1},(_,index)=>1+bytes.readUIntLE(1+index*width,width));
  if(boundaries[0]<1+tableBytes||boundaries.at(-1)>bytes.length||boundaries.some((value,index)=>index&&value<boundaries[index-1]))throw new Error('NativeFormat hashtable bucket extents are malformed');
  const entries=[];
  for(let bucket=0;bucket<buckets;bucket++){checkAotSignal(signal);const end=boundaries[bucket+1];cursor.offset=boundaries[bucket];let previous=-1;
    while(cursor.offset<end){budget?.take('hash_entries');const start=cursor.offset,hash=bytes[cursor.offset++],relativeAt=cursor.offset,relative=cursor.s(),target=relativeAt+relative;
      if(cursor.offset>end||hash<previous||target<0||target>=bytes.length)throw new Error('NativeFormat hashtable entry is malformed');previous=hash;entries.push({bucket,hash,offset:start,size:cursor.offset-start,target});}
  }
  return {entries,bucket_count:buckets,table_size_bytes:tableBytes+1,entry_end:boundaries.at(-1)};
}
