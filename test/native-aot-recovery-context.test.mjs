import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Context } from '../lib/core.mjs';
import { handlers } from '../lib/native.mjs';
import { digest, hex } from '../lib/artifact-binary.mjs';
import { aotRecoveryFixture, asAotElf } from './native-aot-recovery-fixtures.mjs';

async function opened(t,fixture,{signal}={}) {
  const root=await fs.mkdtemp(path.resolve('.aot-recovery-context-')),file=path.join(root,'owned.elf'),bytes=asAotElf(fixture),ctx=new Context({signal,config:{nativeProvider:'custom'}});ctx.handlers=handlers;
  await fs.writeFile(file,bytes);await ctx.call('open_binary',{path:file});
  t.after(async()=>{if(ctx.target)await handlers.close_binary({},ctx);const resolved=await fs.realpath(root);assert.equal(path.dirname(resolved),await fs.realpath(path.resolve('.')));assert.ok(path.basename(resolved).startsWith('.aot-recovery-context-'));await fs.rm(resolved,{recursive:true,force:true});});
  return {ctx,file,bytes};
}

for(const pointerSize of [4,8])for(const legacy of [false,true])test(`Context NativeAOT ${pointerSize*8}-bit ${legacy?'legacy':'current'} commits genuine datatype/instance/byte observations`,async t=>{
  const f=aotRecoveryFixture({pointerSize,legacy}),{ctx,file,bytes}=await opened(t,f),before=digest(bytes),load=await ctx.call('inspect_native_load_image',{}),record=load.normalized_result.observations.metadata_recovery[0];
  assert.equal(load.confidence,'derived');assert.equal(load.subject.digest.sha256,before);assert.equal(record.method_tables,6);assert.equal(record.coverage.frozen_objects_annotated,3);assert.equal(record.types.length,6);assert.ok(!record.types.some(type=>type.address===hex(f.mt.unanchored)));assert.equal(ctx.nativeSession.nativeRecovery.types.size,9);assert.equal(ctx.nativeSession.nativeRecovery.ranges.length,1);assert.equal(ctx.ledger.size,1);
  const mt=(await ctx.call('inspect_native_data_type',{address:hex(f.mt.string)}));assert.equal(mt.confidence,'derived');assert.equal(mt.normalized_result.source,'analysis-database');assert.equal(mt.normalized_result.metadata_recovery.original_name,null);assert.equal(mt.normalized_result.metadata_recovery.name_origin,'generated');assert.equal(mt.normalized_result.metadata_recovery.base_size_bytes,pointerSize*2+6);assert.equal(mt.normalized_result.metadata_recovery.derived_memory.sha256,digest(f.rebuilt));assert.equal(mt.normalized_result.fields.find(field=>field.name==='related_type').offset_bytes,8);
  for(const type of [mt.normalized_result.id,mt.normalized_result.name])assert.equal((await ctx.call('inspect_native_data_type',{type})).normalized_result.id,mt.normalized_result.id);
  for(const address of ['ram:403100','ram:0x403100'])assert.equal((await ctx.call('inspect_native_data_type',{address})).normalized_result.id,mt.normalized_result.id);
  const instance=(await ctx.call('inspect_native_data_type',{address:f.instances[0]})).normalized_result;assert.notEqual(instance.id,mt.normalized_result.id);assert.ok(instance.fields.some(field=>field.name==='utf16_data'));assert.equal(instance.fields[0].name,'method_table');assert.equal(instance.fields[0].offset_bytes,0);assert.ok(instance.limitations.some(limit=>limit.includes('Instance method-table pointer')));
  const byteEvidence=await ctx.call('read_bytes',{address:hex(f.destination),length:1024}),read=byteEvidence.normalized_result;assert.equal(read.bytes_hex,f.rebuilt.toString('hex'));assert.equal(read.complete,true);assert.equal(byteEvidence.confidence,'derived');assert.equal(byteEvidence.provider.id,'reclaimer-nativeaot-session');assert.equal(byteEvidence.raw_result.derived_memory.sha256,digest(f.rebuilt));assert.equal(byteEvidence.raw_result.derived_memory.file_offset,null);assert.equal(byteEvidence.raw_result.returned_bytes_sha256,digest(f.rebuilt));assert.ok(byteEvidence.limitations.some(limit=>/derived bytes.*not.*live/i.test(limit)));const short=(await ctx.call('read_bytes',{address:hex(f.destination+1016n),length:16})).normalized_result;assert.equal(short.returned_bytes,8);assert.equal(short.complete,false);
  const qualified=(await ctx.call('read_bytes',{address:'ram:403000',length:16})).normalized_result;assert.equal(qualified.address,'0x403000');assert.equal(qualified.bytes_hex,f.rebuilt.subarray(0,16).toString('hex'));
  await assert.rejects(ctx.call('address_to_file_offset',{address:hex(f.destination)}),/no file-backed/);const entries=ctx.ledger.size;await assert.rejects(ctx.call('inspect_native_data_type',{address:hex(f.mt.unanchored)}));assert.equal(ctx.ledger.size,entries);
  assert.equal(digest(await fs.readFile(file)),before);assert.ok(ctx.nativeSession.names.has(f.instances[0]));await ctx.call('close_binary',{});assert.equal(ctx.nativeSession,null);assert.equal(ctx.target,null);
});

test('Context NativeAOT evidence rejection preserves prior committed types, names and ledger atomically',async t=>{
  const {ctx}=await opened(t,aotRecoveryFixture());await ctx.call('inspect_native_load_image',{});const prior=ctx.nativeSession.nativeRecovery,names=[...ctx.nativeSession.names],ledger=[...ctx.ledger];ctx.evidence=async()=>{throw new Error('Owned evidence publication failure');};await assert.rejects(ctx.call('inspect_native_load_image',{}),/Owned evidence publication/);assert.equal(ctx.nativeSession.nativeRecovery,prior);assert.deepEqual([...ctx.nativeSession.names],names);assert.deepEqual([...ctx.ledger],ledger);
});

test('Context NativeAOT cancellation after staging publishes no annotations or evidence',async t=>{
  const controller=new AbortController(),{ctx}=await opened(t,aotRecoveryFixture(),{signal:controller.signal}),original=ctx.evidence.bind(ctx);ctx.evidence=async(...args)=>{const value=await original(...args);controller.abort();return value;};await assert.rejects(ctx.call('inspect_native_load_image',{}),e=>e.name==='AbortError'||e.code==='cancelled');assert.equal(ctx.nativeSession.nativeRecovery,undefined);assert.equal(ctx.nativeSession.names.size,0);assert.equal(ctx.ledger.size,0);
});

test('Context NativeAOT physical-source contradiction after staging leaves prior commitment intact',async t=>{
  const {ctx,file,bytes}=await opened(t,aotRecoveryFixture());await ctx.call('inspect_native_load_image',{});const prior=ctx.nativeSession.nativeRecovery,names=[...ctx.nativeSession.names],ledger=[...ctx.ledger],original=ctx.evidence.bind(ctx);ctx.evidence=async(...args)=>{const value=await original(...args),changed=Buffer.from(bytes);changed[0x1800]^=0x11;await fs.writeFile(file,changed);return value;};await assert.rejects(ctx.call('inspect_native_load_image',{}),/changed since open_binary/);assert.equal(ctx.nativeSession.nativeRecovery,prior);assert.deepEqual([...ctx.nativeSession.names],names);assert.deepEqual([...ctx.ledger],ledger);await assert.rejects(ctx.call('read_bytes',{address:'0x403000',length:16}),/changed since open_binary/);await assert.rejects(ctx.call('inspect_native_data_type',{address:'0x403100'}),/changed since open_binary/);
});

test('Context NativeAOT malformed staged datatype and overlapping modules publish nothing',async t=>{
  const f=aotRecoveryFixture(),first=await opened(t,f);first.ctx.nativeSession.localModel={...f.model,functions:[{address:'0x402010',name:{invalid:'owned-negative'}}]};await assert.rejects(first.ctx.call('inspect_native_load_image',{}),/does not satisfy the public contract/);assert.equal(first.ctx.nativeSession.nativeRecovery,undefined);assert.equal(first.ctx.nativeSession.names.size,0);assert.equal(first.ctx.ledger.size,0);
  const repeated=aotRecoveryFixture();repeated.bytes.copy(repeated.bytes,0xe00,0x400,0x440);const second=await opened(t,repeated);await assert.rejects(second.ctx.call('inspect_native_load_image',{}),/Overlapping NativeAOT/);assert.equal(second.ctx.nativeSession.nativeRecovery,undefined);assert.equal(second.ctx.nativeSession.names.size,0);assert.equal(second.ctx.ledger.size,0);
});
