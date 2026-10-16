import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Context} from '../lib/core.mjs';
import {handlers} from '../lib/native.mjs';
import {digest} from '../lib/artifact-binary.mjs';
import {elfFixture} from './artifact-fixtures.mjs';

async function fixture(t){
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'reclaimer-name-batch-'));
 const file=path.join(folder,'owned.elf'),bytes=elfFixture();await fs.writeFile(file,bytes,{flag:'wx'});
 const ctx=new Context({signal:t.signal});ctx.handlers=handlers;
 ctx.run=async()=>assert.fail('Owned name validation must not launch a provider or target');
 await ctx.call('open_binary',{path:file});
 ctx.nativeSession.names.set('0x400060','prior-name');ctx.nativeSession.names.set('0x400070','unrelated-name');
 ctx.nativeSession.comments.set('0x400060','owned-comment');ctx.nativeSession.inlineComments.set('0x400061','owned-inline');ctx.nativeSession.bookmarks.set('0x400070','owned-bookmark');
 await ctx.evidence('owned_name_marker',{}, {marker:17},{subject:null});
 const capture=()=>({target:ctx.target,session:ctx.nativeSession,maps:Object.fromEntries(['names','comments','inlineComments','bookmarks'].map(k=>[k,{ref:ctx.nativeSession[k],entries:structuredClone([...ctx.nativeSession[k]])}])),ledger:ctx.ledger,records:structuredClone([...ctx.ledger]),history:structuredClone(ctx.history)});
 function unchanged(before){assert.equal(ctx.target,before.target);assert.equal(ctx.nativeSession,before.session);for(const[k,v]of Object.entries(before.maps)){assert.equal(ctx.nativeSession[k],v.ref);assert.deepEqual([...ctx.nativeSession[k]],v.entries);}assert.equal(ctx.ledger,before.ledger);assert.deepEqual([...ctx.ledger],before.records);assert.deepEqual(ctx.history,before.history);}
 t.after(async()=>{ctx.signal=undefined;if(ctx.target)await ctx.call('close_binary',{});assert.equal(await fs.realpath(path.dirname(folder)),await fs.realpath(os.tmpdir()));assert.ok(path.basename(folder).startsWith('reclaimer-name-batch-'));await fs.rm(folder,{recursive:true,force:true});});
 return {ctx,capture,unchanged,sourceUnchanged:async()=>assert.equal(digest(await fs.readFile(file)),digest(bytes))};
}

for(const invalid of ['not-address','0xno','ram:0xzz','module!:1'])for(const position of ['middle','last']){
 test('batch names reject '+invalid+' in '+position+' without partial writes and permit retry',async t=>{
  const f=await fixture(t),valid=[['0x400060','replacement'],['0x400061','new-name']],entries=position==='middle'?[valid[0],[invalid,'invalid'],valid[1]]:[...valid,[invalid,'invalid']];
  const before=f.capture();await assert.rejects(f.ctx.call('set_addresses_names',{names:Object.fromEntries(entries)}),/Address must be/);f.unchanged(before);await f.sourceUnchanged();
  const reply=await f.ctx.call('set_addresses_names',{names:Object.fromEntries(valid)});
  assert.deepEqual(reply.normalized_result,{'0x400060':true,'0x400061':true});assert.equal(f.ctx.nativeSession.names,before.maps.names.ref);
  assert.equal(f.ctx.nativeSession.names.get('0x400060'),'replacement');assert.equal(f.ctx.nativeSession.names.get('0x400061'),'new-name');assert.equal(f.ctx.nativeSession.names.get('0x400070'),'unrelated-name');
  assert.equal(f.ctx.ledger.size,before.records.length+1);assert.equal(f.ctx.history.length,before.history.length+1);for(const[id,r]of before.records)assert.deepEqual(f.ctx.ledger.get(id),r);await f.sourceUnchanged();
 });
}

test('first invalid address preserves all prior state',async t=>{const f=await fixture(t),before=f.capture();await assert.rejects(f.ctx.call('set_addresses_names',{names:{'not-address':'invalid','0x400060':'changed'}}),/Address must be/);f.unchanged(before);await f.sourceUnchanged();});

test('valid batches preserve original keys, alias order, empty names, named spaces and unmapped addresses',async t=>{
 const f=await fixture(t),before=f.capture(),names={'10':'first','0x10':'second','ram:10':'last','register:0xA':'register-name','0xffff':''};
 const reply=await f.ctx.call('set_addresses_names',{names,document:'ignored-owned-document'});
 assert.deepEqual(reply.normalized_result,Object.fromEntries(Object.keys(names).map(k=>[k,true])));assert.equal(f.ctx.nativeSession.names,before.maps.names.ref);
 assert.equal(f.ctx.nativeSession.names.get('0x10'),'last');assert.equal(f.ctx.nativeSession.names.get('register:0xA'),'register-name');assert.equal(f.ctx.nativeSession.names.get('0xffff'),'');
 assert.equal(f.ctx.nativeSession.names.get('0x400060'),'prior-name');for(const k of ['comments','inlineComments','bookmarks'])assert.deepEqual([...f.ctx.nativeSession[k]],before.maps[k].entries);
 const held=structuredClone(f.ctx.ledger.get(reply.evidence_id));reply.normalized_result['0x10']=false;assert.deepEqual(f.ctx.ledger.get(reply.evidence_id),held);await f.sourceUnchanged();
});

test('empty selected batch succeeds without changing annotation maps',async t=>{const f=await fixture(t),before=f.capture(),reply=await f.ctx.call('set_addresses_names',{names:{}});assert.deepEqual(reply.normalized_result,{});assert.equal(f.ctx.nativeSession.names,before.maps.names.ref);assert.deepEqual([...f.ctx.nativeSession.names],before.maps.names.entries);await f.sourceUnchanged();});

test('empty batch still succeeds without a selected target',async()=>{const ctx=new Context();ctx.handlers=handlers;const before={target:ctx.target,session:ctx.nativeSession};const reply=await ctx.call('set_addresses_names',{names:{}});assert.deepEqual(reply.normalized_result,{});assert.equal(ctx.target,before.target);assert.equal(ctx.nativeSession,before.session);});

test('nonempty batch without a target preserves missing-session error precedence',async()=>{const ctx=new Context();ctx.handlers=handlers;await assert.rejects(ctx.call('set_addresses_names',{names:{'not-address':'name'}}),/No binary is open/);assert.equal(ctx.ledger.size,0);assert.deepEqual(ctx.history,[]);});

test('pre-aborted batch does not change any prior state',async t=>{const f=await fixture(t),before=f.capture(),controller=new AbortController();controller.abort();f.ctx.signal=controller.signal;await assert.rejects(f.ctx.call('set_addresses_names',{names:{'0x400060':'changed'}}),e=>e.code==='cancelled');f.unchanged(before);await f.sourceUnchanged();});
