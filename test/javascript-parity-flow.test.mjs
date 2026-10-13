import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { Context } from '../lib/core.mjs';
import { handlers } from '../lib/javascript.mjs';
import { properties,sha } from '../lib/javascript-model.mjs';

const testRoot=path.dirname(fileURLToPath(import.meta.url));
async function fixture(t,files){const root=await fs.mkdtemp(path.join(testRoot,'javascript-parity-flow-'));t.after(async()=>{assert.ok(root.startsWith(`${testRoot}${path.sep}javascript-parity-flow-`));await fs.rm(root,{recursive:true,force:true});});for(const [name,value]of Object.entries(files)){const p=path.join(root,name);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,value);}return root;}
const context=()=>{const c=new Context();c.handlers=handlers;return c;};
const exported=(r,p,name)=>properties(r.graph.nodes.find(n=>properties(n).path===p&&properties(n).export_name===name));

test('static package exports/imports/self-reference and pattern routes resolve only within inventory',async t=>{
  const root=await fixture(t,{'package.json':JSON.stringify({name:'owned-app',exports:{'./shared':'./shared.js'},imports:{'#config':'./config.js'}}),'config.js':'export const config = { label: "owned", n: 42 };','shared.js':'export { config } from "#config";','entry.js':'import { config as viaPackage } from "owned-app/shared"; import { extra } from "owned-dep/feature/red"; export const result = {...viaPackage, extra};','node_modules/owned-dep/package.json':JSON.stringify({exports:{'./feature/*':'./features/*.js'}}),'node_modules/owned-dep/features/red.js':'export const extra = 7;'}),r=(await context().call('analyze_javascript_application',{input_path:root})).normalized_result;
  assert.equal(exported(r,'entry.js','result').export_shape.fields.label.value,'owned');assert.equal(exported(r,'entry.js','result').export_shape.fields.extra.value,7);
  const entries=r.graph.edges.filter(e=>e.properties.specifier==='owned-dep/feature/red');assert.equal(entries.length,1);assert.equal(entries[0].properties.resolution_basis,'declared-package-export');assert.equal(properties(r.graph.nodes.find(n=>n.node_id===entries[0].target_node_id)).path,'node_modules/owned-dep/features/red.js');
});
test('import/require conditional paths are separated, unavailable conditions and blocked private subpaths stay unresolved',async t=>{
  const root=await fixture(t,{'entry.js':'import { config } from "owned"; export const result = config; import { config as missing } from "owned/private.js"; export const secret = missing;','entry.cjs':'const {config} = require("owned"); exports.result = config;','node_modules/owned/package.json':JSON.stringify({exports:{'.':{import:'./esm.js',require:'./common.cjs'},'./uncertain':{browser:'./browser.js',default:'./esm.js'}}}),'node_modules/owned/esm.js':'export const config = {kind: "esm"};','node_modules/owned/common.cjs':'module.exports = {config: {kind: "cjs"}};','node_modules/owned/private.js':'export const config = { secret: true };','uncertain.js':'import { config } from "owned/uncertain"; export const result=config;'}),r=(await context().call('analyze_javascript_application',{input_path:root})).normalized_result;
  assert.equal(exported(r,'entry.js','result').export_shape.fields.kind.value,'esm');assert.equal(exported(r,'entry.cjs','result').export_shape.fields.kind.value,'cjs');assert.equal(exported(r,'entry.js','secret').resolution,'unresolved');assert.equal(exported(r,'uncertain.js','result').resolution,'unresolved');
  assert.ok(r.graph.edges.filter(e=>e.properties.specifier==='owned/private.js').every(e=>e.properties.resolution==='unresolved'));
});
test('default CommonJS function, ESM default arrow and namespace object method aliases join actual returns',async t=>{
  const root=await fixture(t,{'common.cjs':'module.exports = function increment(x) { return x + 1; };','origin.js':'export default x => x * 2; export const api = { increment(x) { return x + 2; } };','entry.cjs':'const increment = require("./common.cjs"); const answer = increment(9); exports.answer = answer;','entry.js':'import twice, * as ns from "./origin.js"; const method=ns.api.increment; const a=twice(3); const b=method(4);'}),r=(await context().call('analyze_javascript_application',{input_path:root})).normalized_result,g=r.semantic_graph;
  for(const p of ['entry.js','entry.cjs']){const calls=g.nodes.filter(n=>n.kind==='call-site'&&n.identity.module_path===p&&!['require'].includes(n.properties.callee));assert.ok(calls.length);for(const call of calls){assert.ok(g.relations.some(e=>e.source_node_id===call.node_id&&e.relation==='calls'));assert.ok(g.relations.some(e=>e.target_node_id===call.node_id&&e.relation==='returns-to-call'&&e.resolution==='candidate'));}}
  assert.ok(g.nodes.some(n=>n.kind==='return-site'&&n.properties.implicit));assert.ok(g.relations.some(e=>e.relation==='argument-to-parameter'&&e.properties.cross_module));
});
test('forward/backward traces connect parameter arithmetic, call result, binding and literal sink without claiming branch execution',async t=>{
  const root=await fixture(t,{'origin.js':'export function transform(x) { return x + 2; }','entry.js':'import { transform } from "./origin.js"; const answer=transform(40); sink(answer);'}),c=context(),application=await c.call('analyze_javascript_application',{input_path:root}),g=application.normalized_result.semantic_graph,call=g.nodes.find(n=>n.kind==='call-site'&&n.properties.callee==='transform');
  const backward=(await c.call('trace_javascript_semantics',{application,query:{seed:{kind:'semantic-node',node_id:call.node_id},direction:'backward-provenance',include_ambiguous_dynamic_edges:true}})).normalized_result;
  assert.ok(backward.nodes.some(n=>n.kind==='return-site'));assert.ok(backward.nodes.some(n=>n.kind==='literal'&&n.properties.value===2));assert.ok(backward.relations.some(r=>r.relation==='returns-to-call'&&r.properties.conditional_execution_unknown));assert.equal(backward.status,'partial');
  const forward=(await c.call('trace_javascript_semantics',{application,query:{seed:{kind:'literal',value:40},direction:'forward-influence',include_ambiguous_dynamic_edges:true}})).normalized_result;
  assert.ok(forward.nodes.some(n=>n.label==='sink'));assert.ok(forward.relations.some(r=>r.relation==='argument-to-parameter'));
});
test('local hoisted calls get complete parameter/return joins; mutated and uninitialized aliases remain dynamic',async t=>{
  const root=await fixture(t,{'entry.js':'const result=later(7); function later(x) { return x; } let changed=later; changed=other; changed(8); early(1); const early=x=>x; const { value: alias }={value:42}; export const settings={answer:alias};'}),r=(await context().call('analyze_javascript_application',{input_path:root})).normalized_result,g=r.semantic_graph;
  const later=g.nodes.find(n=>n.kind==='call-site'&&n.properties.callee==='later');assert.ok(g.relations.some(e=>e.source_node_id===later.node_id&&e.relation==='calls'));assert.ok(g.relations.some(e=>e.relation==='argument-to-parameter'&&g.nodes.find(n=>n.node_id===e.source_node_id)?.properties.value===7));
  for(const callee of ['changed','early']){const call=g.nodes.find(n=>n.kind==='call-site'&&n.properties.callee===callee);assert.ok(!g.relations.some(e=>e.source_node_id===call.node_id&&e.relation==='calls'));assert.ok(g.unknowns.some(u=>u.node_id===call.node_id&&u.reason==='dynamic-call'));}
  assert.equal(exported(r,'entry.js','settings').export_shape.fields.answer.value,42);assert.ok(g.relations.some(r=>r.relation==='destructures'));
});
test('destructured/default parameters, constant array aliases and closure relationships remain explicit static observations',async t=>{
  const root=await fixture(t,{'entry.js':'const [first, second]=[{x:1},{x:2}]; export const settings={...second}; const outer=42; export const fn=({value=3})=>{ const local=outer; return value + local; }; fn({value:9});'}),r=(await context().call('analyze_javascript_application',{input_path:root})).normalized_result,g=r.semantic_graph;
  assert.equal(exported(r,'entry.js','settings').export_shape.fields.x.value,2);assert.ok(g.relations.some(r=>r.relation==='destructures'&&r.properties.property==='value'));assert.ok(g.relations.some(r=>r.relation==='defaults'&&r.resolution==='candidate'));assert.ok(g.relations.some(r=>r.relation==='captures'));assert.equal(g.coverage.families.find(f=>f.family==='closure').status,'partial');
});
test('imported synchronous factory closures join captures and returned alias candidates while async/conditional results stay unknown',async t=>{
  const origin='export function create(base) { return delta => base + delta; } export async function asyncCreate(base) { return delta => base + delta; } export function conditional(base) { if (base) return delta => delta; return null; }',root=await fixture(t,{'origin.mjs':origin,'entry.mjs':'import {create,asyncCreate,conditional} from "./origin.mjs"; const handler=create(40); const alias=handler; alias(2); const pending=asyncCreate(1); pending(2); const ambiguous=conditional(1); ambiguous(2);'}),c=context(),application=await c.call('analyze_javascript_application',{input_path:root}),g=application.normalized_result.semantic_graph;
  const {create}=await import(pathToFileURL(path.join(root,'origin.mjs')).href);assert.equal(create(40)(2),42);
  const alias=g.nodes.find(n=>n.kind==='call-site'&&n.properties.callee==='alias'),relation=g.relations.find(r=>r.source_node_id===alias.node_id&&r.relation==='calls');assert.equal(relation.resolution,'candidate');assert.equal(relation.properties.returned_function_candidate,true);assert.ok(g.relations.some(r=>r.relation==='captures'&&r.target_node_id===relation.target_node_id));assert.ok(g.unknowns.some(u=>u.node_id===alias.node_id));
  for(const name of ['pending','ambiguous']){const call=g.nodes.find(n=>n.kind==='call-site'&&n.properties.callee===name);assert.ok(!g.relations.some(r=>r.source_node_id===call.node_id&&r.relation==='calls'));assert.ok(g.unknowns.some(u=>u.node_id===call.node_id));}
  const traced=(await c.call('trace_javascript_semantics',{application,query:{seed:{kind:'literal',value:40},direction:'forward-influence',include_ambiguous_dynamic_edges:true}})).normalized_result;assert.ok(traced.relations.some(r=>r.relation==='captures'));assert.ok(traced.nodes.some(n=>n.node_id===alias.node_id));assert.equal(traced.status,'partial');
});
test('heuristic recovery extracts conventional literal CommonJS wrapper tables with exact UTF8 bytes and dependencies',async t=>{
  const source='/* 🔥 owned context */ bootstrap({ 1: [function(require,module,exports) { exports.answer = 42; }, {"./two":2}], 2: [function(require,module,exports) { module.exports = 7; }, {}] });',root=await fixture(t,{'bundle.js':source}),c=context();
  const structural=(await c.call('recover_javascript_sources',{path:path.join(root,'bundle.js'),output_directory:path.join(root,'structural'),extraction_mode:'structural',rewrite_level:'minimal'})).normalized_result;assert.equal(structural.modules.length,1);
  const r=(await c.call('recover_javascript_sources',{path:path.join(root,'bundle.js'),output_directory:path.join(root,'heuristic'),extraction_mode:'heuristic',rewrite_level:'minimal'})).normalized_result,manifest=JSON.parse(await fs.readFile(r.manifest.path));assert.equal(r.modules.length,3);assert.equal(r.status,'partial');assert.equal(r.runtime_equivalence,'unknown');assert.equal(manifest.bundle_candidates[0].dependencies['./two'],2);
  for(const module of r.modules.slice(1)){const range=module.provenance.byte_ranges[0],original=Buffer.from(source).subarray(range.start,range.end);assert.equal(module.provenance.original_sha256,sha(original));assert.ok(module.provenance.context_byte_ranges[0].start<=range.start);const wrapper=vm.runInNewContext(await fs.readFile(module.artifact.path,'utf8'),{}, {timeout:500});assert.equal(typeof wrapper,'function');}
  assert.equal(await fs.readFile(structural.modules[0].artifact.path,'utf8'),source);
});
test('inspection exposes additional literal function tables and retains malformed discovery as partial with raw input',async t=>{
  const root=await fixture(t,{'bundle.js':'const table={owned:(value)=>value+1};','bad.js':'const table = { owned: function('}),c=context();
  const heuristic=(await c.call('recover_javascript_sources',{path:path.join(root,'bundle.js'),output_directory:path.join(root,'h'),extraction_mode:'heuristic'})).normalized_result,inspection=(await c.call('recover_javascript_sources',{path:path.join(root,'bundle.js'),output_directory:path.join(root,'i'),extraction_mode:'inspection'})).normalized_result;assert.equal(heuristic.modules.length,1);assert.equal(inspection.modules.length,2);const manifest=JSON.parse(await fs.readFile(inspection.manifest.path));assert.equal(manifest.bundle_candidates[0].confidence,'literal-function-table-candidate');
  const bad=(await c.call('recover_javascript_sources',{path:path.join(root,'bad.js'),output_directory:path.join(root,'bad'),extraction_mode:'inspection'})).normalized_result;assert.equal(bad.status,'partial');assert.ok(bad.warnings.some(w=>w.kind==='bundle-discovery'));assert.equal(await fs.readFile(bad.modules[0].artifact.path,'utf8'),'const table = { owned: function(');
});
