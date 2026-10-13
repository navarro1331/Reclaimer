import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectRuntimeExecutable,runtimeDisposition,applyRuntimePrerequisite} from './runtime-provider-prerequisites.mjs';
const absent=join(fileURLToPath(new URL('.',import.meta.url)),'runtime-prerequisite-absent-fixture','missing-executable');
test('a caller-selected missing executable cannot fall through to another available runtime',async()=>{
 const record=await inspectRuntimeExecutable({provider:'owned-node-prerequisite',envName:'REAL_TEST_OWNED',defaults:[process.execPath]},{env:{REAL_TEST_OWNED:absent}});assert.equal(record.available,false);assert.equal(record.source,'configured');assert.equal(record.reason,'executable-missing');assert.equal(record.executable,null);
});
test('prerequisite discovery reports actual current Node file presence without executing a substitute',async()=>{
 const record=await inspectRuntimeExecutable({provider:'current-Node-metadata',defaults:[process.execPath]},{env:{}});assert.equal(record.available,true);assert.equal(record.executable,process.execPath);assert.equal(runtimeDisposition(record,{env:{REAL_RUN_RUNTIME_VARIATIONS:'1'}}),'run');
});
test('normal absence skips while explicitly required runtime absence fails with a recorded reason',async t=>{
 const record=await inspectRuntimeExecutable({provider:'owned-absent-fixture',defaults:[absent]},{env:{}});assert.equal(runtimeDisposition(record,{env:{}}),'skip');assert.equal(runtimeDisposition(record,{env:{REAL_RUN_RUNTIME_VARIATIONS:'1'}}),'fail');assert.throws(()=>applyRuntimePrerequisite(t,record,{env:{REAL_RUN_RUNTIME_VARIATIONS:'1'}}),e=>e.code==='RUNTIME_PREREQUISITE_UNAVAILABLE');
});
test('unsupported fixture platforms remain explicit and cannot become a strict successful skip',async()=>{
 const record=await inspectRuntimeExecutable({provider:'owned-platform-fixture',platforms:['unsupported-owned-platform'],defaults:[process.execPath]},{env:{}});assert.equal(record.reason,'fixture-platform-unavailable');assert.equal(record.available,false);assert.equal(runtimeDisposition(record,{env:{}}),'skip');assert.equal(runtimeDisposition(record,{env:{REAL_RUN_RUNTIME_VARIATIONS:'1'}}),'fail');
});
