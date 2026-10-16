import {chargeJsonBytes} from './bounded-json.mjs';

const limits={records:1000000,work:4000000,string_bytes:8*1024*1024,output_bytes:16*1024*1024};
export function formatBudget({signal,...selected}={}){
 const ceiling={...limits};for(const [name,value]of Object.entries(selected)){if(!Object.hasOwn(limits,name)||!Number.isSafeInteger(value)||value<1||value>limits[name])throw new Error('Invalid format budget '+name);ceiling[name]=value;}
 const used=Object.fromEntries(Object.keys(limits).map(name=>[name,0]));
 const take=(name,count=1)=>{signal?.throwIfAborted();if(!Number.isSafeInteger(count)||count<0||!Object.hasOwn(ceiling,name))throw new Error('Invalid format resource charge');used[name]+=count;if(used[name]>ceiling[name])throw Object.assign(new Error('Artifact format '+name+' budget exceeded'),{code:'capacity'});};
 const work=()=>take('work'),output=value=>chargeJsonBytes(value,size=>take('output_bytes',size),work);
 return {used,limits:ceiling,take,work,output,check:()=>signal?.throwIfAborted()};
}
