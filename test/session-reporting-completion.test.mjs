import test from 'node:test';
import assert from 'node:assert/strict';
import { engine } from '../lib/engine.mjs';
import { digest } from '../lib/core.mjs';
test('session reports measured operation lifecycle, failures and successful retry through existing schemas',async()=>{
 const c=await engine({config:{}});let release,entered;
 const enteredPromise=new Promise(resolve=>entered=resolve);
 const initial=(await c.call('binary_session')).result;assert.equal(initial.capabilities.length,139);assert.equal(initial.analysis_activity.status,'not_observed');assert.equal(initial.provider_operation_health.state,'not_started');assert.equal(initial.analysis_run,null);
 const original=c.handlers.list_documents;
 // A real Context.call is held at a controlled owned handler boundary; no vendor launch is claimed.
 c.handlers.binary_overview=async()=>{entered();await new Promise(resolve=>release=resolve);throw new Error('Owned controlled provider failure');};
 const pending=c.call('binary_overview');await enteredPromise;
 const busy=(await c.call('binary_session')).result;assert.equal(busy.analysis_activity.status,'busy');assert.equal(busy.provider_operation_health.state,'busy');assert.equal(busy.provider_operation_health.requests[0].operation,'binary_overview');assert.ok(busy.analysis_run.run_id);assert.deepEqual(busy.analysis_run.process_lineage,{status:'not_observed'});
 release();await assert.rejects(pending,/Owned controlled/);
 const failed=(await c.call('binary_session')).result;assert.equal(failed.provider_operation_health.state,'unknown');assert.equal(failed.provider_operation_health.retry_action,'retry');assert.equal(failed.analysis_activity.status,'idle');assert.equal(failed.analysis_activity.providers[0].active,null);
 c.handlers.binary_overview=async()=>c.evidence('binary_overview',{}, {document:'owned',segments:[],segment_count:0,procedure_count:0,string_count:0});await c.call('binary_overview');
 const recovered=(await c.call('binary_session')).result;assert.equal(recovered.provider_operation_health.state,'idle');assert.equal(recovered.analysis_run.run_id,busy.analysis_run.run_id);c.handlers.list_documents=original;
});
test('provider binding requires an observed model version and binds exact selected bytes',async()=>{
 const c=await engine({config:{}});c.target={path:'owned',format:'elf',kind:'executable',sha256:digest('owned'),architecture:'x86_64',provider_id:'ghidra'};c.nativeSession={model:null};
 assert.equal((await c.call('binary_session')).result.analysis_provider_binding,null);
 c.nativeSession.model={provider:'ghidra',provider_version:'owned-contract-fixture',functions:[]};
 const first=(await c.call('binary_session')).result;assert.equal(first.analysis_provider_binding.provider.version,'owned-contract-fixture');assert.equal(first.analysis_provider_binding.analysis_profile.parameters.source_sha256,c.target.sha256);assert.ok(first.capabilities.some(c=>c.available));
 c.nativeSession.model.provider_version=null;assert.equal((await c.call('binary_session')).result.analysis_provider_binding,null,'Unknown version must remain unknown');
});

test('independent activity does not inherit an unrelated selected native provider',async()=>{
 const c=await engine({config:{}});c.target={path:'owned',format:'elf',kind:'executable',sha256:digest('owned'),architecture:'x86_64',provider_id:'ghidra'};c.nativeSession={model:{provider:'ghidra',provider_version:'owned-contract-fixture',functions:[]}};
 let entered,release;const ready=new Promise(resolve=>entered=resolve);c.handlers.inspect_plist=async()=>{entered();await new Promise(resolve=>release=resolve);throw new Error('owned independent stop');};const pending=c.call('inspect_plist',{path:'owned.plist'});await ready;
 const active=(await c.call('binary_session')).result.analysis_activity.providers;assert.equal(active.length,1);assert.equal(active[0].provider.id,'real-independent');assert.equal(active[0].provider.version,null);release();await assert.rejects(pending,/owned independent stop/);
 assert.equal((await c.call('binary_session')).result.analysis_activity.providers[0].provider.id,'real-independent');
});
