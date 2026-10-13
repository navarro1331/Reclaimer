import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { engine } from '../lib/engine.mjs';
import { digest } from '../lib/core.mjs';
import { elfFixture } from './artifact-fixtures.mjs';
import { checkBundle } from '../lib/evidence.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
async function fixture(t){const folder=await mkdtemp(join(tmpdir(),'real-owned-producer-'));t.after(async()=>{assert.ok(resolve(folder).startsWith(resolve(tmpdir())+sep+'real-owned-producer-'));await rm(folder,{recursive:true,force:true});});return folder;}

test('actual owned Node inspector observations reconcile with the retained static file via explicit path mapping',async t=>{
 const folder=await fixture(t),application=join(folder,'application');await mkdir(application);
 const file=join(application,'owned-runtime.cjs'),ready=join(folder,'ready.txt'),source='require("node:fs").writeFileSync(process.argv[2],"ready"); function ownedSum(a,b){return a+b;} setInterval(()=>ownedSum(4,3),100);\n';await writeFile(file,source);
 const child=spawn(process.execPath,['--inspect=127.0.0.1:0',file,ready],{shell:false,windowsHide:true,env:process.platform==='win32'?{SystemRoot:process.env.SystemRoot??'C:\\Windows'}:{},stdio:['ignore','ignore','pipe']});
 const exited=once(child,'close');
 try{
  const endpoint=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(new Error('Owned Node inspector did not report its endpoint')),10000);const finish=value=>{clearTimeout(timer);resolve(value);};child.stderr.on('data',chunk=>{text+=chunk;assert.ok(text.length<16384);const match=text.match(/ws:\/\/(127\.0\.0\.1:\d+)\//);if(match)finish('http://'+match[1]);});child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);reject(new Error('Owned Node inspector exited before discovery: '+code));});});
  const deadline=Date.now()+10000;while(true){try{assert.equal(await readFile(ready,'utf8'),'ready');break;}catch(error){if(Date.now()>deadline)throw error;await new Promise(resolve=>setTimeout(resolve,25));}}
  const ctx=await engine({config:{temporaryDirectory:folder}}),analysis=await ctx.call('analyze_javascript_application',{input_path:application}),targets=await ctx.call('list_javascript_runtime_targets',{inspector_endpoint:endpoint});
  assert.equal(targets.normalized_result.targets.length,1);
  const runtime=await ctx.call('observe_javascript_runtime',{inspector_endpoint:endpoint,target_id:targets.normalized_result.targets[0].target_id,observation_ms:100,runtime_kind:'node'});
  const loaded=runtime.normalized_result.scripts.items.find(item=>item.location?.kind==='file'&&item.location.file_path===file);assert.ok(loaded,'The real producer must retain the owned script location');
  const reconciled=await ctx.call('reconcile_javascript_runtime',{static_layers:[{analysis,runtime_mappings:[{kind:'file-root',root:application,artifact_prefix:''}]}],runtime_observations:[runtime]});
  const runtimeNode=reconciled.normalized_result.graph.nodes.find(node=>node.identity?.runtime_key===loaded.script_key);assert.ok(runtimeNode);
  const matched=reconciled.normalized_result.reconciliations.find(item=>item.runtime_node_id===runtimeNode.node_id);assert.ok(matched);assert.equal(matched.status,'matched');assert.equal(matched.basis,'artifact-path');
  assert.equal(runtime.normalized_result.target.runtime_kind_authority,'caller-declared-unverified');assert.ok(runtime.normalized_result.unknowns.some(value=>value.includes('executed')));
  assert.equal(digest(await readFile(file)),digest(source));checkBundle((await ctx.call('get_evidence_bundle',{})).result);
 }finally{child.kill();await exited;}
});

test('official stdio MCP client retains an actual parser record through export, import, view and bundle comparison',async t=>{
 const folder=await fixture(t),file=join(folder,'owned-protocol.elf'),bundlePath=join(folder,'evidence.json');await writeFile(file,elfFixture());
 const client=new Client({name:'owned-evidence-integration',version:'1'}),transport=new StdioClientTransport({command:process.execPath,args:[join(root,'scripts','real.mjs'),'mcp'],cwd:root,stderr:'pipe'});
 async function call(name,args={}){const out=await client.callTool({name,arguments:args},{timeout:30000});assert.notEqual(out.isError,true,JSON.stringify(out.structuredContent));return out.structuredContent;}
 try{
  await client.connect(transport);const parsed=await call('inspect_binary_layout',{path:file});assert.equal(parsed.subject.digest.sha256,digest(await readFile(file)));
  const inspected=await call('inspect_analysis_view',{source:{kind:'retained-evidence',evidence_id:parsed.evidence_id},view:{kind:'summary'}});assert.equal(inspected.normalized_result.parent_evidence_id,parsed.evidence_id);assert.deepEqual(inspected.normalized_result.summary.entry,parsed.normalized_result.entry_point);
  const exported=await call('export_evidence_bundle',{path:bundlePath});assert.equal(exported.result.records,2);const persisted=checkBundle(JSON.parse(await readFile(bundlePath,'utf8')));assert.equal(persisted.records.length,2);
  const imported=await call('import_evidence_bundle',{path:bundlePath});assert.equal(imported.result.imported,0);
  const compared=await call('compare_bundles',{left_bundle_path:bundlePath,right_bundle_path:bundlePath});assert.equal(compared.normalized_result.status,'unchanged');assert.equal(compared.normalized_result.summary.records_unchanged,2);
  const retained=(await call('get_evidence_bundle')).result;checkBundle(retained);assert.ok(retained.records.some(record=>record.evidence_id===parsed.evidence_id));
 }finally{await client.close();await transport.close();}
});
