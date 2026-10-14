import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Context} from '../lib/core.mjs';
import {handlers} from '../lib/native.mjs';
import {digest} from '../lib/artifact-binary.mjs';
import {elfFixture} from './artifact-fixtures.mjs';

// These packets are independently authored cached provider observations. They
// test response ownership, not live vendor analysis or NativeAOT name recovery.
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'reclaimer-provider-isolation-'));
  const file=path.join(root,'owned.elf'),bytes=elfFixture();
  await fs.writeFile(file,bytes,{flag:'wx'});
  const ctx=new Context({signal:t.signal,config:{nativeProvider:'custom'}});ctx.handlers=handlers;
  await ctx.call('open_binary',{path:file});
  const datatype={status:'available',reason:null,id:'owned:word-cell',name:'OwnedWordCell',
    kind:'struct',source:'analysis-database',source_archive:'Owned cached provider fixture',
    address:null,size_bytes:4,alignment_bytes:4,packing_enabled:null,referenced_type:null,
    array_count:null,array_stride_bytes:null,
    fields:[{ordinal:0,name:'word',offset_bytes:0,size_bytes:4,type_id:'uint32',
      bit_size:null,bit_offset:null,status:'observed',flexible_tail:'unknown'}],
    members:[],total_fields:1,truncated:false,limitations:['Owned packet; no live vendor proof.']};
  const definedAddress='0x400060';
  const model={protocol:'real-native-model-v1',provider:'owned-provider-fixture',
    source_sha256:digest(bytes),types:[datatype],defined_types:[{address:definedAddress,type_id:datatype.id}],
    segments:[],symbols:[],functions:[],instructions:[],references:[],strings:[],limitations:[]};
  ctx.nativeSession.model=model;
  ctx.run=async()=>assert.fail('Cached datatype projection must not launch a provider or target');
  t.after(async()=>{
    if(ctx.target)await ctx.call('close_binary',{});
    assert.equal(await fs.realpath(path.dirname(root)),await fs.realpath(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('reclaimer-provider-isolation-'));
    await fs.rm(root,{recursive:true,force:true});
  });
  return {ctx,datatype,definedAddress,file,bytes};
}

for(const selector of ['name','id','address'])test('cached provider datatype '+selector+' replies cannot mutate the cache or later evidence',async t=>{
  const {ctx,datatype,definedAddress,file,bytes}=await fixture(t),original=structuredClone(datatype);
  const args=selector==='address'?{address:definedAddress}:{type:selector==='name'?datatype.name:datatype.id};
  const reply=await ctx.call('inspect_native_data_type',args),saved=structuredClone(ctx.ledger.get(reply.evidence_id));
  assert.deepEqual(reply.normalized_result,{...original,address:selector==='address'?definedAddress:null});
  reply.normalized_result.name='CallerChangedName';
  reply.normalized_result.fields[0].name='caller_changed_field';
  reply.normalized_result.fields[0].offset_bytes=3;
  reply.normalized_result.fields.push({...original.fields[0],ordinal:1,name:'caller_added_field'});
  reply.normalized_result.members.push({caller:'unvalidated local mutation'});
  reply.normalized_result.limitations.push('caller-added limitation');
  assert.deepEqual(datatype,original);
  assert.deepEqual(ctx.ledger.get(reply.evidence_id),saved);
  for(const lookup of [{type:original.name},{type:original.id},{address:definedAddress}]){
    const later=await ctx.call('inspect_native_data_type',lookup);
    assert.deepEqual(later.normalized_result,{...original,address:lookup.address??null});
    assert.deepEqual(ctx.ledger.get(later.evidence_id).normalized_result,later.normalized_result);
  }
  assert.equal(digest(await fs.readFile(file)),digest(bytes));
});

test('subsequent provider cache updates cannot rewrite an earlier datatype reply',async t=>{
  const {ctx,datatype,definedAddress,file,bytes}=await fixture(t),original=structuredClone(datatype);
  const first=await ctx.call('inspect_native_data_type',{address:definedAddress}),saved=structuredClone(ctx.ledger.get(first.evidence_id));
  datatype.name='ProviderUpdatedName';datatype.fields[0].name='provider_updated_field';
  datatype.limitations.push('provider-updated observation');
  assert.deepEqual(first.normalized_result,{...original,address:definedAddress});
  assert.deepEqual(ctx.ledger.get(first.evidence_id),saved);
  const next=await ctx.call('inspect_native_data_type',{type:datatype.id});
  assert.equal(next.normalized_result.name,datatype.name);
  assert.equal(next.normalized_result.fields[0].name,datatype.fields[0].name);
  assert.notEqual(next.evidence_id,first.evidence_id);
  assert.equal(digest(await fs.readFile(file)),digest(bytes));
});
