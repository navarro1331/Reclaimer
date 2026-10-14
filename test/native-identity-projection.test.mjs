import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Context } from '../lib/core.mjs';
import { handlers } from '../lib/native.mjs';
import { digest, hex } from '../lib/artifact-binary.mjs';
import { recoverNativeAotDetailed } from '../lib/native-aot.mjs';
import { stageNativeRecovery, recoveredType, recoveredTypeEvidence } from '../lib/native-recovery.mjs';
import { aotRecoveryFixture, asAotElf } from './native-aot-recovery-fixtures.mjs';

// Projection-only specimens supply an internal association explicitly. Format
// readers and compiler association proofs are tested separately; this does not
// claim that arbitrary selected bytes establish a metadata name.
function associated() {
  const f=aotRecoveryFixture(),detail=recoverNativeAotDetailed(f.bytes,f.model,digest(f.bytes),f.architecture),record=detail.modules[0].types.find(t=>t.address===hex(f.mt.string));
  record.identity={qualified_name:'Owned.Projection.Text',assembly:{name:'OwnedProjection'},binding_status:'associated',method_table_address:record.address,source_bindings:[{address:hex(f.source),file_offset:1024,size_bytes:16,sha256:digest(f.bytes.subarray(1024,1040)),role:'projection-unit-proof'}]};
  return {f,detail,record};
}
test('NativeAOT semantic projection retains stable IDs, legacy aliases, null wire name and detached proof',()=>{
  const {f,detail,record}=associated(),before=structuredClone(record.metadata_recovery),staged=stageNativeRecovery(detail,f.bytes,f.model),session={nativeRecovery:staged},value=recoveredType(session,{type:'Owned.Projection.Text'});
  assert.equal(value.id,record.id);assert.equal(value.address,record.address);assert.equal(value.metadata_recovery.name_origin,'inferred');assert.equal(value.metadata_recovery.original_name,null);
  for(const type of [record.name,record.id,'OwnedProjection::Owned.Projection.Text'])assert.equal(recoveredType(session,{type}).id,value.id);
  assert.equal(staged.records[0].types.find(t=>t.address===record.address).type,value.name);assert.deepEqual(record.metadata_recovery,before);
  const raw=recoveredTypeEvidence(session,value);assert.equal(raw.source_sha256,digest(f.bytes));raw.nativeaot_identity.qualified_name='Mutated';assert.equal(staged.identities.get(value.id).qualified_name,value.name);
});
test('NativeAOT duplicate semantic names remain address-queryable and suppress ambiguous aliases',()=>{
  const {f,detail,record}=associated(),other=detail.modules[0].types.find(t=>t.address===hex(f.mt.object));other.identity={...structuredClone(record.identity),method_table_address:other.address};
  const staged=stageNativeRecovery(detail,f.bytes,f.model),session={nativeRecovery:staged};assert.equal(recoveredType(session,{type:record.identity.qualified_name}),null);assert.equal(recoveredType(session,{type:'OwnedProjection::'+record.identity.qualified_name}),null);
  assert.equal(recoveredType(session,{address:other.address}).id,other.id);assert.equal(recoveredType(session,{type:record.name}).id,record.id);
});
test('NativeAOT malformed, changed, missing and unbound identity proofs cannot fabricate annotations',()=>{
  for(const edit of [i=>i.source_bindings[0].sha256='0'.repeat(64),i=>i.source_bindings[0].file_offset++,i=>i.source_bindings=[],i=>i.source_bindings[0].size_bytes=0,i=>i.qualified_name='bad\0name']){
    const {f,detail,record}=associated();edit(record.identity);assert.throws(()=>stageNativeRecovery(detail,f.bytes,f.model),/identity/i);
  }
  for(const edit of [i=>i.binding_status='metadata-only',i=>i.method_table_address='0x123']){const {f,detail,record}=associated();edit(record.identity);const staged=stageNativeRecovery(detail,f.bytes,f.model);assert.equal(staged.types.get(record.id).name,record.name);assert.equal(staged.identities.size,0);}
});
async function opened(t,signal){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'reclaimer-projection-')),file=path.join(root,'owned.elf'),f=aotRecoveryFixture(),bytes=asAotElf(f),ctx=new Context({signal,config:{nativeProvider:'custom'}});ctx.handlers=handlers;await fs.writeFile(file,bytes);await ctx.call('open_binary',{path:file});
  t.after(async()=>{if(ctx.target)await handlers.close_binary({},ctx);assert.equal(path.dirname(await fs.realpath(root)),await fs.realpath(os.tmpdir()));assert.ok(path.basename(root).startsWith('reclaimer-projection-'));await fs.rm(root,{recursive:true,force:true});});return {ctx,file,bytes,f};
}
test('Fresh NativeAOT datatype inspection commits only its requested evidence without a provider load',async t=>{
  const {ctx,f}=await opened(t),value=await ctx.call('inspect_native_data_type',{address:hex(f.mt.string)});assert.equal(value.normalized_result.status,'available');assert.equal(value.normalized_result.metadata_recovery.original_name,null);assert.equal(ctx.ledger.size,1);assert.ok(ctx.nativeSession.nativeRecovery);assert.deepEqual([...ctx.ledger.values()].map(e=>e.operation),['inspect_native_data_type']);
});
test('Returned NativeAOT datatype records cannot mutate the committed definitions or retained evidence',async t=>{
  const {ctx,f}=await opened(t),first=await ctx.call('inspect_native_data_type',{address:hex(f.mt.string)}),name=first.normalized_result.name,id=first.normalized_result.id,evidenceId=first.evidence_id;first.normalized_result.name='Forged response mutation';first.normalized_result.fields[0].name='forged';
  const second=await ctx.call('inspect_native_data_type',{type:name});assert.equal(second.normalized_result.id,id);assert.equal(second.normalized_result.name,name);assert.equal(second.normalized_result.fields[0].name,'flags');assert.equal(ctx.ledger.get(evidenceId).normalized_result.name,name);assert.equal(ctx.nativeSession.nativeRecovery.types.get(id).name,name);
});
test('Fresh NativeAOT inspection cancellation at final source check preserves names and ledger',async t=>{
  const controller=new AbortController(),{ctx,f}=await opened(t,controller.signal),original=ctx.evidence.bind(ctx);ctx.evidence=async(...args)=>{const out=await original(...args);controller.abort();return out;};await assert.rejects(ctx.call('inspect_native_data_type',{address:hex(f.mt.string)}),e=>e.name==='AbortError'||e.code==='cancelled');assert.equal(ctx.nativeSession.nativeRecovery,undefined);assert.equal(ctx.nativeSession.names.size,0);assert.equal(ctx.ledger.size,0);
});
test('Fresh NativeAOT inspection source mutation or evidence failure does not commit provisional types',async t=>{
  for(const mutate of [false,true]){const {ctx,file,bytes,f}=await opened(t),original=ctx.evidence.bind(ctx);ctx.evidence=async(...args)=>{if(!mutate)throw new Error('Owned projection evidence rejection');const out=await original(...args),changed=Buffer.from(bytes);changed[0x1800]^=1;await fs.writeFile(file,changed);return out;};await assert.rejects(ctx.call('inspect_native_data_type',{address:hex(f.mt.string)}),mutate?/changed since open_binary/:/evidence rejection/);assert.equal(ctx.nativeSession.nativeRecovery,undefined);assert.equal(ctx.nativeSession.names.size,0);assert.equal(ctx.ledger.size,0);}
});
