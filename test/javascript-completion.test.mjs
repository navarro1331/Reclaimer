import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { engine } from '../lib/engine.mjs';
import { dependencyResolver } from '../lib/javascript-dependencies.mjs';
import { createRequire } from 'node:module';
import { discoverBundleModules,reconstructCommonJsTable } from '../lib/javascript-bundles.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
async function fixture(t,files){const dir=await fs.mkdtemp(path.join(root,'js-completion-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));for(const [name,text] of Object.entries(files)){await fs.mkdir(path.dirname(path.join(dir,name)),{recursive:true});await fs.writeFile(path.join(dir,name),text);}return dir;}
test('supplied native observations change version comparison content and evidence closure',async t=>{
 const dir=await fixture(t,{'index.js':'export const answer=42;'}),c=await engine({config:{}});const call=c.call.bind(c);c.call=async(...args)=>{try{return await call(...args);}catch(e){if(e.details?.validation_errors)e.message+=' '+JSON.stringify(e.details.validation_errors);throw e;}};const app=await c.call('analyze_javascript_application',{input_path:dir});
 const native=async value=>c.evidence('owned_native_inventory',{fixture_only:true}, {entrypoint:value},{subject:{name:'owned-addon',digest:{sha256:c.hash('owned-native')},format:'elf',architecture:'x86_64',local_path:path.join(dir,'owned-addon')},limitations:['Owned synthetic native observation; no vendor analysis claimed']});
 const one=await native('0x10'),two=await native('0x20'),before=structuredClone([app,one,two]);
 const omitted=await c.call('compare_application_versions',{left:app,right:app}),same=await c.call('compare_application_versions',{left:app,right:app,left_native_observations:[one],right_native_observations:[one]}),different=await c.call('compare_application_versions',{left:app,right:app,left_native_observations:[one],right_native_observations:[two]});
 assert.equal(same.normalized_result.summary.changed,0);assert.ok(different.normalized_result.summary.changed>0);assert.notEqual(different.normalized_result.comparison_id,omitted.normalized_result.comparison_id);assert.ok(different.evidence_links.includes(one.evidence_id));assert.ok(different.evidence_links.includes(two.evidence_id));assert.ok(different.normalized_result.items.some(i=>i.status==='changed'&&i.dimensions.includes('properties')));assert.deepEqual([app,one,two],before);
});
test('package fallback skips invalid targets, stops at missing valid targets, and accepts explicit custom conditions',()=>{
 const files=(exports)=>[{path:'node_modules/owned/package.json',bytes:Buffer.from(JSON.stringify({exports}))},{path:'node_modules/owned/fallback.js',bytes:Buffer.from('')},{path:'node_modules/owned/dev.js',bytes:Buffer.from('')}];
 assert.equal(dependencyResolver(files(['../escape.js','./fallback.js']))('main.js','owned').path,'node_modules/owned/fallback.js');
 assert.equal(dependencyResolver(files(['./absent.js','./fallback.js']))('main.js','owned'),null);
 assert.equal(dependencyResolver(files({development:'./dev.js',default:'./fallback.js'}))('main.js','owned'),null);
 assert.equal(dependencyResolver(files({development:'./dev.js',default:'./fallback.js'}),{conditions:['development']})('main.js','owned').path,'node_modules/owned/dev.js');
 assert.equal(dependencyResolver(files(['./node_modules/escape.js','./fallback.js']))('main.js','owned').path,'node_modules/owned/fallback.js');
});
test('finite ownership joins imported resource acquisitions to release and promise chains without asserting execution',async t=>{
 const dir=await fixture(t,{'index.js':`import fs from 'node:fs'; const fd=fs.openSync('owned.txt','r');fs.closeSync(fd);const p=Promise.resolve(42);p.then(value=>value);const both=Promise.all([p]);`}),c=await engine({config:{}}),r=(await c.call('analyze_javascript_application',{input_path:dir})).normalized_result.semantic_graph;
 assert.ok(r.nodes.some(n=>n.kind==='resource'));for(const kind of ['acquires','releases','owns','creates-promise','chains','aggregates'])assert.ok(r.relations.some(e=>e.relation===kind),kind);assert.ok(r.relations.filter(e=>['acquires','releases'].includes(e.relation)).every(e=>e.resolution==='candidate'));assert.equal(r.coverage.families.find(f=>f.family==='resource-lifecycle').status,'partial');
});
test('shadowed and reassigned resource handles do not acquire false release relationships',async t=>{
 const dir=await fixture(t,{'index.js':`import fs from 'node:fs'; let fd=fs.openSync('owned.txt','r');fd=17;fs.closeSync(fd);function pretend(fs){const bad=fs.openSync('not-read');fs.closeSync(bad);}`}),c=await engine({config:{}}),r=(await c.call('analyze_javascript_application',{input_path:dir})).normalized_result.semantic_graph;
 assert.equal(r.nodes.filter(n=>n.kind==='resource').length,1);assert.equal(r.relations.filter(e=>e.relation==='releases').length,0);
});
test('retained TypeScript paths remain compiler candidates and package imports can select external inventory',()=>{
 const files=Object.entries({'tsconfig.json':JSON.stringify({compilerOptions:{paths:{'@owned/*':['missing/*','src/*']}}}),'src/answer.ts':'export const answer=42;','package.json':JSON.stringify({imports:{'#answer':'owned/answer','#cycle':'#cycle'}}),'node_modules/owned/package.json':JSON.stringify({exports:{'./answer':'./answer.js'}}),'node_modules/owned/answer.js':'export const answer=42;'}).map(([path,text])=>({path,bytes:Buffer.from(text)}));
 const resolve=dependencyResolver(files);assert.equal(resolve('main.ts','@owned/answer').path,'src/answer.ts');assert.equal(resolve('main.ts','@owned/answer').basis,'declared-typescript-path-candidate');assert.equal(resolve('main.ts','#answer').path,'node_modules/owned/answer.js');assert.equal(resolve('main.ts','#cycle'),null);assert.equal(resolve('main.ts','@owned/../../outside'),null);
});
test('selected closed CommonJS tables reconstruct dependency maps and cache with an owned executable fixture',async t=>{
 const source=`(function(table){return table;})({1:[function(require,module,exports){module.exports={answer:require('./answer').answer};},{'./answer':2}],2:[function(require,module,exports){exports.answer=42;},{}]});`,dir=await fixture(t,{'owned.js':source}),c=await engine({config:{}}),e=await c.call('recover_javascript_sources',{path:path.join(dir,'owned.js'),output_directory:path.join(dir,'out'),extraction_mode:'heuristic',rewrite_level:'aggressive'}),r=e.normalized_result;
 const module=r.modules.find(m=>m.artifact.path.endsWith('reconstructed-commonjs.cjs'));assert.ok(module);const restored=createRequire(import.meta.url)(module.artifact.path);assert.deepEqual(restored.load(1),{answer:42});assert.equal(restored.load(1),restored.load(1));assert.equal(r.runtime_equivalence,'unknown');assert.equal(await fs.readFile(path.join(dir,'owned.js'),'utf8'),source);
 const capture=`const hidden=42;(function(table){return table;})({1:function(module,exports,require){exports.answer=hidden;}});`;assert.equal(reconstructCommonJsTable(capture,'owned.js',discoverBundleModules(capture,'owned.js','heuristic')),null);
});
function historical(c,files){return {schema:'HistoricalSourceGraph',authority:'historical-reference',root_alias:'$REFERENCE_ROOT',root_sha256:c.hash(files),inventory_state:'complete',entries:Object.entries(files).map(([path,text])=>({path,classifications:['source'],limitations:[],kind:'file',language:'javascript',sha256:c.hash(text),size:Buffer.byteLength(text),content_state:'hashed'})),relationships:[],parse_failures:[],exclusions:[],languages:['javascript'],manifests:[],vcs:null,provenance:{importer:'owned-fixture',importer_version:'1',caller:'unit-test'},limitations:[]};}
test('source-map partition comparison distinguishes split coordinates from duplicated full original mappings',async t=>{
 const original='export const one=1;\nexport const two=2;',map=mappings=>JSON.stringify({version:3,sources:['original.js'],sourcesContent:[original],names:[],mappings}),dir=await fixture(t,{'a.js':'export const one=1;\n//# sourceMappingURL=a.map','a.map':map('AAAA'),'b.js':'export const two=2;\n//# sourceMappingURL=b.map','b.map':map('AACA')}),c=await engine({config:{}}),app=await c.call('analyze_javascript_application',{input_path:dir}),reference=historical(c,{'original.js':original});
 const comparison=(await c.call('compare_source_to_bundle',{reference,application:app})).normalized_result;assert.equal(comparison.items[0].status,'split');assert.equal(comparison.summary.split,1);assert.equal(comparison.items[0].current_node_ids.length,2);assert.match(comparison.items[0].limitations.join(' '),/complete mapped extents/);
 const conflicting=structuredClone(reference);conflicting.entries.push({...conflicting.entries[0],sha256:c.hash('different original'),size:18});const conflict=(await c.call('compare_source_to_bundle',{reference:conflicting,application:app})).normalized_result;assert.equal(conflict.items[0].status,'split');assert.notEqual(conflict.items[1].status,'split','A partition proved for one digest cannot be assigned to a different digest sharing its path');
 await fs.writeFile(path.join(dir,'b.map'),map('AAAA'));const duplicated=(await c.call('compare_source_to_bundle',{reference,application:await c.call('analyze_javascript_application',{input_path:dir})})).normalized_result;assert.equal(duplicated.items[0].status,'duplicated');
});
test('source-map comparison reports multiple byte-bound originals in one generated module as merged',async t=>{
 const one='export const one=1;',two='export const two=2;',map={version:3,sources:['one.js','two.js'],sourcesContent:[one,two],names:[],mappings:'AAAA;ACAA'},dir=await fixture(t,{'both.js':`${one}\n${two}\n//# sourceMappingURL=both.map`,'both.map':JSON.stringify(map)}),c=await engine({config:{}}),app=await c.call('analyze_javascript_application',{input_path:dir}),comparison=(await c.call('compare_source_to_bundle',{reference:historical(c,{'one.js':one,'two.js':two}),application:app})).normalized_result;assert.deepEqual(comparison.items.map(i=>i.status),['merged','merged']);assert.equal(comparison.summary.merged,2);assert.equal(comparison.items[0].current_node_ids[0],comparison.items[1].current_node_ids[0]);
});
