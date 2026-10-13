import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Context,digest,identifier } from '../lib/core.mjs';
import { handlers as comparisons } from '../lib/comparisons.mjs';
import { handlers as verification } from '../lib/verification.mjs';
import { processHandlers } from '../lib/process-capture.mjs';

const testRoot=path.dirname(fileURLToPath(import.meta.url));
function context(config={}){const ctx=new Context({config});ctx.handlers={...comparisons,...verification,...processHandlers};const invoke=ctx.call.bind(ctx);ctx.call=async(...args)=>{try{return await invoke(...args);}catch(error){if(error.details?.validation_errors)error.message+=` ${JSON.stringify(error.details.validation_errors)}`;throw error;}};return ctx;}
async function temporary(t){const root=await fs.mkdtemp(path.join(testRoot,'comparison-temp-'));t.after(async()=>{assert.ok(path.resolve(root).startsWith(`${testRoot}${path.sep}comparison-temp-`));await fs.rm(root,{recursive:true,force:true});});return root;}
async function artifactEvidence(ctx,entries,complete=true){const artifacts=entries.map(([p,text])=>({artifact_id:identifier('art',text),digest:text===null?{}:{sha256:digest(text)},format:'javascript',kind:'file',size:text?.length??0})),occurrences=entries.map(([p],i)=>({occurrence_id:identifier('occ',p),logical_path:p,artifact_id:artifacts[i].artifact_id})),manifest={manifest_id:identifier('agm',{entries,complete}),artifacts,occurrences,coverage:{status:complete?'complete':'partial'}};return ctx.evidence('inventory_artifact',{}, {manifest},{confidence:'observed',limitations:complete?[]:['Synthetic inventory intentionally omits some files']});}
async function functionEvidence(ctx,name,pseudocode,options={}){return ctx.evidence('synthetic_function_analysis',{}, {procedure:{address:'0x1000',name},pseudocode,...options},{confidence:'derived',subject:{name:'fresh.bin',digest:{sha256:digest(pseudocode??name)},format:'pe',architecture:'x86_64',local_path:'fresh.bin'}});}
const claim=(kind,dimension,evidence,title='Fresh equivalence claim')=>({claim_id:'fresh_claim',title,kind,dimension,comparison_evidence_id:evidence.evidence_id});
test('artifact comparison reports real retained digest change and linked evidence',async()=> {
  const ctx=context(),left=await artifactEvidence(ctx,[['entry.js','alpha'],['keep.js','same']]),right=await artifactEvidence(ctx,[['entry.js','beta'],['keep.js','same']]),result=await ctx.call('compare_artifacts',{left,right});
  assert.equal(result.normalized_result.status,'changed');assert.equal(result.normalized_result.summary.changed,1);assert.equal(result.normalized_result.summary.unchanged,1);assert.ok(result.normalized_result.changes[0].dimensions.includes('content'));assert.deepEqual(result.evidence_links,[left.evidence_id,right.evidence_id]);
});
test('artifact absence in partial inventory and missing content digest remain unknown',async()=> {
  const ctx=context(),left=await artifactEvidence(ctx,[['entry.js','alpha']]),partial=await artifactEvidence(ctx,[],false),result=await ctx.call('compare_artifacts',{left,right:partial});assert.equal(result.normalized_result.status,'unknown');assert.equal(result.normalized_result.summary.removed,0);
  const missing=await artifactEvidence(ctx,[['entry.js',null]]),other=await artifactEvidence(ctx,[['entry.js',null]]),unknown=await ctx.call('compare_artifacts',{left:missing,right:other});assert.equal(unknown.normalized_result.summary.unknown,1);
});
test('function dimension changes are static candidates and name mismatch cannot become equality',async()=> {
  const ctx=context(),left=await functionEvidence(ctx,'FreshEntry','return 1;'),right=await functionEvidence(ctx,'FreshEntry','return 2;'),changed=await ctx.call('compare_functions',{left,right});
  assert.equal(changed.normalized_result.dimensions.find(d=>d.dimension==='pseudocode').status,'changed');assert.equal(changed.normalized_result.dimensions.find(d=>d.dimension==='assembly').status,'unknown');
  const behavior=await ctx.call('find_changed_behavior',{comparisons:[changed]});assert.equal(behavior.normalized_result.summary.observed_changes,0);assert.ok(behavior.normalized_result.summary.static_candidates>0);assert.equal(behavior.normalized_result.behavior_status,'unknown');
  const mismatch=await ctx.call('compare_functions',{left,right:await functionEvidence(ctx,'DifferentEntry','return 1;')});assert.equal(mismatch.normalized_result.dimensions.find(d=>d.dimension==='pseudocode').status,'unknown');
});
test('name references are included and an explicitly unavailable body cannot prove pseudocode equality',async()=> {
  const ctx=context(),left=await functionEvidence(ctx,'FreshEntry','return 1;',{referenced_strings:[],referenced_names:[{address:'0x3000',value:'alpha',source_address:'0x1000'}]}),right=await functionEvidence(ctx,'FreshEntry','return 1;',{referenced_strings:[],referenced_names:[{address:'0x3000',value:'beta',source_address:'0x1000'}]}),comparison=await ctx.call('compare_functions',{left,right});assert.equal(comparison.normalized_result.dimensions.find(d=>d.dimension==='strings_names').status,'changed');
  const unavailable=await functionEvidence(ctx,'FreshEntry','',{procedure:{address:'0x1000',name:'FreshEntry',body:{available:false,reason:'Synthetic provider has no body bytes'}},assembly:[],basic_blocks:[]}),unknown=await ctx.call('compare_functions',{left:unavailable,right:unavailable});assert.equal(unknown.normalized_result.dimensions.find(d=>d.dimension==='pseudocode').status,'unknown');assert.equal(unknown.normalized_result.dimensions.find(d=>d.dimension==='assembly').status,'unknown');
});
test('call path resolves only supplied edges and incomplete no-match stays unknown',async()=> {
  const ctx=context(),first=await ctx.evidence('synthetic_function_analysis',{}, {procedure:{name:'Start',address:'0x1000'},callees:[{address:'0x2000'}],coverage:{status:'complete'}}),second=await ctx.evidence('synthetic_function_analysis',{}, {procedure:{name:'Middle',address:'0x2000'},callees:[{address:'0x3000'}],coverage:{status:'complete'}}),third=await ctx.evidence('synthetic_function_analysis',{}, {procedure:{name:'Goal',address:'0x3000'},callees:[],coverage:{status:'complete'}});
  const found=await ctx.call('build_call_path',{functions:[first,second,third],start:{address:'0x1000'},goal:{address:'0x3000'}});assert.equal(found.normalized_result.status,'found');assert.equal(found.normalized_result.shortest_hops,2);assert.deepEqual(found.normalized_result.paths[0].nodes.map(n=>n.address),['0x1000','0x2000','0x3000']);
  const unknown=await ctx.call('build_call_path',{functions:[first],start:{address:'0x1000'},goal:{address:'0x3000'}});assert.equal(unknown.normalized_result.status,'unknown');
});
test('structural verification binds both retained source records and the selected dimension',async()=> {
  const ctx=context(),left=await functionEvidence(ctx,'FreshEntry','return 1;'),right=await functionEvidence(ctx,'FreshEntry','return 1;'),comparison=await ctx.call('compare_functions',{left,right}),verified=await ctx.call('verify_reconstruction',{specification:{name:'Fresh selected dimension',claims:[claim('structural-function','pseudocode',comparison)]}});
  assert.equal(verified.normalized_result.status,'pass');assert.deepEqual(new Set(verified.evidence_links),new Set([left.evidence_id,right.evidence_id,comparison.evidence_id]));
  ctx.ledger.delete(left.evidence_id);await assert.rejects(()=>ctx.call('verify_reconstruction',{specification:{name:'Missing retained source',claims:[claim('structural-function','pseudocode',comparison)]}}),/retained/);
});
test('genuine PTY terminal comparison permits narrow verification without asserting whole-process equivalence',async t=> {
  const root=await temporary(t),script=path.join(root,'fresh-process.cjs');await fs.writeFile(script,'console.log("fresh alpha");');const ctx=context({temporaryDirectory:root}),args={executable:process.execPath,arguments:[script],working_directory:root,environment:{},filesystem_observation_paths:[],timeout_ms:5000,settle_ms:10};
  const left=await ctx.call('capture_process_scenario',args),right=await ctx.call('capture_process_scenario',args),same=await ctx.call('compare_process_captures',{left,right});assert.equal(same.normalized_result.terminal,'unchanged');assert.equal(same.normalized_result.process,'unknown');
  const narrow=await ctx.call('verify_reconstruction',{specification:{name:'Fresh terminal only',claims:[claim('behavioral','terminal',same)]}});assert.equal(narrow.normalized_result.status,'pass');
  await fs.writeFile(script,'console.log("fresh beta");');const changedCapture=await ctx.call('capture_process_scenario',args),changed=await ctx.call('compare_process_captures',{left,right:changedCapture});assert.equal(changed.normalized_result.terminal,'changed');
  const failed=await ctx.call('verify_reconstruction',{specification:{name:'Changed terminal',claims:[claim('behavioral','terminal',changed)]}});assert.equal(failed.normalized_result.status,'fail');
});
test('static-runtime correlation reads the actual process wire dimension and remains a hypothesis',async()=> {
  const ctx=context(),left=await functionEvidence(ctx,'FreshEntry','return 1;'),right=await functionEvidence(ctx,'FreshEntry','return 2;'),staticComparison=await ctx.call('compare_functions',{left,right});
  const capture=text=>({manifest:{comparison_contract_sha256:digest('fresh-contract')},frames:[{data:text}],interaction_events:[],exit:{code:0,signal:null,reason:'exited'},filesystem_effects:[],process_samples:[],truncated:false,truncation_details:{process:{sampling_partial:true}}});
  const before=await ctx.evidence('synthetic_process_observation',{},capture('alpha'),{authority:'controlled-replay',confidence:'observed'}),after=await ctx.evidence('synthetic_process_observation',{},capture('beta'),{authority:'controlled-replay',confidence:'observed'}),runtimeComparison=await ctx.call('compare_process_captures',{left:before,right:after});
  const result=await ctx.call('correlate_static_and_runtime',{static_comparisons:[staticComparison],runtime_comparisons:[runtimeComparison],mappings:[{static:{comparison_evidence_id:staticComparison.evidence_id,selector:{kind:'function',dimension:'pseudocode'}},runtime:{comparison_evidence_id:runtimeComparison.evidence_id,dimension:'terminal'},side_alignment:'left_to_left',hypothesis:{statement:'Fresh return-value change may accompany terminal change',expected_pattern:'cochanged'}}]});assert.equal(result.normalized_result.correlations.items[0].observed_pattern,'cochanged');assert.equal(result.normalized_result.correlations.items[0].classification,'hypothesis');assert.equal(result.normalized_result.status,'correlated');
});
