import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {engine} from '../lib/engine.mjs';
import {zipFixture} from './artifact-fixtures.mjs';
async function owned(t){const root=await fs.mkdtemp(path.join(fileURLToPath(new URL('.',import.meta.url)),'artifact-binding-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const source=path.join(root,'owned.jar'),original=await zipFixture({'owned.txt':'first owned bytes'}),changed=await zipFixture({'owned.txt':'different owned bytes'});await fs.writeFile(source,original);const c=await engine({config:{temporaryRoot:root}});await c.call('open_binary',{path:source});t.after(()=>c.target?c.call('close_binary',{}):undefined);await c.evidence('owned_prior_marker',{fixture_only:true},{marker:'preserve'},{subject:null});return {root,source,original,changed,c};}
for(const operation of ['inspect_artifact','extract_artifact'])test(`${operation} rejects changed selected bytes without relabelling parsed source or publishing partial evidence`,async t=>{
 const {root,source,changed,c}=await owned(t),prior=structuredClone([...c.ledger]),read=c.read.bind(c);let reads=0;c.read=async(file,options)=>{const bytes=await read(file,options);if(file===source&&++reads===1)await fs.writeFile(source,changed);return bytes;};
 await assert.rejects(c.call(operation,{}),/changed during archive analysis/);assert.deepEqual([...c.ledger],prior);assert.deepEqual((await fs.readdir(root)).filter(n=>n.startsWith('real-extract-')),[]);assert.deepEqual(await fs.readFile(source),changed);
});
test('extraction removes only its owned output after a source change detected following file publication',async t=>{
 const {root,source,changed,c}=await owned(t),prior=structuredClone([...c.ledger]),read=c.read.bind(c);let reads=0,outputsObserved=false;c.read=async(file,options)=>{if(file===source&&++reads===3){outputsObserved=(await fs.readdir(root)).some(n=>n.startsWith('real-extract-'));await fs.writeFile(source,changed);}return read(file,options);};
 await assert.rejects(c.call('extract_artifact',{}),/changed during archive analysis/);assert.equal(outputsObserved,true);assert.deepEqual([...c.ledger],prior);assert.deepEqual((await fs.readdir(root)).filter(n=>n.startsWith('real-extract-')),[]);assert.deepEqual(await fs.readFile(source),changed);
});
test('generic inventory rejects a selected-session replacement across its initial read',async t=>{
 const {source,c}=await owned(t),prior=structuredClone([...c.ledger]),read=c.read.bind(c);let once=false;c.read=async(file,options)=>{const bytes=await read(file,options);if(file===source&&!once){once=true;c.target={...c.target};}return bytes;};await assert.rejects(c.call('inspect_artifact',{}),/session changed/);assert.deepEqual([...c.ledger],prior);
});

for(const rejection of ['cancellation','output-contract'])test(`extraction rolls back its owned output and evidence after late ${rejection}, then retries`,async t=>{
 const {root,source,original,c}=await owned(t),prior=structuredClone([...c.ledger]),history=c.history.length,evidence=c.evidence.bind(c),controller=new AbortController();let rejectedRoot;
 c.signal=controller.signal;
 c.evidence=async(operation,...args)=>{const envelope=await evidence(operation,...args);if(operation==='extract_artifact'){rejectedRoot=envelope.normalized_result.output_root;if(rejection==='cancellation')controller.abort(new Error('owned late cancellation'));else envelope.normalized_result.containment_verified='invalid-owned-value';}return envelope;};
 await assert.rejects(c.call('extract_artifact',{}),cause=>cause.code===(rejection==='cancellation'?'cancelled':'contract'));
 assert.ok(rejectedRoot);await assert.rejects(fs.lstat(rejectedRoot),{code:'ENOENT'});assert.deepEqual([...c.ledger],prior);assert.equal(c.history.length,history);assert.deepEqual(await fs.readFile(source),original);
 c.signal=undefined;c.evidence=evidence;const retry=await c.call('extract_artifact',{}),output=retry.normalized_result.output_root;
 assert.equal(c.ledger.size,prior.length+1);assert.equal(c.ledger.has(retry.evidence_id),true);assert.equal(path.dirname(output),root);assert.equal(await fs.readFile(path.join(output,'owned.txt'),'utf8'),'first owned bytes');assert.deepEqual(await fs.readFile(source),original);await fs.rm(output,{recursive:true,force:true});
});
