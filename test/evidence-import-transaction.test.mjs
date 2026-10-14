import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Context,digest,InvestigationError} from '../lib/core.mjs';
import {handlers,bundle,checkBundle} from '../lib/evidence.mjs';

const bindingOperation='external_evidence_integrity';
const question=label=>({question:'Owned import transaction '+label,severity:'high',domain:'behavior',
  required_authority:'controlled-replay',required_confidence:'observed',required_environment:null,
  recommended_probes:[],relationships:[]});
const update=(u,status='investigating')=>({unknown_id:u.unknown_id,expected_revision:u.revision,status,
  severity:'high',supporting_evidence_ids:[],contradicting_evidence_ids:[],required_authority:'controlled-replay',
  required_confidence:'observed',required_environment:null,recommended_probes:[],relationships:[],resolution:null});
const context=signal=>{const ctx=new Context({signal});ctx.handlers=handlers;
  ctx.run=async()=>assert.fail('Owned bundle fixtures must not launch a provider or target');return ctx;};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

async function fixture(t,mode='native'){
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'reclaimer-bundle-transaction-'));
  const file=path.join(folder,'owned-bundle.json'),source=context(t.signal),ctx=context(t.signal);
  t.after(async()=>{assert.equal(await fs.realpath(path.dirname(folder)),await fs.realpath(os.tmpdir()));
    assert.ok(path.basename(folder).startsWith('reclaimer-bundle-transaction-'));await fs.rm(folder,{recursive:true,force:true});});
  await source.evidence('owned_bundle_observation',{}, {value:31},{subject:null,authority:'analyst-inference'});
  const unknown=(await source.call('record_unknown',question('incoming'))).result;
  const packet=bundle(source);
  if(mode==='historical'){
    // Independently authored compatibility packets, not original-source data.
    const ids=new Map();for(const [index,record]of packet.records.entries()){
      const opaque='ev_'+digest('Owned historical import record '+index);ids.set(record.evidence_id,opaque);
      record.evidence_id=opaque;record.predicate_type='rea.owned-import-transaction';
    }
    packet.unknowns[0].mutation_evidence_ids=packet.unknowns[0].mutation_evidence_ids.map(id=>ids.get(id));
    packet.unknowns[0].revision_digest=digest('Owned opaque historical revision');
  }
  await ctx.evidence('owned_retained_marker',{}, {value:47},{subject:null,authority:'analyst-inference'});
  await ctx.call('record_unknown',question('unrelated'));
  function capture(){return {ledger:ctx.ledger,records:structuredClone([...ctx.ledger]),unknowns:ctx.unknowns,
    unknownEntries:structuredClone([...ctx.unknowns]),history:structuredClone(ctx.history),target:ctx.target};}
  function unchanged(before){assert.equal(ctx.ledger,before.ledger);assert.deepEqual([...ctx.ledger],before.records);
    assert.equal(ctx.unknowns,before.unknowns);assert.deepEqual([...ctx.unknowns],before.unknownEntries);
    assert.deepEqual(ctx.history,before.history);assert.equal(ctx.target,before.target);}
  async function write(value=packet){checkBundle(value);await fs.writeFile(file,JSON.stringify(value));return digest(await fs.readFile(file));}
  async function preserved(hash){assert.equal(digest(await fs.readFile(file)),hash);}
  async function retry(){ctx.signal=t.signal;await ctx.call('import_evidence_bundle',{path:file});}
  return {ctx,source,unknown,packet,file,capture,unchanged,write,preserved,retry};
}

for(const mode of ['native','historical'])test(mode+' bundle cancellation after read does not commit records or revisions',async t=>{
  const f=await fixture(t,mode),controller=new AbortController();f.ctx.signal=controller.signal;
  const read=f.ctx.read.bind(f.ctx);f.ctx.read=async(...args)=>{const bytes=await read(...args);controller.abort();return bytes;};
  const before=f.capture(),hash=await f.write();
  await assert.rejects(f.ctx.call('import_evidence_bundle',{path:f.file}),e=>e.name==='AbortError'||e.code==='cancelled');
  f.unchanged(before);await f.preserved(hash);f.ctx.read=read;await f.retry();
});

for(const variant of ['capacity failure','cancel before binding','cancel after binding'])test('historical bundle '+variant+' preserves the complete prior context',async t=>{
  const f=await fixture(t,'historical'),controller=new AbortController();f.ctx.signal=controller.signal;
  const evidence=f.ctx.evidence.bind(f.ctx);f.ctx.evidence=async(op,args,value,options)=>{
    if(op!==bindingOperation)return evidence(op,args,value,options);
    if(variant==='capacity failure')throw new InvestigationError('capacity',op,'Owned late binding failure');
    if(variant==='cancel before binding')controller.abort();
    const record=await evidence(op,args,value,options);if(variant==='cancel after binding')controller.abort();return record;
  };
  const before=f.capture(),hash=await f.write();
  await assert.rejects(f.ctx.call('import_evidence_bundle',{path:f.file}),e=>variant==='capacity failure'?e.code==='capacity':e.name==='AbortError'||e.code==='cancelled');
  f.unchanged(before);await f.preserved(hash);f.ctx.evidence=evidence;await f.retry();
});

test('pending historical binding preparation exposes no partially imported state',async t=>{
  const f=await fixture(t,'historical'),entered=deferred(),release=deferred(),evidence=f.ctx.evidence.bind(f.ctx);
  f.ctx.evidence=async(op,...args)=>{if(op===bindingOperation){entered.resolve();await release.promise;}return evidence(op,...args);};
  const before=f.capture(),hash=await f.write(),pending=f.ctx.call('import_evidence_bundle',{path:f.file});
  const outcome=pending.then(value=>({value}),error=>({error}));
  try{await Promise.race([entered.promise,outcome.then(r=>assert.fail('Import ended before the owned binding pause: '+r.error?.message))]);f.unchanged(before);}
  finally{release.resolve();await outcome;}
  assert.ok((await outcome).value);await f.preserved(hash);
});

test('a concurrent unknown revision during binding preparation is rechecked before import commit',async t=>{
  const f=await fixture(t),initialHash=await f.write();await f.ctx.call('import_evidence_bundle',{path:f.file});await f.preserved(initialHash);
  await f.source.call('update_unknown',update(f.unknown));
  const incoming=bundle(f.source),historical=await f.source.evidence('owned_standalone_history',{}, {value:53},{subject:null,predicateType:'rea.owned-import-transaction'});
  historical.evidence_id='ev_'+digest('Owned standalone historical race record');incoming.records.push(historical);
  const hash=await f.write(incoming),before=f.capture(),entered=deferred(),release=deferred(),evidence=f.ctx.evidence.bind(f.ctx);
  f.ctx.evidence=async(op,...args)=>{if(op===bindingOperation){entered.resolve();await release.promise;}return evidence(op,...args);};
  const pending=f.ctx.call('import_evidence_bundle',{path:f.file}),outcome=pending.then(value=>({value}),error=>({error}));
  let after;
  try{
    await Promise.race([entered.promise,outcome.then(r=>assert.fail('Import ended before the owned race pause: '+r.error?.message))]);f.unchanged(before);
    await f.ctx.call('update_unknown',update(f.unknown,'open'));after=f.capture();
  }finally{release.resolve();await outcome;}
  assert.match((await outcome).error?.message??'',/history conflicts|revision/i);f.unchanged(after);await f.preserved(hash);
});

test('native bundle import retains exact records, revisions, unrelated state and repeat counts',async t=>{
  const f=await fixture(t),before=f.capture(),hash=await f.write();
  const first=(await f.ctx.call('import_evidence_bundle',{path:f.file})).result;
  assert.deepEqual(first,{imported:f.packet.records.length,unknowns_added:1,total:before.records.length+f.packet.records.length});
  for(const r of f.packet.records)assert.deepEqual(f.ctx.ledger.get(r.evidence_id),r);
  assert.deepEqual(f.ctx.unknowns.get(f.unknown.unknown_id),f.packet.unknowns[0]);
  for(const [id,r]of before.records)assert.deepEqual(f.ctx.ledger.get(id),r);
  for(const [id,u]of before.unknownEntries)assert.deepEqual(f.ctx.unknowns.get(id),u);
  const again=(await f.ctx.call('import_evidence_bundle',{path:f.file})).result;
  assert.deepEqual(again,{imported:0,unknowns_added:0,total:first.total});checkBundle(bundle(f.ctx));await f.preserved(hash);
});

test('historical import retains opaque identifiers and creates a valid binding before export round trip',async t=>{
  const f=await fixture(t,'historical'),before=f.capture(),hash=await f.write(),result=(await f.ctx.call('import_evidence_bundle',{path:f.file})).result;
  assert.deepEqual(result,{imported:f.packet.records.length,unknowns_added:1,total:before.records.length+f.packet.records.length+1});
  const exported=checkBundle(bundle(f.ctx)),binding=exported.records.find(r=>r.operation===bindingOperation);
  assert.ok(binding);assert.equal(binding.normalized_result.records.length,f.packet.records.length);
  assert.equal(binding.normalized_result.unknowns.length,1);
  for(const r of f.packet.records)assert.deepEqual(f.ctx.ledger.get(r.evidence_id),r);
  assert.deepEqual(f.ctx.unknowns.get(f.unknown.unknown_id),f.packet.unknowns[0]);
  const again=(await f.ctx.call('import_evidence_bundle',{path:f.file})).result;assert.deepEqual(again,{imported:0,unknowns_added:0,total:result.total});
  await f.preserved(hash);await f.write(exported);const fresh=context(t.signal);
  await fresh.call('import_evidence_bundle',{path:f.file});checkBundle(bundle(fresh));
  for(const r of exported.records)assert.deepEqual(fresh.ledger.get(r.evidence_id),r);
  for(const u of exported.unknowns)assert.deepEqual(fresh.unknowns.get(u.unknown_id),u);
});

test('mixed native and historical records import with exact counts and a single retained binding',async t=>{
  const f=await fixture(t),historical=await f.source.evidence('owned_mixed_history',{}, {value:59},{subject:null,predicateType:'rea.owned-import-transaction'});
  historical.evidence_id='ev_'+digest('Owned mixed historical record');f.packet.records.push(historical);
  const before=f.capture(),hash=await f.write(),out=(await f.ctx.call('import_evidence_bundle',{path:f.file})).result;
  assert.equal(out.imported,f.packet.records.length);assert.equal(out.unknowns_added,1);assert.equal(out.total,before.records.length+f.packet.records.length+1);
  assert.equal([...f.ctx.ledger.values()].filter(r=>r.operation===bindingOperation).length,1);checkBundle(bundle(f.ctx));await f.preserved(hash);
});

test('a valid next native unknown revision advances its retained history without changing imported counts',async t=>{
  const f=await fixture(t);await f.write();await f.ctx.call('import_evidence_bundle',{path:f.file});
  const next=(await f.source.call('update_unknown',update(f.unknown))).result,packet=bundle(f.source),hash=await f.write(packet),before=f.capture();
  const out=(await f.ctx.call('import_evidence_bundle',{path:f.file})).result;
  assert.deepEqual(out,{imported:1,unknowns_added:0,total:before.records.length+1});assert.deepEqual(f.ctx.unknowns.get(next.unknown_id),next);
  checkBundle(bundle(f.ctx));await f.preserved(hash);
});

test('changed content is rejected before any records or revisions are committed',async t=>{
  const f=await fixture(t),hash=await f.write();f.packet.records[0].normalized_result.value=67;
  await fs.writeFile(f.file,JSON.stringify(f.packet));const malformedHash=digest(await fs.readFile(f.file)),before=f.capture();
  await assert.rejects(f.ctx.call('import_evidence_bundle',{path:f.file}),/digest mismatch/);f.unchanged(before);await f.preserved(malformedHash);
  assert.notEqual(hash,malformedHash);
});

test('pre-cancelled import leaves unrelated records and unknowns unchanged',async t=>{
  const f=await fixture(t),controller=new AbortController(),hash=await f.write();controller.abort();f.ctx.signal=controller.signal;const before=f.capture();
  await assert.rejects(f.ctx.call('import_evidence_bundle',{path:f.file}),e=>e.code==='cancelled');f.unchanged(before);await f.preserved(hash);
});
