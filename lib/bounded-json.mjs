// Count the JSON that will actually be retained, without constructing its
// expanded text. A small reference DAG must not allocate an exponential string
// before the aggregate output limit can reject it.
export function chargeJsonBytes(value,charge,work) {
 const active=new Set(),stack=[];
 function text(value){charge(2);for(let i=0;i<value.length;i++){if(i%1024===0)work();const c=value.charCodeAt(i);if(c===34||c===92)charge(2);else if(c<32)charge([8,9,10,12,13].includes(c)?2:6);else if(c<128)charge(1);else if(c<2048)charge(2);else if(c>=0xd800&&c<=0xdbff&&value.charCodeAt(i+1)>=0xdc00&&value.charCodeAt(i+1)<=0xdfff){charge(4);i++;}else if(c>=0xd800&&c<=0xdfff)charge(6);else charge(3);}}
 function prepare(value,key){work();if(value!==null&&['object','function','bigint'].includes(typeof value)){const method=value.toJSON;if(typeof method==='function')value=method.call(value,key);}if(value instanceof Number)value=Number(value);else if(value instanceof String)value=String(value);else if(value instanceof Boolean)value=Boolean.prototype.valueOf.call(value);else if(value!==null&&typeof value==='object'&&Object.getPrototypeOf(value)===BigInt.prototype)value=BigInt.prototype.valueOf.call(value);return value;}
 const omitted=value=>['undefined','function','symbol'].includes(typeof value);
 value=prepare(value,'');if(omitted(value))throw new TypeError('Root value has no JSON representation');stack.push({kind:'value',value});
 while(stack.length){work();const frame=stack.at(-1);
  if(frame.kind==='value'){
   stack.pop();const v=frame.value;if(v===null){charge(4);continue;}if(typeof v==='string'){text(v);continue;}if(typeof v==='boolean'){charge(v?4:5);continue;}if(typeof v==='number'){charge(Number.isFinite(v)?JSON.stringify(v).length:4);continue;}if(typeof v==='bigint')throw new TypeError('BigInt has no JSON representation');
   if(active.has(v))throw new TypeError('Circular value has no JSON representation');active.add(v);charge(1);stack.push(Array.isArray(v)?{kind:'array',value:v,index:0,length:v.length}:{kind:'object',value:v,index:0,keys:Object.keys(v),written:false});continue;
  }
  if(frame.kind==='array'){
   if(frame.index===frame.length){charge(1);active.delete(frame.value);stack.pop();continue;}const index=frame.index++;if(index)charge(1);const v=prepare(frame.value[index],String(index));stack.push({kind:'value',value:omitted(v)?null:v});continue;
  }
  if(frame.index===frame.keys.length){charge(1);active.delete(frame.value);stack.pop();continue;}const key=frame.keys[frame.index++],v=prepare(frame.value[key],key);if(omitted(v))continue;if(frame.written)charge(1);frame.written=true;text(key);charge(1);stack.push({kind:'value',value:v});
 }
}
