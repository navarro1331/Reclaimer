import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {engine} from '../lib/engine.mjs';
import {digest} from '../lib/core.mjs';
import {prepareCommand} from '../lib/cli-routes.mjs';
import {invokePrepared} from '../lib/cli.mjs';

test('CLI analysis integrity option fails or records a changed source without relabelling old findings',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'real-cli-integrity-')),path=join(directory,'fixture.com');
 const original=Buffer.from([0xb8,0x2a,0x00,0xc3]),changed=Buffer.from([0xb8,0x2b,0x00,0xc3]);
 for(const policy of ['fail','record-and-continue']){
  await writeFile(path,original);const ctx=await engine();
  const route=prepareCommand('analyze',{path},{'target-format':'dos-com',integrityPolicy:policy});assert.equal(route.integrityPolicy,policy);
  const open=ctx.handlers.open_binary;
  ctx.handlers.open_binary=async(a,c)=>{const result=await open(a,c);await writeFile(path,changed);return result;};
  try{
   if(policy==='fail')await assert.rejects(()=>invokePrepared(ctx,route),/changed since/);
   else {const record=await invokePrepared(ctx,route);assert.equal(record.subject.digest.sha256,digest(original));assert.ok(record.limitations.some(s=>s.includes(digest(original))&&s.includes(digest(changed))));assert.equal(record.parameters.integrity_policy,policy);}
  }finally{if(ctx.target)await ctx.call('close_binary',{});}
 }
});

test('cached native and byte models reject stale source bytes in ordinary MCP sessions',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'real-cache-integrity-')),path=join(directory,'cached.com');
 const original=Buffer.from([0xb8,0x2a,0x00,0xc3]),changed=Buffer.from([0xb8,0x2b,0x00,0xc3]);
 await writeFile(path,original);const ctx=await engine();
 try{
  await ctx.call('open_binary',{path,format:'dos-com'});await ctx.call('binary_overview',{});
  await writeFile(path,changed);const before=ctx.ledger.size;
  await assert.rejects(()=>ctx.call('binary_overview',{}),/changed since/);assert.equal(ctx.ledger.size,before);
  ctx.nativeSession.model={provider:'independent-fixture'};
  await assert.rejects(()=>ctx.call('procedure_pseudo_code',{procedure:'0x100'}),/Source artifact changed/);
 }finally{if(ctx.target)await ctx.call('close_binary',{});}
});

test('the public auto provider option selects the explicitly configured native route',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'real-auto-provider-')),path=join(directory,'selected.com');await writeFile(path,Buffer.from([0xb8,0x2a,0x00,0xc3]));
 for(const nativeProvider of ['ghidra','ida','operator-model']){const ctx=await engine({config:{nativeProvider}});try{await ctx.call('open_binary',{path,format:'dos-com',provider_id:'auto'});assert.equal(ctx.target.provider_id,nativeProvider);}finally{if(ctx.target)await ctx.call('close_binary',{});}}
});
