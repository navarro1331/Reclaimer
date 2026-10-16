import test from 'node:test';
import assert from 'node:assert/strict';
import { Context, digest } from '../lib/core.mjs';
import { processHandlers } from '../lib/process-capture.mjs';

function capture(values=['a','b']) {
 const frames=values.map((data,index)=>({sequence:index+1,at_ms:index+1,data}));
 return {evidence_id:'ev_'+digest(values),subject:null,provider:{id:'owned-fixture',name:'Authored journal fixture',version:'1'},analysis_profile:null,predicate_type:'owned-fixture',operation:'owned_fixture',parameters:{},raw_result:null,confidence:'observed',authority:'controlled-replay',environment:null,limitations:['Synthetic owned capture; no target execution claimed'],locations:[],evidence_links:[],normalized_result:{manifest:{comparison_contract_sha256:digest('owned'),completed_at:new Date().toISOString()},frames,rendered_frames:[],interaction_events:[],process_samples:[],filesystem_checkpoints:[],filesystem_effects:[],exit:{code:0,signal:null,reason:'exited'},event_journal:frames.map((_,index)=>({collection:'frames',index,capture_order:index})),truncated:false}};
}
const events=['a','b'].map(id=>({id,source:'terminal_raw',exact:{data:id},ignore_fields:['sequence','at_ms']}));
const finite=(variants=[{id:'ab',trace:['a','b']}])=>({events:structuredClone(events),language:{kind:'finite_traces',variants}});
async function compare(left,right,spec,extra={}) {const c=new Context();c.handlers=processHandlers;return (await c.call('compare_process_captures',{left,right,...(spec?{trace_spec:spec}:{}),...extra})).normalized_result;}
test('finite traces affect actual schema-validated comparisons and preserve inputs',async()=>{
 const left=capture(),right=capture(),before=structuredClone([left,right]);const pass=await compare(left,right,finite());assert.equal(pass.trace.verdict,'equivalent');assert.equal(pass.trace.left.matched_variant,'ab');
 const fail=await compare(capture(['a']),capture(['a']),finite());assert.equal(fail.status,'contradiction');assert.equal(fail.trace.verdict,'nonconforming');assert.equal(fail.trace.diagnostic.kind,'cardinality');assert.deepEqual([left,right],before);
 const different=await compare(capture(),capture(['b','a']),finite([{id:'ab',trace:['a','b']},{id:'ba',trace:['b','a']}]));assert.equal(different.trace.verdict,'different');
});
test('unordered finite buckets and partial order distinguish allowed and forbidden scheduling',async()=>{
 assert.equal((await compare(capture(),capture(['b','a']),finite([{id:'both',trace:[{unordered:['a','b']}]}]))).trace.verdict,'equivalent');
 const spec={events,language:{kind:'partial_order',happens_before:[{before:'a',after:'b'}],not_before:[{event:'b',anchor:'a'}],prefix:['a'],suffix:['b'],unordered_groups:[{events:['a','b']}]}};
 assert.equal((await compare(capture(),capture(),spec)).trace.verdict,'equivalent');assert.equal((await compare(capture(),capture(['b','a']),spec)).trace.diagnostic.kind,'edge');
});
test('trace predicates implement cardinality, optional events, prefix and suffix',async()=>{
 const spec=finite([{id:'aab',trace:['a','a','b']}]);spec.events[0].cardinality={kind:'exact',count:2};assert.equal((await compare(capture(['a','a','b']),capture(['a','a','b']),spec)).trace.verdict,'equivalent');
 const partial={events:structuredClone(events),language:{kind:'partial_order',prefix:['b']}};assert.equal((await compare(capture(),capture(),partial)).trace.diagnostic.kind,'prefix');partial.language={kind:'partial_order',suffix:['a']};assert.equal((await compare(capture(),capture(),partial)).trace.diagnostic.kind,'suffix');
 spec.events[0].cardinality={kind:'optional'};spec.language.variants=[{id:'b',trace:['b']}];assert.equal((await compare(capture(['b']),capture(['b']),spec)).trace.verdict,'equivalent');
});
test('missing, ambiguous and truncated journals preserve unknowns',async()=>{
 const missing=capture();delete missing.normalized_result.event_journal;assert.equal((await compare(missing,capture(),finite())).trace.verdict,'unknown');
 const incomplete=capture();incomplete.normalized_result.event_journal.pop();assert.equal((await compare(incomplete,capture(),finite())).trace.diagnostic.kind,'journal');
 const duplicate=finite();duplicate.events.push({...duplicate.events[0],id:'other'});assert.equal((await compare(capture(),capture(),duplicate)).trace.diagnostic.kind,'predicate');
 const truncated=capture();truncated.normalized_result.truncated=true;assert.equal((await compare(truncated,capture(),finite())).trace.verdict,'unknown');
 const lifecycle=finite();lifecycle.events[0].source='lifecycle';assert.equal((await compare(capture(),capture(),lifecycle)).trace.verdict,'unknown','An uncaptured source cannot establish event absence');
});
test('freshness is enforced without treating a stale capture as equality',async()=>{
 const stale=capture();stale.normalized_result.manifest.completed_at='2020-01-01T00:00:00.000Z';assert.equal((await compare(stale,stale)).status,'unchanged');assert.equal((await compare(stale,stale,finite(),{max_capture_age_ms:1})).status,'unknown');assert.equal((await compare(capture(),capture(),finite(),{max_capture_age_ms:60_000})).status,'unchanged');
 const future=capture();future.normalized_result.manifest.completed_at='2999-01-01T00:00:00.000Z';assert.equal((await compare(future,future,null,{max_capture_age_ms:60_000})).status,'unknown');
});
test('invalid trace references, reversed ranges and cancellation fail explicitly',async()=>{
 await assert.rejects(compare(capture(),capture(),finite([{id:'bad',trace:['absent']}])) ,{code:'input'});
 const spec=finite();spec.events[0].cardinality={kind:'range',min:3,max:1};await assert.rejects(compare(capture(),capture(),spec),{code:'input'});
 const controller=new AbortController();controller.abort();const c=new Context({signal:controller.signal});c.handlers=processHandlers;await assert.rejects(c.call('compare_process_captures',{left:capture(),right:capture(),trace_spec:finite()}),{code:'cancelled'});
});
