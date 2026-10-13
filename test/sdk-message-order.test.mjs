import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {orderedSdkDelivery} from './sdk-message-order.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),testRoot=join(root,'test');
test('official SDK receives both progress events when owned server writes notifications and reply together',async t=>{
 const folder=await mkdtemp(join(testRoot,'runtime-sdk-batched-'));
 let serverExitConfirmed=false;
 t.after(async()=>{assert.ok(resolve(folder).startsWith(resolve(testRoot)+sep+'runtime-sdk-batched-'));if(serverExitConfirmed)await rm(folder,{recursive:true,force:true,maxRetries:8,retryDelay:100});});
 const server=join(folder,'owned-server.cjs');
 await writeFile(server,String.raw`const {createInterface}=require('node:readline');
const send=value=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',...value})+'\n');
createInterface({input:process.stdin}).on('line',line=>{
 const message=JSON.parse(line);
 if(message.method==='initialize')return send({id:message.id,result:{protocolVersion:message.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'owned-batched-fixture',version:'1'}}});
 if(message.method==='tools/call'){
  const progressToken=message.params._meta.progressToken;
  const messages=[{method:'notifications/progress',params:{progressToken,progress:0,total:1}},{method:'notifications/progress',params:{progressToken,progress:1,total:1}},{id:message.id,result:{content:[{type:'text',text:'owned single-write reply'}]}}];
  if(message.params.arguments.reply_first)messages.unshift(messages.pop());
  process.stdout.write(messages.map(value=>JSON.stringify({jsonrpc:'2.0',...value})).join('\n')+'\n');
 }
});`);
 const client=new Client({name:'owned-batched-progress-client',version:'1'}),transport=new StdioClientTransport({command:process.execPath,args:[server],cwd:testRoot,stderr:'pipe'});
 let serverPid;
 try{
  await client.connect(transport);serverPid=transport.pid;assert.ok(Number.isInteger(serverPid)&&serverPid>0);
  const drain=orderedSdkDelivery(transport),received=[],dispatch=transport.onmessage,progress=[];
  transport.onmessage=(message,extra)=>{received.push(message);return dispatch(message,extra);};
  const result=await client.callTool({name:'owned_echo',arguments:{}},{onprogress:p=>progress.push(p),timeout:15000});
  await drain();
  assert.deepEqual(progress.map(p=>p.progress),[0,1]);
  assert.equal(result.content[0].text,'owned single-write reply');
  assert.deepEqual(received.map(m=>m.method??'reply'),['notifications/progress','notifications/progress','reply']);
  assert.equal(received[0].params.progressToken,received[2].id);
  assert.equal(received[1].params.progressToken,received[2].id);
  // The adapter must not rescue incorrectly ordered messages by moving progress before a reply.
  const errors=[],lateProgress=[],negativeStart=received.length;client.onerror=error=>errors.push(error);
  const replyFirst=await client.callTool({name:'owned_echo',arguments:{reply_first:true}},{onprogress:p=>lateProgress.push(p),timeout:15000});
  await drain();
  assert.equal(replyFirst.content[0].text,'owned single-write reply');
  const negative=received.slice(negativeStart);
  assert.deepEqual(negative.map(m=>m.method??'reply'),['reply','notifications/progress','notifications/progress']);
  assert.equal(negative[0].id,negative[1].params.progressToken);assert.equal(negative[0].id,negative[2].params.progressToken);
  assert.deepEqual(lateProgress,[]);assert.equal(errors.length,2);
  for(const error of errors)assert.match(error.message,/progress notification for an unknown token/);

 }finally{
  await client.close();await transport.close();
  if(serverPid){
   const deadline=Date.now()+10000;
   while(Date.now()<deadline){
    try{process.kill(serverPid,0);}catch(error){if(error.code==='ESRCH'){serverExitConfirmed=true;break;}throw error;}
    await new Promise(resolve=>setTimeout(resolve,25));
   }
   assert.equal(serverExitConfirmed,true,'The owned SDK server must physically exit before fixture removal');
   t.diagnostic('Owned SDK server '+serverPid+' exited before removing its unique generated fixture.');
  }
 }
});
