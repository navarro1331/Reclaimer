import { createInterface } from 'node:readline';
import { api } from './contracts.mjs';
import { errorResult, VERSION } from './core.mjs';
export async function serve(ctx,{input=process.stdin,output=process.stdout}={}){
 let initialized=false,negotiated=false,queue=Promise.resolve();
 const pending=new Map(),send=message=>output.write(JSON.stringify({jsonrpc:'2.0',...message})+'\n');
 const catalog=api.tools.map(t=>({...t,description:'Investigate '+t.name.replaceAll('_',' ')+' using declared inputs and recorded evidence.'}));
 async function request(message,controller){
  const {id,method,params={}}=message;
  if(method==='initialize'){
   if(negotiated)throw Object.assign(new Error('Already initialized'),{rpcCode:-32600});
   if(!params.clientInfo?.name||!params.protocolVersion)throw Object.assign(new Error('Initialization parameters are incomplete'),{rpcCode:-32602});
   ctx.protocolVersion=['2024-11-05','2025-03-26','2025-06-18','2025-11-25'].includes(params.protocolVersion)?params.protocolVersion:'2025-11-25';
   ctx.client={name:params.clientInfo.name,version:params.clientInfo.version??''};ctx.clientCapabilities=params.capabilities??{};negotiated=true;
   return {protocolVersion:ctx.protocolVersion,capabilities:{tools:{listChanged:false},prompts:{listChanged:false}},serverInfo:{name:'real',version:VERSION}};
  }
  if(method==='ping')return {};
  if(!initialized)throw Object.assign(new Error('Initialization lifecycle is incomplete'),{rpcCode:-32000});
  if(method==='tools/list')return {tools:catalog};
  if(method==='prompts/list')return {prompts:api.prompts.map(p=>({...p,description:'Build an evidence-based investigation for '+p.name.replaceAll('_',' ')}))};
  if(method==='prompts/get'){
   const p=api.prompts.find(p=>p.name===params.name);if(!p)throw Object.assign(new Error('Unknown prompt'),{rpcCode:-32602});
   const args=params.arguments??{};for(const a of p.arguments??[])if(a.required&&(typeof args[a.name]!=='string'||!args[a.name]))throw Object.assign(new Error('Missing prompt argument '+a.name),{rpcCode:-32602});
   return {description:'Evidence-based '+p.name.replaceAll('_',' '),messages:[{role:'user',content:{type:'text',text:'Investigate '+p.name.replaceAll('_',' ')+'. Use these supplied constraints:\n'+JSON.stringify(args,null,2)+'\nInspect concrete artifacts or controlled runtime captures. Link each conclusion to retained evidence. State unresolved branches and prerequisite limits. A matching static output alone does not establish behavioral equivalence.'}}]};
  }
  if(method==='tools/call'){
   if(!api.tools.some(t=>t.name===params.name))throw Object.assign(new Error('Unknown tool'),{rpcCode:-32602});
   const previous=ctx.signal;ctx.signal=controller.signal;
   const token=params._meta?.progressToken;
   if(token!==undefined&&!controller.signal.aborted)send({method:'notifications/progress',params:{progressToken:token,progress:0,total:1}});
   try{const result=await ctx.call(params.name,params.arguments??{});if(token!==undefined&&!controller.signal.aborted)send({method:'notifications/progress',params:{progressToken:token,progress:1,total:1}});return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};}
   catch(error){const result=errorResult(error,params.name);return {isError:true,content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};}
   finally{ctx.signal=previous;}
  }
  throw Object.assign(new Error('Method not found'),{rpcCode:-32601});
 }
 const lines=createInterface({input,crlfDelay:Infinity});
 for await(const line of lines){
  if(Buffer.byteLength(line)>64*1024*1024){send({id:null,error:{code:-32700,message:'Message exceeds memory limit'}});continue;}
  let m;try{m=JSON.parse(line);}catch{send({id:null,error:{code:-32700,message:'Invalid JSON'}});continue;}
  if(!m||m.jsonrpc!=='2.0'||typeof m.method!=='string'){send({id:m?.id??null,error:{code:-32600,message:'Invalid request'}});continue;}
  if(m.id===undefined){
   if(m.method==='notifications/initialized'&&negotiated)initialized=true;
   if(m.method==='notifications/cancelled'){
    const id=m.params?.requestId,active=pending.get(id);
    if((typeof id==='string'||typeof id==='number'&&Number.isFinite(id))&&active&&active.method!=='initialize')active.controller.abort();
   }
   continue;
  }
  if(pending.has(m.id)){send({id:m.id,error:{code:-32600,message:'Duplicate active request identifier'}});continue;}
  const controller=new AbortController();pending.set(m.id,{controller,method:m.method});
  queue=queue.then(async()=>{
   try{if(controller.signal.aborted)throw Object.assign(new Error('Request cancelled'),{rpcCode:-32800});const result=await request(m,controller);if(!controller.signal.aborted)send({id:m.id,result});}
   catch(error){if(!controller.signal.aborted)send({id:m.id,error:{code:error.rpcCode??-32603,message:error.message}});}
   finally{pending.delete(m.id);}
  });
 }
 for(const {controller} of pending.values())controller.abort();
 await queue;
 if(ctx.target)await ctx.handlers.close_binary?.({},ctx);
}
