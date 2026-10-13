import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { engine } from '../lib/engine.mjs';
import { Context, digest, VERSION } from '../lib/core.mjs';
import { api } from '../lib/contracts.mjs';
import { handlers as evidence, bundle, checkBundle } from '../lib/evidence.mjs';
import { handlers as comparisons } from '../lib/comparisons.mjs';
import { inspectServerAlignment } from '../lib/session.mjs';

const ledger=()=>{const ctx=new Context();ctx.handlers={...evidence,...comparisons};return ctx;};
const question={question:'Does the owned fixture retain its selected output?',severity:'high',domain:'owned-fixture',required_authority:'controlled-replay',required_confidence:'observed',required_environment:null,recommended_probes:[],relationships:[]};
const update=(unknown,changes={})=>({unknown_id:unknown.unknown_id,expected_revision:unknown.revision,status:'investigating',severity:'high',supporting_evidence_ids:[],contradicting_evidence_ids:[],required_authority:'controlled-replay',required_confidence:'observed',required_environment:null,recommended_probes:[],relationships:[],resolution:null,...changes});
async function temporary(t){const root=await mkdtemp(join(tmpdir(),'real-owned-ledger-'));t.after(async()=>{assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep+'real-owned-ledger-'));await rm(root,{recursive:true,force:true});});return root;}
async function save(root,name,value){const file=join(root,name);await writeFile(file,JSON.stringify(value));return file;}

test('session compares supplied version, catalog and command-path expectations against its own runtime',async()=>{
 const ctx=await engine({config:{}}),identity=(await ctx.call('binary_session',{})).result.server_identity;
 const expected={expected_package_version:VERSION,expected_catalog_digest:digest(api),expected_server_path:identity.server.command_path};
 assert.equal((await ctx.call('binary_session',expected)).result.server_identity.alignment.state,'aligned');
 for(const mismatch of [{expected_package_version:'0.0.0-owned-stale'},{expected_catalog_digest:'0'.repeat(64)},{expected_server_path:join(tmpdir(),'different-owned-server.mjs')}]){
  const out=(await ctx.call('binary_session',{...expected,...mismatch})).result;
  assert.equal(out.server_identity.alignment.state,'mcp_server_restart_required');
  assert.ok(out.server_identity.alignment.reasons.length>0);
  assert.equal(out.open,false); // Identity diagnostics do not introduce execution gates.
 }
});

test('session alignment detects on-disk drift and reports unreadable metadata without changing execution authority',async t=>{
 const root=await temporary(t),catalog={tools:[{name:'owned-fixture'}]},packagePath=await save(root,'package.json',{version:'7.3.0'}),catalogPath=await save(root,'catalog.json',catalog),serverPath=await save(root,'server.mjs',{}),options={version:'7.3.0',catalog,packagePath,catalogPath,serverPath};
 assert.equal((await inspectServerAlignment({},options)).state,'aligned');
 await writeFile(packagePath,JSON.stringify({version:'7.4.0'}));assert.equal((await inspectServerAlignment({},options)).state,'mcp_server_restart_required');
 await writeFile(packagePath,JSON.stringify({version:'7.3.0'}));await writeFile(catalogPath,JSON.stringify({tools:[{name:'owned-added-fixture'}]}));assert.match((await inspectServerAlignment({},options)).reasons.join(' '),/Catalog on disk differs/);
 await writeFile(catalogPath,'owned malformed JSON');const unknown=await inspectServerAlignment({},options);assert.equal(unknown.state,'unknown');assert.match(unknown.reasons.join(' '),/could not be inspected/);
});

test('navigation and address context unwrap native evidence and retain actual owned annotations',async t=>{
 const root=await temporary(t),file=join(root,'owned-navigation.com');await writeFile(file,Buffer.from([0xb8,0x2a,0x00,0xc3]));
 const ctx=await engine({config:{}});await ctx.call('open_binary',{path:file});
 ctx.nativeSession.model={protocol:'real-native-model-v1',provider:'owned-fixture-model',segments:[{name:'owned-code',start:'0x100',end:'0x104',file_offset:0,file_size:4}],functions:[{address:'0x100',name:'OwnedEntry',ranges:[{start:'0x100',end:'0x103'}],total_bytes:3}],symbols:[{address:'0x100',name:'OwnedEntry'}],references:[],strings:[],instructions:[],limitations:['Synthetic navigation model; no vendor analysis or execution was performed']};
 await ctx.call('goto_address',{address:'0x100'});await ctx.call('set_comment',{address:'0x100',comment:'Owned entry comment'});await ctx.call('set_inline_comment',{address:'0x100',comment:'Owned inline comment'});await ctx.call('set_bookmark',{address:'0x100',name:'Owned bookmark'});
 assert.deepEqual((await ctx.call('get_navigation_context',{})).result,{document:ctx.target.path,address:'0x100',procedure:'0x100'});
 const out=(await ctx.call('inspect_address_context',{address:'0x100'})).result;
 assert.equal(out.name.value,'OwnedEntry');assert.equal(out.comment.value,'Owned entry comment');assert.equal(out.inline_comment.value,'Owned inline comment');assert.equal(out.procedure.value.found,true);assert.deepEqual(out.bookmarks.value,[{address:'0x100',name:'Owned bookmark'}]);
 await ctx.call('goto_address',{address:'0x103'});assert.equal((await ctx.call('get_navigation_context',{})).result.procedure,null);
 await ctx.call('close_binary',{});assert.equal(digest(await readFile(file)),digest(Buffer.from([0xb8,0x2a,0x00,0xc3])));
 const missing=(await ctx.call('inspect_address_context',{address:'0x100'})).result;
 assert.equal(missing.name.state,'unavailable');assert.match(missing.name.reason,/No binary/);
});

test('address-context collection propagates cancellation instead of publishing unavailable facets',async()=>{
 const ctx=await engine({config:{}});ctx.handlers.address_name=async()=>{throw new DOMException('Owned cancellation','AbortError');};
 await assert.rejects(()=>ctx.call('inspect_address_context',{address:'0x100'}),{name:'AbortError'});
});

test('bundle retrieval is detached and filtered unknown listings preserve revisions',async()=>{
 const ctx=ledger();await ctx.evidence('owned_evidence_fixture',{}, {answer:23},{subject:null});
 const high=(await ctx.call('record_unknown',question)).result;
 await ctx.call('record_unknown',{...question,question:'A separately owned low-priority question',severity:'low',domain:'other-fixture'});
 const selected=(await ctx.call('list_unknowns',{status:'open',severity:'high',domain:'owned-fixture'})).result;
 assert.equal(selected.total,1);assert.equal(selected.items[0].unknown_id,high.unknown_id);selected.items[0].revision=999;
 assert.equal(ctx.unknowns.get(high.unknown_id).revision,1);
 const exported=(await ctx.call('get_evidence_bundle',{})).result;checkBundle(exported);exported.records[0].normalized_result.answer=99;
 assert.equal(ctx.ledger.values().next().value.normalized_result.answer,23);
});

test('bundle export and retrieval reject changed retained records before writing any file',async t=>{
 const root=await temporary(t),ctx=ledger(),record=await ctx.evidence('owned_evidence_fixture',{}, {answer:23},{subject:null});
 ctx.ledger.get(record.evidence_id).normalized_result.answer=24;
 await assert.rejects(()=>ctx.call('get_evidence_bundle',{}),/digest mismatch/);
 const file=join(root,'must-not-publish.json');await assert.rejects(()=>ctx.call('export_evidence_bundle',{path:file}),/digest mismatch/);
 await assert.rejects(()=>readFile(file),{code:'ENOENT'});
});

test('duplicate unknown identities reject atomically rather than replacing a valid imported revision',async t=>{
 const root=await temporary(t),source=ledger(),destination=ledger();await source.call('record_unknown',question);
 const b=bundle(source);b.unknowns.push(structuredClone(b.unknowns[0]));
 const file=await save(root,'duplicate-unknown.json',b);
 await assert.rejects(()=>destination.call('import_evidence_bundle',{path:file}),/Duplicate unknown/);
 assert.equal(destination.ledger.size,0);assert.equal(destination.unknowns.size,0);
});

test('bundle comparison proves explicit changed pairs and rejects duplicate correspondence',async t=>{
 const root=await temporary(t),left=ledger(),right=ledger(),ctx=ledger();
 const a=await left.evidence('owned_evidence_fixture',{}, {answer:23},{subject:null}),b=await right.evidence('owned_evidence_fixture',{}, {answer:24},{subject:null});
 const left_bundle_path=await save(root,'left.json',bundle(left)),right_bundle_path=await save(root,'right.json',bundle(right));
 const pair={left_evidence_id:a.evidence_id,right_evidence_id:b.evidence_id};
 const compared=await ctx.call('compare_bundles',{left_bundle_path,right_bundle_path,record_pairs:[pair]});
 assert.equal(compared.normalized_result.summary.records_changed,1);assert.equal(compared.normalized_result.status,'changed');assert.equal(compared.normalized_result.summary.records_added,0);
 await assert.rejects(()=>ctx.call('compare_bundles',{left_bundle_path,right_bundle_path,record_pairs:[pair,pair]}),/Duplicate|one-to-one/);
});

test('opaque public-contract identities with conflicting bytes compare as contradictions',async t=>{
 const root=await temporary(t),left=ledger(),right=ledger(),ctx=ledger();
 for(const [c,answer]of [[left,23],[right,24]]){const r=await c.evidence('owned_historical_shape_fixture',{}, {answer},{subject:null,predicateType:'rea.owned-interface-fixture'});r.evidence_id='ev_'+'a'.repeat(64);c.ledger.clear();c.ledger.set(r.evidence_id,r);}
 const left_bundle_path=await save(root,'opaque-left.json',bundle(left)),right_bundle_path=await save(root,'opaque-right.json',bundle(right));
 const compared=await ctx.call('compare_bundles',{left_bundle_path,right_bundle_path});
 assert.equal(compared.normalized_result.summary.records_unchanged,0);assert.equal(compared.normalized_result.summary.records_changed,1);assert.equal(compared.normalized_result.changes[0].conclusion_kind,'contradiction');
 const sameValue=bundle(right);sameValue.records[0].normalized_result.answer=23;sameValue.records[0].provider.name='A conflicting owned producer';await writeFile(right_bundle_path,JSON.stringify(sameValue));
 const paired=await ctx.call('compare_bundles',{left_bundle_path,right_bundle_path,record_pairs:[{left_evidence_id:sameValue.records[0].evidence_id,right_evidence_id:sameValue.records[0].evidence_id}]});assert.equal(paired.normalized_result.summary.records_unchanged,0);assert.equal(paired.normalized_result.changes[0].conclusion_kind,'contradiction');
});

test('bundle comparison distinguishes next-revision progression from branching histories',async t=>{
 const root=await temporary(t),base=ledger(),branch=ledger(),ctx=ledger();
 const original=(await base.call('record_unknown',question)).result,baseline=bundle(base),before=await save(root,'before.json',baseline);
 await branch.call('import_evidence_bundle',{path:before});
 const advanced=(await base.call('update_unknown',update(original))).result,after=await save(root,'after.json',bundle(base));
 const progression=await ctx.call('compare_bundles',{left_bundle_path:before,right_bundle_path:after});assert.equal(progression.normalized_result.summary.unknowns_advanced,1);assert.equal(progression.normalized_result.summary.unknowns_diverged,0);
 await branch.call('update_unknown',update(original,{status:'blocked'}));const diverged=await save(root,'branch.json',bundle(branch));
 const comparison=await ctx.call('compare_bundles',{left_bundle_path:after,right_bundle_path:diverged});assert.equal(comparison.normalized_result.summary.unknowns_diverged,1);assert.equal(comparison.normalized_result.changes.find(c=>c.entity==='residual_unknown').conclusion_kind,'contradiction');assert.equal(advanced.previous_revision_digest,original.revision_digest);
});

test('same opaque unknown revision cannot silently replace retained question bytes',async t=>{
 const root=await temporary(t),source=ledger(),destination=ledger();await source.call('record_unknown',question);
 const historical=bundle(source),mutation=historical.records[0];mutation.predicate_type='rea.owned-mutation-shape-fixture';mutation.evidence_id='ev_'+'e'.repeat(64);historical.unknowns[0].mutation_evidence_ids=[mutation.evidence_id];historical.unknowns[0].revision_digest='b'.repeat(64);
 const file=await save(root,'historical-unknown.json',historical),originalFile=await save(root,'original-opaque-unknown.json',historical);await destination.call('import_evidence_bundle',{path:file});
 const before=digest(bundle(destination));historical.unknowns[0].question='Conflicting owned question with the same opaque revision';await writeFile(file,JSON.stringify(historical));
 await assert.rejects(()=>destination.call('import_evidence_bundle',{path:file}),/history conflicts/);assert.equal(digest(bundle(destination)),before);
 const compared=await destination.call('compare_bundles',{left_bundle_path:originalFile,right_bundle_path:file});assert.equal(compared.normalized_result.summary.unknowns_unchanged,0);assert.equal(compared.normalized_result.summary.unknowns_diverged,1);const conflict=compared.normalized_result.changes.find(change=>change.entity==='residual_unknown');assert.equal(conflict.conclusion_kind,'contradiction');assert.notEqual(conflict.left_digest,conflict.right_digest);
});

test('cancelled evidence and calls do not report completed observations',async()=>{
 const controller=new AbortController(),ctx=new Context({signal:controller.signal});ctx.handlers=evidence;
 controller.abort();await assert.rejects(()=>ctx.evidence('owned_cancelled_observation',{}, {answer:23},{subject:null}),{name:'AbortError'});assert.equal(ctx.ledger.size,0);
 const late=new AbortController(),other=new Context({signal:late.signal});other.handlers.get_evidence_bundle=async()=>{late.abort();return {result:bundle(other)};};
 await assert.rejects(()=>other.call('get_evidence_bundle',{}),/cancelled|aborted/i);assert.equal(other.history.length,0);
});

test('call-path absence and self-paths require the selected start to exist in supplied observations',async()=>{
 const ctx=ledger(),record=await ctx.evidence('owned_call_path_fixture',{}, {procedure:{address:'0x100',name:'OwnedKnown'},callees:[],coverage:{status:'complete'}},{subject:null});
 const absent=await ctx.call('build_call_path',{functions:[record],start:{address:'0x200'},goal:{address:'0x300'}});assert.equal(absent.normalized_result.status,'unknown');assert.equal(absent.normalized_result.search_scope.exhaustive,false);
 const self=await ctx.call('build_call_path',{functions:[record],start:{address:'0x200'},goal:{address:'0x200'}});assert.equal(self.normalized_result.status,'unknown');assert.equal(self.normalized_result.paths.length,0);
 const known=await ctx.call('build_call_path',{functions:[record],start:{address:'0x100'},goal:{address:'0x100'}});assert.equal(known.normalized_result.status,'found');assert.equal(known.normalized_result.shortest_hops,0);
});
