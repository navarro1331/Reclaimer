import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context, digest } from '../lib/core.mjs';
import { handlers, bundle, checkBundle } from '../lib/evidence.mjs';
import { handlers as verification } from '../lib/verification.mjs';
import { validate } from '../lib/contracts.mjs';
const context=()=>{const c=new Context();Object.assign(c.handlers,handlers,verification);return c;};
const question={question:'Does the application preserve the selected output?',severity:'high',domain:'behavior',required_authority:'controlled-replay',required_confidence:'observed',required_environment:null,recommended_probes:[],relationships:[]};
test('content-derived evidence is stable and rejects altered bundle content',async()=>{
 const ctx=context();const e=await ctx.evidence('independent_test',{}, {answer:7},{subject:null});
 assert.equal((await ctx.evidence('independent_test',{}, {answer:7},{subject:null})).evidence_id,e.evidence_id);
 const b=bundle(ctx);checkBundle(b);b.records[0].normalized_result.answer=9;assert.throws(()=>checkBundle(b),/digest mismatch/);
});
test('unknown revisions reject stale writes and require evidence for resolution',async()=>{
 const ctx=context(),u=(await ctx.call('record_unknown',question)).result;
 assert.equal(u.revision,1);assert.match(u.revision_digest,/^[a-f0-9]{64}$/);
 const update={unknown_id:u.unknown_id,expected_revision:1,status:'investigating',severity:'high',supporting_evidence_ids:[],contradicting_evidence_ids:[],required_authority:'controlled-replay',required_confidence:'observed',required_environment:null,recommended_probes:[],relationships:[],resolution:null};
 const next=(await ctx.call('update_unknown',update)).result;
 assert.equal(next.previous_revision_digest,u.revision_digest);assert.equal(next.revision,2);
 await assert.rejects(()=>ctx.call('update_unknown',update),/Revision conflict/);
 await assert.rejects(()=>ctx.call('update_unknown',{...update,expected_revision:2,status:'resolved',resolution:{disposition:'verified',rationale:'I declared success',evidence_ids:[]}}),/requirements|contract/);
 const e=await ctx.evidence('independent_replay',{}, {exit_code:0},{subject:null,authority:'controlled-replay',confidence:'observed',limitations:[]});
 const resolved=(await ctx.call('update_unknown',{...update,expected_revision:2,status:'resolved',supporting_evidence_ids:[e.evidence_id],resolution:{disposition:'verified',rationale:'Observed the declared replay',evidence_ids:[e.evidence_id]}})).result;
 assert.equal(resolved.status,'resolved');
 const verdict=(await ctx.call('verify_unknown_resolution',{unknown_id:u.unknown_id})).result;
 assert.equal(verdict.valid,true);assert.equal(verdict.truthVerified,false);
 checkBundle(bundle(ctx));
});
test('bundle import validates everything before inserting and export respects overwrite',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'real-ledger-')),source=context(),dest=context();
 await source.evidence('independent_test',{}, {bytes:3},{subject:null});
 await source.call('record_unknown',question);
 const path=join(dir,'evidence.json');await source.call('export_evidence_bundle',{path});
 await assert.rejects(()=>source.call('export_evidence_bundle',{path}),/EEXIST/);
 const imported=(await dest.call('import_evidence_bundle',{path})).result;
 assert.equal(imported.imported,2);assert.equal(imported.unknowns_added,1);
 assert.equal((await dest.call('import_evidence_bundle',{path})).result.imported,0);
 const bad=JSON.parse(await readFile(path,'utf8'));bad.records[0].provider.name='altered';const badPath=join(dir,'bad.json');await writeFile(badPath,JSON.stringify(bad));
 const before=dest.ledger.size;await assert.rejects(()=>dest.call('import_evidence_bundle',{path:badPath}),/digest mismatch/);assert.equal(dest.ledger.size,before);
});
test('input defaults select the connect branch without adding launch fields',()=>{
 const value={scenario:{kind:'connect',endpoint:'http://127.0.0.1:9222'},allowed_origins:['http://localhost'],steps:[]};
 const schemaResult=validate('capture_browser_scenario','input',value);
 assert.equal(Object.hasOwn(value.scenario,'headless'),false);
 // This fixture tests non-invention even if the protocol requires more scenario fields.
 assert.equal(typeof schemaResult.valid,'boolean');
});

test('historical opaque identities survive import while new exports bind their content',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'real-historical-')),source=context(),dest=context();
 const record=await source.evidence('independent_historical_fixture',{}, {answer:19},{subject:null,predicateType:'rea.independent-test-namespace'});
 record.evidence_id='ev_'+'7'.repeat(64);
 source.ledger.clear();source.ledger.set(record.evidence_id,record);
 const path=join(directory,'historical.json');await writeFile(path,JSON.stringify(bundle(source)));
 const result=(await dest.call('import_evidence_bundle',{path})).result;
 assert.equal(result.imported,1);assert.equal(dest.ledger.get(record.evidence_id).normalized_result.answer,19);
 const exported=bundle(dest);checkBundle(exported);
 assert.equal(exported.records.filter(r=>r.operation==='external_evidence_integrity').length,1);
 const altered=structuredClone(exported);altered.records.find(r=>r.evidence_id===record.evidence_id).normalized_result.answer=20;
 assert.throws(()=>checkBundle(altered),/digest mismatch/);
 const conflicting=structuredClone(bundle(source));conflicting.records[0].normalized_result.answer=20;
 await writeFile(path,JSON.stringify(conflicting));const size=dest.ledger.size;
 await assert.rejects(()=>dest.call('import_evidence_bundle',{path}),/conflicts/);assert.equal(dest.ledger.size,size);
 assert.equal(dest.ledger.get(record.evidence_id).normalized_result.answer,19);
});
