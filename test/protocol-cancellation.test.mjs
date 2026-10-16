import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {Context,digest} from '../lib/core.mjs';
import {handlers as sessions} from '../lib/session.mjs';
import {handlers as native} from '../lib/native.mjs';
import {handlers as evidence} from '../lib/evidence.mjs';
import {serve} from '../lib/protocol.mjs';
import {elfFixture} from './artifact-fixtures.mjs';

function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};}
async function bounded(promise,label,ms=5000){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label)),ms);})]);}finally{clearTimeout(timer);}}
const options={timeout:15000};
const initialize={jsonrpc:'2.0',id:'init',method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'owned-cancellation-fixture',version:'1'}}};
function harness(t){
 const input=new PassThrough(),output=new PassThrough(),frames=[],waiters=new Map(),ctx=new Context();
 ctx.handlers={...sessions};let buffered='';
 output.on('data',chunk=>{buffered+=chunk.toString('utf8');for(let end;(end=buffered.indexOf('\n'))>=0;){const line=buffered.slice(0,end);buffered=buffered.slice(end+1);if(!line)continue;const frame=JSON.parse(line);frames.push(frame);if(Object.hasOwn(frame,'id')){waiters.get(frame.id)?.resolve(frame);waiters.delete(frame.id);}}});
 const running=serve(ctx,{input,output});
 const send=message=>input.write(JSON.stringify({jsonrpc:'2.0',...message})+'\n');
 const response=id=>{const existing=frames.find(frame=>Object.hasOwn(frame,'id')&&frame.id===id);if(existing)return Promise.resolve(existing);const waiter=deferred();waiters.set(id,waiter);return bounded(waiter.promise,'Missing owned response '+id);};
 let closed=false;
 const close=async()=>{if(closed)return;closed=true;input.end();await bounded(running,'Owned protocol did not finish');output.end();};
 t.after(close);
 return{ctx,frames,send,response,close,running,async ready(){send(initialize);assert.ok((await response('init')).result);send({method:'notifications/initialized'});},cancel(requestId){send({method:'notifications/cancelled',params:{requestId,reason:'Owned cancellation'}});},async barrier(id='barrier'){send({id,method:'ping'});assert.deepEqual((await response(id)).result,{});}};
}
function paused(h,{fail=false}={}){
 const entered=deferred(),release=deferred(),original=h.ctx.handlers.binary_session;let invocations=0,signal;
 h.ctx.handlers.binary_session=async(args,ctx)=>{invocations++;signal=ctx.signal;entered.resolve();await release.promise;if(fail)throw new Error('Owned failure after cancellation');return original(args,ctx);};
 return{entered:()=>bounded(entered.promise,'Owned handler did not start'),release:release.resolve,get invocations(){return invocations;},get signal(){return signal;}};
}
function call(h,id,progressToken){h.send({id,method:'tools/call',params:{name:'binary_session',arguments:{},...(progressToken===undefined?{}:{_meta:{progressToken}})}});}
const replies=(h,id)=>h.frames.filter(frame=>Object.hasOwn(frame,'id')&&frame.id===id);
async function cancelActive(h,gate,id){h.cancel(id);if(!gate.signal.aborted)await bounded(new Promise(resolve=>gate.signal.addEventListener('abort',resolve,{once:true})),'Owned cancellation was not observed');}

if(process.argv[2]==='--owned-cancellation-server'){
 const folder=process.argv[3],file=path.join(folder,'owned.elf'),ctx=new Context();
 ctx.handlers={...sessions,...evidence,...native};ctx.run=async()=>assert.fail('Owned SDK cancellation must not launch a provider or selected target');
 await ctx.call('open_binary',{path:file});ctx.nativeSession.comments.set('0x400000','prior');
 await ctx.evidence('owned_protocol_marker',{}, {owned:true},{subject:null});
 const original=ctx.evidence,capture=()=>({comments:[...ctx.nativeSession.comments],records:[...ctx.ledger],history:structuredClone(ctx.history)});let used=false;
 ctx.evidence=async function(operation,...args){
  if(operation==='set_comment'&&!used){
   used=true;const signal=this.signal,baseline=capture();
   await fs.writeFile(path.join(folder,'entered.json'),JSON.stringify({request_signal_present:!!signal}),{flag:'wx'});
   if(!signal.aborted)await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));
   try{return await original.call(this,operation,...args);}
   finally{await fs.writeFile(path.join(folder,'aborted.json'),JSON.stringify({signal_aborted:signal.aborted,baseline,after:{comments:[...ctx.nativeSession.comments],records:[...ctx.ledger],history:ctx.history}}),{flag:'wx'});}
  }
  return original.call(this,operation,...args);
 };
 await serve(ctx);
}else{
 for(const id of [17,'owned-request'])test('active client cancellation emits no reply for '+typeof id+' request IDs',options,async t=>{
  const h=harness(t);await h.ready();const gate=paused(h);call(h,id);
  try{await gate.entered();await cancelActive(h,gate,id);}finally{gate.release();}
  await h.barrier();assert.equal(gate.signal.aborted,true);assert.equal(replies(h,id).length,0);assert.equal(h.ctx.history.length,0);
 });
 test('failure after client cancellation cannot create a late tool error response',options,async t=>{
  const h=harness(t);await h.ready();const gate=paused(h,{fail:true});call(h,'failure');
  try{await gate.entered();await cancelActive(h,gate,'failure');}finally{gate.release();}
  await h.barrier();assert.equal(replies(h,'failure').length,0);assert.equal(h.ctx.history.length,0);
 });
 test('queued cancellation skips handler execution and discards its response',options,async t=>{
  const h=harness(t);await h.ready();const gate=paused(h);call(h,'first');
  try{await gate.entered();call(h,'queued');h.cancel('queued');await new Promise(setImmediate);}finally{gate.release();}
  await h.barrier();assert.ok((await h.response('first')).result);assert.equal(replies(h,'queued').length,0);assert.equal(gate.invocations,1);
 });
 test('client cancellation stops further progress notifications as well as the final response',options,async t=>{
  const h=harness(t);await h.ready();const gate=paused(h);call(h,'progress','owned-progress');
  try{await gate.entered();assert.equal(h.frames.filter(f=>f.method==='notifications/progress').length,1);await cancelActive(h,gate,'progress');}finally{gate.release();}
  await h.barrier();assert.equal(replies(h,'progress').length,0);assert.deepEqual(h.frames.filter(f=>f.method==='notifications/progress').map(f=>f.params.progress),[0]);
 });
 test('unknown malformed and differently typed cancellation IDs do not abort a live request',options,async t=>{
  const h=harness(t);await h.ready();const gate=paused(h);call(h,31,'live');
  try{await gate.entered();for(const id of ['31','unknown',null,{},[]])h.cancel(id);h.send({method:'notifications/cancelled',params:{reason:'Owned missing ID'}});}finally{gate.release();}
  await h.barrier();assert.equal(gate.signal.aborted,false);assert.ok((await h.response(31)).result);assert.deepEqual(h.frames.filter(f=>f.method==='notifications/progress').map(f=>f.params.progress),[0,1]);
 });
 test('completed cancellation is ignored and the request ID remains reusable',options,async t=>{
  const h=harness(t);await h.ready();call(h,'reused');assert.ok((await h.response('reused')).result);h.cancel('reused');call(h,'reused');await h.barrier();assert.equal(replies(h,'reused').length,2);assert.ok(replies(h,'reused').every(f=>f.result&&!f.error));
 });
 test('an unsolicited provider AbortError retains the existing tool error envelope',options,async t=>{
  const h=harness(t);await h.ready();h.ctx.handlers.binary_session=async()=>{throw new DOMException('Owned provider cancellation','AbortError');};call(h,'provider-abort');const reply=await h.response('provider-abort');assert.equal(reply.result.isError,true);assert.equal(reply.result.structuredContent.error.code,'operation_cancelled');
 });
 test('client initialize cancellation is ignored and protocol negotiation completes',options,async t=>{
  const h=harness(t);h.send(initialize);h.cancel('init');assert.equal((await h.response('init')).result.protocolVersion,'2025-11-25');h.send({method:'notifications/initialized'});await h.barrier();
 });
 test('EOF aborts owned in-flight work without writing a response to the closed session',options,async t=>{
  const h=harness(t);await h.ready();const entered=deferred();let aborted=false;
  h.ctx.handlers.binary_session=async(args,ctx)=>{entered.resolve();await new Promise(resolve=>ctx.signal.addEventListener('abort',()=>{aborted=true;resolve();},{once:true}));return sessions.binary_session(args,ctx);};
  call(h,'eof');await bounded(entered.promise,'EOF handler did not start');await h.close();assert.equal(aborted,true);assert.equal(replies(h,'eof').length,0);assert.equal(h.ctx.history.length,0);
 });
 test('stock SDK cancellation has no unknown-ID notice and preserves annotation state before a valid retry',{timeout:90000},async t=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'reclaimer-protocol-cancel-')),file=path.join(folder,'owned.elf'),source=elfFixture();await fs.writeFile(file,source,{flag:'wx'});
  const client=new Client({name:'owned-cancellation-sdk',version:'1'}),transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(import.meta.url),'--owned-cancellation-server',folder],cwd:fileURLToPath(new URL('../',import.meta.url)),stderr:'pipe'}),errors=[];let pid;
  client.onerror=error=>errors.push({name:error.name,message:error.message});
  t.after(async()=>{try{await client.close();await transport.close();if(pid){const deadline=Date.now()+5000;let gone=false;while(Date.now()<deadline){try{process.kill(pid,0);}catch(error){if(error.code==='ESRCH'){gone=true;break;}throw error;}await delay(20);}assert.equal(gone,true,'Owned stock SDK server must physically exit');}assert.equal(digest(await fs.readFile(file)),digest(source));}finally{assert.equal(await fs.realpath(path.dirname(folder)),await fs.realpath(os.tmpdir()));assert.ok(path.basename(folder).startsWith('reclaimer-protocol-cancel-'));await fs.rm(folder,{recursive:true,force:true});}});
  const checkpoint=async name=>{const end=Date.now()+15000;while(Date.now()<end){try{return JSON.parse(await fs.readFile(path.join(folder,name),'utf8'));}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}await delay(20);}throw new Error('Owned SDK checkpoint deadline '+name);};
  await client.connect(transport);pid=transport.pid;assert.ok(Number.isSafeInteger(pid));
  const before=(await client.callTool({name:'get_evidence_bundle',arguments:{}})).structuredContent.result,controller=new AbortController();
  const pending=client.callTool({name:'set_comment',arguments:{address:'0x400000',comment:'cancelled'}},{signal:controller.signal,timeout:15000}).then(value=>({value}),error=>({error}));
  assert.equal((await checkpoint('entered.json')).request_signal_present,true);controller.abort(new Error('Owned SDK client abort'));
  const rejected=await bounded(pending,'SDK must reject promptly after the explicit abort');assert.equal(rejected.error?.message,String(controller.signal.reason),'SDK rejection must retain the explicit abort reason');const observation=await checkpoint('aborted.json');assert.equal(observation.signal_aborted,true);assert.deepEqual(observation.after,observation.baseline);
  await client.ping();assert.deepEqual((await client.callTool({name:'get_evidence_bundle',arguments:{}})).structuredContent.result,before);assert.deepEqual(errors,[],'Cancelled request must not produce a late unknown-ID SDK warning');
  const retried=await client.callTool({name:'set_comment',arguments:{address:'0x400000',comment:'retry'}});assert.equal(retried.isError,undefined);assert.equal(retried.structuredContent.normalized_result,true);
  const bundle=(await client.callTool({name:'get_evidence_bundle',arguments:{}})).structuredContent.result;assert.equal(bundle.records.length,before.records.length+1);for(const record of before.records)assert.deepEqual(bundle.records.find(r=>r.evidence_id===record.evidence_id),record);assert.deepEqual(errors,[]);
 });
}
