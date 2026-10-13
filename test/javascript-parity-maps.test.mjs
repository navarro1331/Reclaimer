import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Context } from '../lib/core.mjs';
import { handlers } from '../lib/javascript.mjs';
import { properties,sha } from '../lib/javascript-model.mjs';
import { decodeSourceMap,originalPositions,utf16SourceOffset,loadSourceMapSections } from '../lib/javascript-sourcemaps.mjs';
import * as asar from '@electron/asar';
import { stripTypeScriptTypes } from 'node:module';

const testRoot=path.dirname(fileURLToPath(import.meta.url));
async function fixture(t,files){const root=await fs.mkdtemp(path.join(testRoot,'javascript-parity-map-'));t.after(async()=>{assert.ok(root.startsWith(`${testRoot}${path.sep}javascript-parity-map-`));await fs.rm(root,{recursive:true,force:true});});for(const [name,value]of Object.entries(files)){const p=path.join(root,name);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,value);}return root;}
const context=()=>{const c=new Context();c.handlers=handlers;return c;};
// Fixture encoder is authored independently from decoder: explicit signed digits, no decoder calls.
const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function encode(n){let value=Math.abs(n)*2+(n<0?1:0),s='';do{const digit=value%32;value=Math.floor(value/32);s+=chars[digit+(value?32:0)];}while(value);return s;}
const segment=(...fields)=>fields.map(encode).join('');
const flat=(mappings='AAAA',content='export const value = 42;')=>({version:3,sources:['owned-original.js'],sourcesContent:[content],names:[],mappings});

test('VLQ signed deltas preserve original/name state across lines and reset generated columns',()=>{
  const map={version:3,sources:['first.js','second.js'],sourcesContent:['zero\r\n🔥second','012345\nend'],names:['alpha','beta'],ignoreList:[1],mappings:[segment(2,1,0,3,1)+','+segment(3,-1,1,-1,-1),segment(1,1,-1,3)].join(';')},decoded=decodeSourceMap(map);
  assert.deepEqual(decoded.segments.map(s=>s.generated),[{line:0,column:2},{line:0,column:5},{line:1,column:1}]);
  assert.deepEqual(decoded.segments.map(s=>s.original),[{sourceIndex:1,line:0,column:3},{sourceIndex:0,line:1,column:2},{sourceIndex:1,line:0,column:5}]);
  assert.deepEqual(decoded.segments.map(s=>s.name),['beta','alpha',null]);assert.equal(decoded.sources[1].ignored,true);
  const hit=originalPositions(decoded,0,6);assert.equal(hit.mappings[0].source.source,'first.js');assert.equal(hit.mappings[0].original.offset,8);assert.equal(hit.mappings[0].original.contentPosition,'verified');
});
test('lookup retains equal-position ambiguity, greatest preceding lines and generated-only barriers',()=>{
  const d=decodeSourceMap(flat(`${segment(2,0,0,0)},${segment(0,0,0,1)},${segment(3)};;${segment(4,0,0,1)}`,'abc'));
  assert.equal(originalPositions(d,0,1).matchedPosition,null);assert.equal(originalPositions(d,0,2).mappings.length,2);
  assert.equal(originalPositions(d,1,0).mappings[0].state,'generated-only');
  assert.equal(originalPositions(d,2,4).mappings[0].original.column,2);
});
test('UTF16 source coordinates verify CRLF, CR, LF and Unicode line terminators without byte conflation',()=>{
  const content='🔥a\r\nβ\rnext\nlast\u2028owned\u2029done';
  assert.equal(utf16SourceOffset(content,0,2),2);assert.equal(utf16SourceOffset(content,1,1),6);assert.equal(utf16SourceOffset(content,2,4),11);assert.equal(utf16SourceOffset(content,4,5),22);
  assert.equal(utf16SourceOffset(content,0,4),null);assert.equal(utf16SourceOffset(content,9,0),null);
  const d=decodeSourceMap(flat(segment(0,0,5,99),content));assert.equal(originalPositions(d,0,0).mappings[0].original.contentPosition,'outside-content');
});
test('nested indexed offsets apply columns only on first generated line, and known overlaps are rejected',()=>{
  const d=decodeSourceMap({version:3,sections:[{offset:{line:2,column:4},map:{version:3,sections:[{offset:{line:0,column:3},map:flat(`${segment(1,0,0,0)};${segment(2,0,0,1)}`)}]}},{offset:{line:4,column:0},map:flat()}]});
  assert.deepEqual(d.segments.map(s=>s.generated),[{line:2,column:8},{line:3,column:2},{line:4,column:0}]);assert.deepEqual(d.segments[0].sectionPath,[0,0]);
  assert.throws(()=>decodeSourceMap({version:3,sections:[{offset:{line:0,column:0},map:flat(';;AAAA')},{offset:{line:1,column:0},map:flat()}]}),/overlap/);
  assert.throws(()=>decodeSourceMap({version:3,sections:[{offset:{line:0,column:1},map:flat()},{offset:{line:0,column:1},map:flat()}]}),/increasing/);
});
test('equal indexed boundary mappings retain ambiguity and source-line verification stays bounded without false outside-content claims',()=>{
  const d=decodeSourceMap({version:3,sections:[{offset:{line:0,column:0},map:flat(segment(3,0,0,0))},{offset:{line:0,column:3},map:flat()}]});assert.equal(originalPositions(d,0,3).mappings.length,2);
  const source='\n'.repeat(200001)+'owned',bounded=originalPositions(decodeSourceMap(flat(segment(0,0,200001,0),source)),0,0).mappings[0].original;assert.equal(bounded.contentPosition,'unavailable');assert.equal(bounded.verificationReason,'source-line-index-budget');assert.equal(bounded.offset,null);
});
test('application original-coordinate verification budget produces partial coverage with explicit unknown positions',async t=>{
  const map=flat(segment(0,0,200001,0),'\n'.repeat(200001)+'owned'),root=await fixture(t,{'owned.js':'function observed() { return 42; }\n//# sourceMappingURL=owned.map','owned.map':JSON.stringify(map)}),r=(await context().call('analyze_javascript_application',{input_path:root})).normalized_result,fn=r.semantic_graph.nodes.find(n=>n.kind==='function'&&n.label==='observed');assert.equal(fn.properties.source_map_locations[0].original.contentPosition,'unavailable');assert.equal(fn.properties.source_map_locations[0].original.verificationReason,'source-line-index-budget');assert.equal(r.graph.coverage.status,'partial');assert.ok(r.limitations.some(l=>l.includes('line-index budget')));
});
test('malformed VLQ fields, deltas, source/name indices, ignore lists and resource excess fail explicitly',()=>{
  for(const mappings of ['g','!','AA','AAAAAA','AAAA,',segment(-1),segment(0,1,0,0),segment(0,0,-1,0),segment(0,0,0,0,1),'///////////A'])assert.throws(()=>decodeSourceMap(flat(mappings)),/VLQ|segment|coordinate|index/);
  assert.throws(()=>decodeSourceMap({...flat(),ignoreList:[1]}),/ignore-list/);assert.throws(()=>decodeSourceMap(flat('AAAA,AAAA'),{maxSegments:1}),/budget/);
});
test('bounded external indexed loader detects cycles, observes cancellation and counts captured UTF8 bytes',async()=>{
  const root={version:3,sections:[{offset:{line:0,column:0},url:'child.map'}]},child=Buffer.from(JSON.stringify(flat()));let reads=0;
  const loaded=await loadSourceMapSections(root,{mapPath:'root.map',readMap:async()=>{reads++;return {path:'child.map',bytes:child};}});assert.equal(reads,1);assert.equal(decodeSourceMap(loaded.map).sources[0].content,flat().sourcesContent[0]);assert.deepEqual(loaded.captures[0].bytes,child);
  await assert.rejects(()=>loadSourceMapSections(root,{mapPath:'root.map',readMap:async()=>({path:'root.map',bytes:Buffer.from(JSON.stringify(root))})}),/cycle/);
  await assert.rejects(()=>loadSourceMapSections(root,{mapPath:'root.map',maxBytes:1,readMap:async()=>({path:'child.map',bytes:child})}),/byte budget/);
  const controller=new AbortController();controller.abort();await assert.rejects(()=>loadSourceMapSections(root,{signal:controller.signal,readMap:async()=>{assert.fail('cancelled loader must not read');}}),/abort/i);
});
test('adjacent local indexed sections produce decoded AST coordinates and captured map identities from a directory and ASAR',async t=>{
  const source='export function generated() { return 42; }\n//# sourceMappingURL=maps/root.map',root=await fixture(t,{'input/entry.js':source,'input/maps/root.map':JSON.stringify({version:3,sections:[{offset:{line:0,column:0},url:'child%20owned.map'}]}),'input/maps/child owned.map':JSON.stringify(flat(segment(0,0,0,7),'export function original() { return 42; }'))}),c=context();
  const archive=path.join(root,'owned.asar');await asar.createPackage(path.join(root,'input'),archive);
  for(const input_path of [path.join(root,'input'),archive]){const r=(await c.call('analyze_javascript_application',{input_path})).normalized_result,map=r.graph.nodes.find(n=>properties(n).path==='maps/root.map'),fn=r.semantic_graph.nodes.find(n=>n.kind==='function'&&n.label==='generated');assert.equal(properties(map).mapping_count,1);assert.equal(properties(map).captured_section_maps[0].sha256,sha(await fs.readFile(path.join(root,'input/maps/child owned.map'))));assert.equal(fn.properties.source_map_locations[0].original.column,7);assert.equal(fn.properties.source_map_locations[0].original.contentPosition,'verified');assert.ok(r.graph.edges.some(e=>e.source_node_id===map.node_id&&e.properties.mapping_role==='generated-code'));}
});
test('recovery captures external section bytes, emits portable expanded map and never follows declared original names',async t=>{
  const root=await fixture(t,{'owned.map':JSON.stringify({version:3,sections:[{offset:{line:0,column:0},url:'maps/child.map'}]}),'maps/child.map':JSON.stringify({...flat(),sources:['../../never-read.js']}),'never-read.js':'THIS MUST NOT BE IMPORTED'}),r=(await context().call('recover_javascript_sources',{path:path.join(root,'owned.map'),output_directory:path.join(root,'out'),rewrite_level:'minimal'})).normalized_result;
  assert.equal(r.modules.length,1);assert.equal(await fs.readFile(r.modules[0].artifact.path,'utf8'),flat().sourcesContent[0]);const manifest=JSON.parse(await fs.readFile(r.manifest.path,'utf8'));assert.equal(manifest.captured_section_maps[0].artifact.sha256,sha(await fs.readFile(path.join(root,'maps/child.map'))));assert.equal(decodeSourceMap(JSON.parse(await fs.readFile(manifest.expanded_source_map.path,'utf8'))).segments.length,1);
});
test('external network and escaping map references produce no fabricated originals',async t=>{
  const root=await fixture(t,{'remote.map':JSON.stringify({version:3,sections:[{offset:{line:0,column:0},url:'https://owned.invalid/map'}]}),'escape.map':JSON.stringify({version:3,sections:[{offset:{line:0,column:0},url:'../escape.map'}]})}),c=context();
  for(const name of ['remote','escape']){const before=c.ledger.size;await assert.rejects(()=>c.call('recover_javascript_sources',{path:path.join(root,`${name}.map`),output_directory:path.join(root,`${name}-out`)}),/local|escape/i);assert.equal(c.ledger.size,before);}
});
test('actual Node TypeScript maps compose as indexed sections; recovery requires separately supplied owned embedded originals',async t=>{
  const originals=['export function choose(value: number): number { return value + 1; }','export const closure = (base: number) => (delta: number): number => base + delta;'],parts=originals.map((source,i)=>{const transformed=stripTypeScriptTypes(source,{mode:'transform',sourceMap:true,sourceUrl:`owned-${i}.ts`}),match=/\/\/# sourceMappingURL=(data:[^\r\n]+)/.exec(transformed);assert.ok(match,'actual transformer must emit a map');const comma=match[1].indexOf(','),payload=match[1].slice(comma+1),map=JSON.parse(Buffer.from(payload,'base64').toString('utf8')),code=transformed.slice(0,match.index);return {map,code};}),offset=parts[0].code.split(/\r\n|[\r\n\u2028\u2029]/).length-1,index={version:3,sections:[{offset:{line:0,column:0},map:parts[0].map},{offset:{line:offset,column:0},map:parts[1].map}]},decoded=decodeSourceMap(index);
  assert.ok(decoded.segments.length>2);assert.equal(decoded.sources[1].content,null);
  const root=await fixture(t,{'input/bundle.js':parts[0].code+parts[1].code+'\n//# sourceMappingURL=bundle.map','input/bundle.map':JSON.stringify(index)}),input=path.join(root,'input'),c=context(),missing=(await c.call('recover_javascript_sources',{path:path.join(input,'bundle.js'),output_directory:path.join(root,'metadata-only'),rewrite_level:'minimal'})).normalized_result;assert.equal(missing.modules.length,1);assert.ok(missing.warnings.some(w=>w.kind==='missing-source'));
  for(const [i,section]of index.sections.entries())section.map.sourcesContent=[originals[i]];await fs.writeFile(path.join(input,'bundle.map'),JSON.stringify(index));
  const application=(await c.call('analyze_javascript_application',{input_path:input})).normalized_result;assert.equal(application.statistics.parse_failures,0);assert.equal(application.graph.coverage.status,'complete');assert.ok(application.semantic_graph.nodes.some(n=>n.kind==='function'&&n.properties.source_map_locations?.some(m=>m.source==='owned-1.ts'&&m.original?.contentPosition==='verified')));
  const recovered=(await c.call('recover_javascript_sources',{path:path.join(input,'bundle.js'),output_directory:path.join(root,'recovered'),rewrite_level:'minimal'})).normalized_result;assert.equal(recovered.runtime_equivalence,'unknown');for(const source of originals)assert.ok(recovered.modules.some(m=>m.provenance.original_sha256===sha(source)));assert.equal(recovered.modules.length,3);
});
