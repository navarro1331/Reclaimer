import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as asar from '@electron/asar';
import { Context } from '../lib/core.mjs';
import { handlers } from '../lib/javascript.mjs';
import { sha,id,properties } from '../lib/javascript-model.mjs';
import { validate } from '../lib/contracts.mjs';

const testRoot=path.dirname(fileURLToPath(import.meta.url));
async function fixture(t,files) {
  const root=await fs.mkdtemp(path.join(testRoot,'javascript-temp-'));t.after(async()=>{const p=path.resolve(root);assert.ok(p.startsWith(`${testRoot}${path.sep}javascript-temp-`));await fs.rm(p,{recursive:true,force:true});});
  for(const [name,text]of Object.entries(files)){const p=path.join(root,name);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,text);}
  return root;
}
function context(){const ctx=new Context();ctx.handlers=handlers;return ctx;}
async function call(ctx,op,args) {
  const input=validate(op,'input',args);assert.equal(input.valid,true,JSON.stringify(input.errors,null,2));
  const out=await ctx.call(op,args),v=validate(op,'output',out);assert.equal(v.valid,true,JSON.stringify(v.errors,null,2));return out;
}
const sample={
  'package.json':JSON.stringify({name:'fresh-synthetic-project',main:'main.js'}),
  'main.js':`import { sum } from './math.js';
import { ipcMain } from 'electron';
function compute(left, right) { const total = left + right; return total; }
ipcMain.handle('fresh:calculate', (_event, x) => compute(x, 7));
export const config = { title: 'Fresh', count: 2, enabled: true, nested: { color: 'cyan' } };
const result = compute(3, 8);`,
  'math.js':`export function sum(a, b) { return a + b; }`,
  'preload.js':`const { ipcRenderer, contextBridge } = require('electron');
contextBridge.exposeInMainWorld('freshAPI', { calculate: x => ipcRenderer.invoke('fresh:calculate', x) });`,
};
test('directory analysis hashes bytes, resolves imports, exports and lexical call flow',async t=>{
  const root=await fixture(t,sample),ctx=context(),ev=await call(ctx,'analyze_javascript_application',{input_path:root});
  const r=ev.normalized_result;assert.equal(r.statistics.parsed_javascript_files,3);assert.ok(r.graph.edges.some(e=>e.relation==='imports'&&e.properties.resolution==='resolved'));assert.ok(r.semantic_graph.relations.some(e=>e.relation==='calls'));assert.ok(r.graph.nodes.some(n=>properties(n).export_name==='config'));assert.equal(r.summary.ipc.paired_renderer_transmissions,1);assert.equal(r.semantic_graph.coverage.status,'partial');
  const again=await call(ctx,'analyze_javascript_application',{input_path:root});assert.equal(r.graph.graph_id,again.normalized_result.graph.graph_id);
  const summary=await call(ctx,'analyze_javascript_application',{input_path:root,detail:'summary'});assert.equal(summary.normalized_result.kind,'summary');
});
test('ASAR analysis reads observed members with integrity metadata',async t=>{
  const root=await fixture(t,sample),archive=path.join(root,'application.asar');await asar.createPackage(root,archive);
  const result=await call(context(),'analyze_javascript_application',{input_path:archive,format:'asar'});assert.equal(result.normalized_result.format,'asar');assert.equal(result.normalized_result.statistics.parsed_javascript_files,3);
});
test('invalid source is retained as partial coverage without invented AST findings',async t=>{
  const root=await fixture(t,{'broken.js':'export function {'}),ev=await call(context(),'analyze_javascript_application',{input_path:root});assert.equal(ev.normalized_result.statistics.parse_failures,1);assert.equal(ev.normalized_result.graph.coverage.status,'partial');assert.equal(ev.normalized_result.semantic_graph.nodes.filter(n=>n.kind==='function').length,0);
});
test('feature traces preserve static provenance and semantic traces report unresolved frontiers',async t=>{
  const root=await fixture(t,sample),ctx=context(),app=await call(ctx,'analyze_javascript_application',{input_path:root});
  const trace=await call(ctx,'trace_application_feature',{application:app,seed:{kind:'channel',value:'fresh:calculate'},direction:'both'});assert.equal(trace.normalized_result.seed_matches.length,2);assert.ok(trace.normalized_result.paths.length);
  const sem=await call(ctx,'trace_javascript_semantics',{application:app,query:{seed:{kind:'literal',value:7},direction:'forward-influence',include_ambiguous_dynamic_edges:true}});assert.ok(sem.normalized_result.seed_node_ids.length);assert.equal(sem.normalized_result.status,'partial');
  const miss=await call(ctx,'trace_application_feature',{application:app,seed:{kind:'module',value:'nonexistent',match:'exact'}});assert.equal(miss.normalized_result.graph,null);assert.equal(miss.normalized_result.coverage.status,'no-match');
});
test('version and literal export comparisons detect independently authored changes',async t=>{
  const l=await fixture(t,{'entry.js':`export const settings = { title: 'alpha', size: 4 };`}),r=await fixture(t,{'entry.js':`export const settings = { title: 'beta', enabled: true };`}),ctx=context(),left=await call(ctx,'analyze_javascript_application',{input_path:l}),right=await call(ctx,'analyze_javascript_application',{input_path:r});
  const ev=await call(ctx,'compare_application_versions',{left,right});assert.ok(ev.normalized_result.summary.changed);
  const cmp=await call(ctx,'compare_javascript_export_shapes',{left,right,left_module_path:'entry.js',left_export_name:'settings',right_module_path:'entry.js',right_export_name:'settings'});assert.deepEqual(cmp.normalized_result.summary,{added:1,removed:1,changed:1,unknown:0});
});
test('source to bundle comparison uses digests before names and preserves partial absence',async t=>{
  const text=`export const marker = 'fresh';`,root=await fixture(t,{'source.js':text}),ctx=context(),app=await call(ctx,'analyze_javascript_application',{input_path:root});
  const reference={schema:'HistoricalSourceGraph',authority:'historical-reference',root_alias:'$REFERENCE_ROOT',root_sha256:sha('fresh-ref'),inventory_state:'complete',entries:[{path:'source.js',classifications:['source'],limitations:[],kind:'file',language:'javascript',sha256:sha(text),size:Buffer.byteLength(text),content_state:'hashed'}],relationships:[],parse_failures:[],exclusions:[],languages:['javascript'],manifests:[],vcs:null,provenance:{importer:'synthetic',importer_version:'1',caller:'unit-test'},limitations:[]};
  const cmp=await call(ctx,'compare_source_to_bundle',{reference,application:app});assert.equal(cmp.normalized_result.items[0].status,'unchanged');assert.ok(cmp.normalized_result.items[0].candidates[0].signals.some(s=>s.kind==='exact-source-digest'));
});
test('source recovery preserves embedded content and byte receipts without executing code',async t=>{
  const map={version:3,sources:['../../fresh-original.ts'],sourcesContent:[`export const original: number = 42;`],names:[],mappings:''},source=`export const compiled = 42;\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(map)).toString('base64')}`,root=await fixture(t,{'bundle.js':source}),out=path.join(root,'recovery');
  const ev=await call(context(),'recover_javascript_sources',{path:path.join(root,'bundle.js'),output_directory:out});assert.equal(ev.normalized_result.runtime_equivalence,'unknown');assert.equal(ev.normalized_result.modules.length,2);for(const m of ev.normalized_result.modules)assert.equal(sha(await fs.readFile(m.artifact.path)),m.artifact.sha256);
  await assert.rejects(()=>handlers.recover_javascript_sources({path:path.join(root,'bundle.js'),output_directory:out},context()),/exist/i);
});
test('platform projections classify explicit inventories and preserve declaration authority',async()=>{
  const ctx=context(),inventory=await ctx.evidence('inventory_artifact',{}, {manifest:{root_sha256:sha('apk'),root_format:'apk'},entries:[{name:'classes.dex',sha256:sha('dex'),format:'dex'},{name:'lib/arm64-v8a/libfresh.so',sha256:sha('native'),format:'elf'},{name:'assets/fresh.js',sha256:sha('js'),format:'javascript'}],coverage:{status:'complete'}});
  const android=await call(ctx,'project_android_application_graph',{inventory_evidence:[inventory]});assert.equal(android.normalized_result.components.dex.length,1);assert.ok(android.normalized_result.bridge_candidates.length);
  const appleEv=await ctx.evidence('inventory_artifact',{}, {manifest:{root_sha256:sha('ipa'),root_format:'ipa'},entries:[{name:'Payload/Fresh.app/Info.plist',sha256:sha('plist'),format:'plist'},{name:'Payload/Fresh.app/Fresh',sha256:sha('macho'),format:'mach-o'}],coverage:{status:'complete'}}),apple=await call(ctx,'project_apple_application_graph',{inventory_evidence:[appleEv]});assert.deepEqual(apple.normalized_result.application_roots,['Payload/Fresh.app']);assert.equal(apple.normalized_result.platforms[0],'ios');
  const managedEv=await ctx.evidence('synthetic_managed_inspection',{}, {artifact:{path:'fresh.dll',sha256:sha('managed')},module:{name:'fresh.dll',token:'0x00000001'},types:[{name:'FreshType',token:'0x02000001'}],methods:[{name:'Run',token:'0x06000001',declaring_type_token:'0x02000001'}],fields:[],call_edges:[],coverage:{state:'complete'}}),managed=await call(ctx,'project_managed_application_graph',{managed_members:managedEv});assert.equal(managed.normalized_result.summary.methods,1);assert.equal(managed.normalized_result.graph.nodes.find(n=>n.kind==='managed-method').identity.stability,'artifact-version');
});
test('runtime reconciliation requires explicit mapping and does not elevate CDP hash metadata',async t=>{
  const root=await fixture(t,{'entry.js':'export const answer = 13;'}),ctx=context(),app=await call(ctx,'analyze_javascript_application',{input_path:root}),runtime=await ctx.evidence('synthetic_runtime_capture',{}, {target:{target_id:'fresh-target',location:{kind:'file',file_path:path.join(root,'entry.js')},runtime_kind:'node'},capture:{truncated:false},scripts:{items:[{script_key:'fresh-script',location:{kind:'file',file_path:path.join(root,'entry.js')},cdp_hash:sha('wrong-metadata'),status:'observed-loaded'}],excluded:{unsupported_location:0,invalid_protocol_value:0}}});
  const match=await call(ctx,'reconcile_javascript_runtime',{static_layers:[{analysis:app,runtime_mappings:[{kind:'file-root',root,artifact_prefix:''}]}],runtime_observations:[runtime]});assert.equal(match.normalized_result.summary.matched,1);assert.equal(match.normalized_result.reconciliations[0].basis,'artifact-path');
  const none=await call(ctx,'reconcile_javascript_runtime',{static_layers:[{analysis:app}],runtime_observations:[runtime]});assert.equal(none.normalized_result.summary.matched,0);assert.equal(none.normalized_result.reconciliations[0].status,'unmatched');
});
test('obligation ledger never converts a missing verifier into readiness',async t=>{
  const root=await fixture(t,{'entry.js':'export function fresh(x) { return x; }'}),ctx=context(),app=await call(ctx,'analyze_javascript_application',{input_path:root}),bundle={artifacts:[],providers:[],environments:[],scenarios:[],captures:[],unknowns:[],records:[app]},reviewed={obligation_id:'fresh.contract',obligation_version:1,title:'Fresh behavior',application_layer:'application',family:'function',target:{artifact_sha256:app.normalized_result.root_artifact_sha256,application_node_id:null,semantic_node_id:null,location:'entry.js'},required:true,required_case_kinds:['positive'],required_original_authority:'static',required_fixture_authority:'unit',required_verifier_authority:'unit',requires_parser_type:false,dependency_obligation_ids:[],residual_unknown_ids:[],unavailable_authority:[],required_next_evidence:[],disposition:'active',review_evidence_ids:[app.evidence_id]};
  const result=await call(ctx,'build_reconstruction_obligation_ledger',{evidence_bundle:bundle,reviewed_obligations:[reviewed],manifest:{bindings:[],contradictions:[]}});assert.equal(result.normalized_result.status,'open');assert.equal(result.normalized_result.summary.required_open,1);
});
test('coverage evaluator detects an owner distribution gap independently of verifier status',async()=>{
  const ctx=context(),record=await ctx.evidence('fresh_probe',{}, {observed:true}),c={evidence_bundle:{artifacts:[],providers:[],environments:[],scenarios:[],captures:[],unknowns:[],records:[record]},artifacts:[{artifact_id:'fresh.artifact',artifact_sha256:sha('artifact'),version:'1',environment_sha256:sha('env'),evidence_ids:[record.evidence_id]}],surfaces:[{surface_id:'fresh.surface',family:'cli',artifact_id:'fresh.artifact',occurrence_id:null,location:'entry.js',authority:'observed',dependency_surface_ids:[],evidence_ids:[record.evidence_id]}],owners:[{surface_id:'fresh.surface',ownership:{disposition:'implemented',owner_path:'entry.js',owner_export:'fresh',owner_sha256:sha('owner'),path_state:'present',package_state:'missing',authority_route:'none'}}],claims:[],verifier_contracts:[],verifier_results:[],residual_unknown_ids:[],contradictions:[],package_proofs:[],boundaries:[{boundary_id:'fresh.boundary',title:'Fresh boundary',required_surface_ids:['fresh.surface'],required_claim_ids:[],required_package_proof_kinds:[],allowed_dispositions:['implemented'],allowed_unknown_ids:[]}]};
  c.boundaries[0].required_claim_ids=['fresh.claim'];c.boundaries[0].required_package_proof_kinds=['build'];c.boundaries[0].allowed_dispositions=['external','non-goal'];
  const result=await call(ctx,'evaluate_reconstruction_coverage',{coverage:c,boundary_id:'fresh.boundary'});assert.equal(result.status,'partial');assert.equal(result.reasons[0].code,'owner-undistributed');
});
test('lexical aliases connect parameter data flow while same-name nested bindings stay separate',async t=>{
  const root=await fixture(t,{'entry.js':`function outer(left) { const same = left + 1; function inner(left) { return left + 2; } const invoke = inner; return invoke(same); } outer(9);`}),ctx=context(),ev=await call(ctx,'analyze_javascript_application',{input_path:root}),g=ev.normalized_result.semantic_graph;
  const inner=g.nodes.find(n=>n.kind==='function'&&n.label==='inner'),calls=g.relations.filter(r=>r.relation==='calls');assert.ok(calls.some(r=>r.target_node_id===inner.node_id));
  const parameters=g.nodes.filter(n=>n.kind==='parameter'&&n.label==='left');assert.equal(parameters.length,2);assert.notEqual(parameters[0].function_node_id,parameters[1].function_node_id);
  assert.ok(g.relations.some(r=>r.relation==='consumed-by'&&g.nodes.find(n=>n.node_id===r.target_node_id)?.properties.syntax_kind==='BinaryExpression'));
});
test('unknown export values remain unknown and dynamic imports remain unresolved',async t=>{
  const root=await fixture(t,{'entry.js':`export const config = { title: readTitle(), ...dynamicFields }; import(moduleName);`}),ctx=context(),ev=await call(ctx,'analyze_javascript_application',{input_path:root}),result=await call(ctx,'compare_javascript_export_shapes',{left:ev,right:ev,left_module_path:'entry.js',left_export_name:'config',right_module_path:'entry.js',right_export_name:'config'});
  assert.equal(result.normalized_result.coverage.status,'partial');assert.equal(result.normalized_result.summary.unknown,1);assert.ok(ev.normalized_result.semantic_graph.unknowns.some(u=>u.detail.includes('Dynamic import')));
});
