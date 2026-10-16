import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {engine} from '../lib/engine.mjs';
import {zipFixture} from './artifact-fixtures.mjs';
import {jvmClassFixture} from './artifact-format-completion-fixtures.mjs';
import {managedGenericFixture} from './artifact-gaps-fixtures.mjs';

for(const kind of ['JVM','managed'])for(const timing of ['initial-source-swap','late-source-swap','late-cancel','same-byte-session-replacement'])test(`${kind} explicit source binding rejects ${timing} without partial evidence`,async t=>{
 const base=fileURLToPath(new URL('.',import.meta.url)),root=await fs.mkdtemp(path.join(base,'format-source-owned-'));t.after(async()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(base));assert.ok(path.basename(root).startsWith('format-source-owned-'));await fs.rm(root,{recursive:true,force:true});});
 const bytes=kind==='JVM'?await zipFixture({'owned/Specimen.class':jvmClassFixture().bytes}):managedGenericFixture().bytes,replacement=kind==='JVM'?await zipFixture({'owned/Specimen.class':jvmClassFixture({major:55}).bytes}):managedGenericFixture({resources:true}).bytes,file=path.join(root,kind==='JVM'?'owned.jar':'owned.dll'),ctx=await engine({config:{temporaryRoot:root}}),operation=kind==='JVM'?'inspect_android_class':'inspect_managed_members',args=kind==='JVM'?{path:file,class_name:'owned.Specimen'}:{path:file};await fs.writeFile(file,bytes);if(timing==='same-byte-session-replacement')await ctx.call('open_binary',{path:file});t.after(()=>ctx.target?ctx.call('close_binary',{}):undefined);await ctx.evidence('owned-format-source-prior',{}, {owned:true},{subject:null});const prior=structuredClone([...ctx.ledger]),read=ctx.read.bind(ctx),evidence=ctx.evidence.bind(ctx),controller=new AbortController(),reason=Object.freeze(new Error('Owned source binding cancellation'));let acted=false;ctx.signal=controller.signal;
 ctx.read=async(input,options)=>{const result=await read(input,options);if(input===file&&!acted&&['initial-source-swap','same-byte-session-replacement'].includes(timing)){acted=true;if(timing==='initial-source-swap')await fs.writeFile(file,replacement);else ctx.target={...ctx.target};}return result;};
 ctx.evidence=async(op,...rest)=>{const result=await evidence(op,...rest);if(op===operation&&!acted){acted=true;if(timing==='late-source-swap')await fs.writeFile(file,replacement);else if(timing==='late-cancel')controller.abort(reason);}return result;};
 await assert.rejects(ctx.call(operation,args),error=>{if(timing==='late-cancel')assert.equal(error,reason);else assert.match(error.message,/changed/);return true;});assert.equal(acted,true);assert.deepEqual([...ctx.ledger],prior);assert.deepEqual(await fs.readFile(file),timing.endsWith('source-swap')?replacement:bytes);ctx.signal=undefined;
});
