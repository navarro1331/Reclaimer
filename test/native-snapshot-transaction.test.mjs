import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Context} from '../lib/core.mjs';
import {handlers} from '../lib/native.mjs';
import {elfFixture} from './artifact-fixtures.mjs';
import {digest} from '../lib/artifact-binary.mjs';

// Owned snapshots exercise restore transactions; no provider or target executes.
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'reclaimer-snapshot-'));
  const source=path.join(root,'owned.elf'),snapshot=path.join(root,'owned-session.json');
  const bytes=elfFixture();await fs.writeFile(source,bytes,{flag:'wx'});
  const contexts=[];
  function context(signal=t.signal){
    const ctx=new Context({signal,config:{nativeProvider:'custom'}});ctx.handlers=handlers;
    ctx.run=async()=>assert.fail('Snapshot tests must not launch a provider or target');
    contexts.push(ctx);return ctx;
  }
  t.after(async()=>{
    for(const ctx of contexts)if(ctx.target)await handlers.close_binary({},ctx);
    assert.equal(await fs.realpath(path.dirname(root)),await fs.realpath(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('reclaimer-snapshot-'));
    await fs.rm(root,{recursive:true,force:true});
  });
  const producer=context();await producer.call('open_binary',{path:source});
  await producer.call('set_address_name',{address:'0x400060',name:'OwnedEntry'});
  await producer.call('set_comment',{address:'0x400060',comment:'Owned comment'});
  await producer.call('set_inline_comment',{address:'0x400060',comment:'Owned inline'});
  await producer.call('set_bookmark',{address:'0x400060'});
  const record=await producer.call('address_name',{address:'0x400060'});
  await producer.call('close_binary',{snapshot_path:snapshot});
  const packet=JSON.parse(await fs.readFile(snapshot,'utf8'));
  assert.equal(packet.evidence.length,producer.ledger.size);assert.ok(packet.evidence.some(e=>e.evidence_id===record.evidence_id));
  const ctx=context();
  await ctx.evidence('owned_snapshot_marker',{fixture:'unrelated'},'Retained independently authored marker',{subject:null,authority:'analyst-inference'});
  ctx.unknowns.set('owned:unrelated',{fixture:'Unrelated context sentinel'});
  function capture(){return {target:ctx.target,session:ctx.nativeSession,ledger:ctx.ledger,
    records:structuredClone([...ctx.ledger]),unknowns:ctx.unknowns,
    unknownEntries:structuredClone([...ctx.unknowns]),history:structuredClone(ctx.history)};}
  function unchanged(before){
    assert.equal(ctx.target,before.target,'Failed restore must not select a binary');
    assert.equal(ctx.nativeSession,before.session,'Failed restore must not publish a partial session');
    assert.equal(ctx.ledger,before.ledger);assert.deepEqual([...ctx.ledger],before.records);
    assert.equal(ctx.unknowns,before.unknowns);assert.deepEqual([...ctx.unknowns],before.unknownEntries);
    assert.deepEqual(ctx.history,before.history);
  }
  async function write(value){await fs.writeFile(snapshot,JSON.stringify(value));return digest(await fs.readFile(snapshot));}
  async function preserved(snapshotHash){assert.equal(digest(await fs.readFile(source)),digest(bytes));assert.equal(digest(await fs.readFile(snapshot)),snapshotHash);}
  async function retry(){ctx.signal=t.signal;await ctx.call('open_binary',{path:source});await ctx.call('close_binary',{});}
  return {ctx,source,snapshot,packet,record,capture,unchanged,write,preserved,retry};
}

const malformed=[
  ['late malformed annotation entry',p=>{p.annotations.inlineComments=[17];}],
  ['object-valued annotation',p=>{p.annotations.names=[['0x400060',{text:'Owned invalid value'}]];}],
  ['invalid annotation address',p=>{p.annotations.comments=[['owned-invalid-address','Owned text']];}],
  ['duplicate annotation key',p=>{p.annotations.names.push(['0x400060','Conflicting owned entry']);}],
  ['array-valued annotation container',p=>{p.annotations=[];}],
  ['non-array evidence container',p=>{p.evidence={owned:'invalid container'};}],
  ['late malformed evidence record',p=>{p.evidence.push(null);}],
  ['changed evidence content with retained identifier',p=>{p.evidence.find(e=>e.operation==='address_name').normalized_result='Owned tampered name';}],
];
for(const [name,mutate]of malformed)test('native snapshot rejects '+name+' without publishing state',async t=>{
  const f=await fixture(t);mutate(f.packet);const snapshotHash=await f.write(f.packet),before=f.capture();
  await assert.rejects(f.ctx.call('open_binary',{path:f.source,snapshot_path:f.snapshot}));
  f.unchanged(before);await f.preserved(snapshotHash);await f.retry();
});

test('native snapshot rejects a retained evidence collision before any record is committed',async t=>{
  const f=await fixture(t);
  // Deliberately conflicting owned context state is a negative control, not an
  // assertion that this altered record has a valid content-derived identifier.
  f.ctx.ledger.set(f.record.evidence_id,{...structuredClone(f.record),normalized_result:'Retained conflicting owned observation'});
  const before=f.capture(),snapshotHash=await f.write(f.packet);
  await assert.rejects(f.ctx.call('open_binary',{path:f.source,snapshot_path:f.snapshot}));
  f.unchanged(before);await f.preserved(snapshotHash);await f.retry();
});

test('native snapshot cancellation after read leaves no selected target or imported records',async t=>{
  const f=await fixture(t),controller=new AbortController();f.ctx.signal=controller.signal;
  const read=f.ctx.read.bind(f.ctx);f.ctx.read=async(file,options)=>{
    const bytes=await read(file,options);if(path.resolve(file)===path.resolve(f.snapshot))controller.abort();return bytes;
  };
  const before=f.capture(),snapshotHash=await f.write(f.packet);
  await assert.rejects(f.ctx.call('open_binary',{path:f.source,snapshot_path:f.snapshot}),e=>e.name==='AbortError'||e.code==='cancelled');
  f.unchanged(before);await f.preserved(snapshotHash);await f.retry();
});

test('owned writer snapshots restore all annotation maps and exact evidence while preserving unrelated state',async t=>{
  const f=await fixture(t),before=f.capture(),snapshotHash=await f.write(f.packet);
  const out=await f.ctx.call('open_binary',{path:f.source,snapshot_path:f.snapshot});
  assert.equal(out.result.sha256,f.packet.target.sha256);
  for(const [key,entries]of Object.entries(f.packet.annotations))assert.deepEqual([...f.ctx.nativeSession[key]],entries);
  assert.deepEqual(f.ctx.ledger.get(f.record.evidence_id),f.record);
  assert.equal(f.ctx.ledger,before.ledger);for(const [id,record]of before.records)assert.deepEqual(f.ctx.ledger.get(id),record);
  assert.deepEqual([...f.ctx.unknowns],before.unknownEntries);
  assert.equal((await f.ctx.call('address_name',{address:'0x400060'})).normalized_result,'OwnedEntry');
  assert.equal((await f.ctx.call('comment',{address:'0x400060'})).normalized_result,'Owned comment');
  assert.equal((await f.ctx.call('inline_comment',{address:'0x400060'})).normalized_result,'Owned inline');
  assert.deepEqual((await f.ctx.call('list_bookmarks',{})).normalized_result,[{address:'0x400060',name:null}]);
  await f.preserved(snapshotHash);await f.ctx.call('close_binary',{});
});

test('identical retained snapshot records restore idempotently without replacing the retained object',async t=>{
  const f=await fixture(t);for(const record of f.packet.evidence)f.ctx.ledger.set(record.evidence_id,structuredClone(record));
  const retained=f.ctx.ledger.get(f.record.evidence_id);
  const count=f.ctx.ledger.size,snapshotHash=await f.write(f.packet);
  await f.ctx.call('open_binary',{path:f.source,snapshot_path:f.snapshot});
  assert.equal(f.ctx.ledger.size,count);assert.equal(f.ctx.ledger.get(retained.evidence_id),retained);
  await f.preserved(snapshotHash);await f.ctx.call('close_binary',{});
});

test('minimal snapshots and ignored future annotation metadata retain compatibility',async t=>{
  const f=await fixture(t),packet={protocol:f.packet.protocol,target:f.packet.target,annotations:{ownedFutureMetadata:{version:2}}};
  const before=f.capture(),snapshotHash=await f.write(packet);
  await f.ctx.call('open_binary',{path:f.source,snapshot_path:f.snapshot});
  for(const key of ['names','comments','inlineComments','bookmarks'])assert.equal(f.ctx.nativeSession[key].size,0);
  assert.deepEqual([...f.ctx.ledger],before.records);assert.deepEqual([...f.ctx.unknowns],before.unknownEntries);
  await f.preserved(snapshotHash);await f.ctx.call('close_binary',{});
});
