import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm,access} from 'node:fs/promises';
import {join,dirname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {engine} from '../lib/engine.mjs';
import {digest} from '../lib/core.mjs';
import {elfFixture} from './artifact-fixtures.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),testRoot=join(root,'test'),configPath=join(root,'config/local-swift.json'),sourcePath=join(root,'test/fixtures/swift-branch.swift'),execute=promisify(execFile);
let available=false,selected;
try{selected=JSON.parse(await readFile(configPath,'utf8'));await access(selected.swiftDemangle);available=true;}catch{}
const required=process.env.REAL_RUN_SWIFT_VARIATIONS==='1';
let shared,fixtureFolder,receipt={verified_at:null,source_preserved:false,compiler:{},provider:{},observations:[],limitations:['Compiler and demangler observations do not execute the compiled Swift functions or establish full Swift metadata, macro, version or platform coverage.','Cancellation is observed after a real completed symbol invocation, not interruption of a running Swift child.','The CLI uses an owned ELF only for its legacy required target selection; symbol membership in that ELF is not claimed.']};
async function prepare(t){
 if(shared)return shared;
 assert.equal(available,true,'Live Swift fixtures require the recorded private toolchain configuration');
 const folder=fixtureFolder=await mkdtemp(join(testRoot,'runtime-swift-'));
 const source=await readFile(sourcePath),exe=selected.swiftDemangle,frontend=join(dirname(exe),'swift-frontend.exe'),runtime=resolve(dirname(exe),'../../../..'),sdk=join(runtime,'Platforms/6.1.3/Windows.platform/Developer/SDKs/Windows.sdk'),irPath=join(folder,'owned.ll');
 const build=await execute(frontend,['-emit-ir','-parse-as-library','-module-name','RealSwiftFixture','-sdk',sdk,'-o',irPath,sourcePath],{cwd:root,shell:false,windowsHide:true,timeout:60000,maxBuffer:4*1024*1024});
 assert.equal(build.stderr,'');
 const version=(await execute(frontend,['-version'],{cwd:root,shell:false,windowsHide:true,timeout:30000})).stdout;
 assert.match(version,/Swift version 6\.1\.3/);
 const ir=await readFile(irPath,'utf8'),symbols=[...new Set([...ir.matchAll(/@"(\$s[^"\r\n]+)"/g)].map(m=>m[1]))];assert.ok(symbols.length>=30,'The authored declarations must produce a nonempty representative symbol inventory');
 assert.equal(digest(await readFile(sourcePath)),digest(source));
 const increment=symbols.find(s=>s.includes('9incrementy')),echo=symbols.find(s=>s.includes('4echoy')),asyncName=symbols.find(s=>s.includes('7delayedy')&&s.endsWith('YaF'));
 assert.ok(increment&&echo&&asyncName);
 // Each actual batch retains the product's 120-second aggregate deadline.
 // Small batches also allow cold process startup without reducing coverage.
 const ctx=await engine({config:selected}),batches=[],exeHash=digest(await readFile(exe));
 for(let start=0;start<symbols.length;start+=3){
  const inputs=symbols.slice(start,start+3),evidence=await ctx.call('demangle_swift',{symbols:inputs}),n=evidence.normalized_result;
  assert.equal(n.symbols.length,inputs.length);assert.equal(n.provenance.length,inputs.length+1);
  assert.deepEqual(n.symbols.map(s=>s.input),inputs);assert.ok(n.symbols.every(s=>s.status==='demangled'));
  assert.equal(evidence.provider.id,'swift-demangle');assert.match(evidence.provider.version,/LLVM version 19\.1\.4/);
  for(const p of n.provenance){assert.equal(p.executable_sha256,exeHash);assert.deepEqual(p.exit,{code:0,signal:null});assert.equal(p.version_reason,null);assert.ok(p.stdout_bytes>0);assert.equal(p.stderr_bytes,0);}
  assert.deepEqual(n.provenance[0].command,[exe,'--version']);
  for(let i=0;i<inputs.length;i++)assert.deepEqual(n.provenance[i+1].command,[exe,'--compact','--',inputs[i]]);
  for(let i=0;i<n.provenance.length;i++){assert.equal(n.provenance[i].stdout_bytes,Buffer.byteLength(evidence.raw_result.invocations[i].stdout));assert.equal(n.provenance[i].stderr_bytes,Buffer.byteLength(evidence.raw_result.invocations[i].stderr));}
  batches.push(evidence);
 }
 const results=batches.flatMap(e=>e.normalized_result.symbols);assert.equal(results.length,symbols.length);
 for(const pattern of [/RealSwiftFixture\.increment\(Swift\.Int\) -> Swift\.Int/,/RealSwiftFixture\.echo<A>\(A\) -> A/,/RealSwiftFixture\.delayed\(Swift\.Int\) async -> Swift\.Int/,/RealSwiftFixture\.façade\(Swift\.Int\) -> Swift\.Int/,/RealSwiftFixture\.Parcel/,/RealSwiftFixture\.BranchChoice/,/protocol witness.*RealSwiftFixture\.OwnedGauge/])assert.ok(results.some(s=>pattern.test(s.output)),String(pattern));
 const elfPath=join(folder,'legacy-target.elf');await writeFile(elfPath,elfFixture());
 receipt.source_sha256=digest(source);receipt.compiler={executable:frontend,executable_sha256:digest(await readFile(frontend)),version,command:[frontend,'-emit-ir','-parse-as-library','-module-name','RealSwiftFixture','-sdk',sdk,'-o',irPath,sourcePath],output_sha256:digest(Buffer.from(ir)),output_bytes:Buffer.byteLength(ir)};
 receipt.provider={executable:exe,executable_sha256:exeHash,reported_version:batches[0].provider.version,successful_symbols:symbols.length,provenance_entries:batches.reduce((sum,e)=>sum+e.normalized_result.provenance.length,0),batches:batches.map(e=>({evidence_id:e.evidence_id,symbols:e.parameters.symbols,provenance_entries:e.normalized_result.provenance.length})),results};
 receipt.observations.push({case:'compiler-to-demangler',success:true,symbols:symbols.length});
 shared={folder,exe,sourceHash:digest(source),symbols,increment,echo,asyncName,results,elfPath};return shared;
}
const options={skip:!required&&!available,timeout:180000};
test('official Swift compiler-produced symbols decode with actual invocation provenance',{...options,timeout:1200000},async t=>{const x=await prepare(t);assert.equal(digest(await readFile(sourcePath)),x.sourceHash);});
test('live Swift preserves literal options whitespace plain and malformed names',options,async()=>{assert.ok(shared);const inputs=['--help','  owned plain name  ','owned\tname','owned\rname','$s','$s16Broken000','_'+shared.increment],ctx=await engine({config:selected}),results=[],batches=[];for(let start=0;start<inputs.length;start+=3){const batch=inputs.slice(start,start+3),e=await ctx.call('demangle_swift',{symbols:batch});assert.deepEqual(e.normalized_result.symbols.map(s=>s.input),batch);assert.ok(e.limitations.some(s=>/unchanged echoes/.test(s)));assert.equal(e.normalized_result.provenance.length,batch.length+1);results.push(...e.normalized_result.symbols);batches.push({evidence_id:e.evidence_id,symbols:batch,provenance_entries:e.normalized_result.provenance.length});}for(let i=0;i<inputs.length-1;i++)assert.deepEqual(results[i],{input:inputs[i],output:inputs[i],status:'unchanged'});assert.equal(results.at(-1).output,shared.results.find(s=>s.input===shared.increment).output);receipt.observations.push({case:'literal-and-ambiguous-inputs',success:true,results,batches});});
test('real CLI demangle-swift retains required target and positional symbol contract',options,async()=>{assert.ok(shared);const sourceBefore=digest(await readFile(shared.elfPath));const command=[join(root,'scripts/real.mjs'),'demangle-swift',shared.elfPath,shared.increment,shared.echo,'--format','json'];const out=await execute(process.execPath,command,{cwd:root,shell:false,windowsHide:true,timeout:120000,maxBuffer:4*1024*1024,env:{...process.env,REAL_CONFIG:configPath}});const e=JSON.parse(out.stdout);assert.equal(e.operation,'demangle_swift');assert.deepEqual(e.normalized_result.symbols.map(s=>s.input),[shared.increment,shared.echo]);assert.ok(e.normalized_result.symbols.every(s=>s.status==='demangled'));assert.equal(digest(await readFile(shared.elfPath)),sourceBefore);receipt.observations.push({case:'actual-cli',success:true,argv:[process.execPath,...command],selected_artifact_sha256:sourceBefore,source_preserved:true,output_sha256:digest(out.stdout)});});
test('official MCP SDK receives real Swift results and retained evidence',options,async()=>{const client=new Client({name:'owned-swift-provider',version:'1'}),transport=new StdioClientTransport({command:process.execPath,args:[join(root,'scripts/real.mjs'),'mcp'],cwd:root,stderr:'pipe',env:{REAL_CONFIG:configPath}});try{await client.connect(transport,{timeout:60000});const result=await client.callTool({name:'demangle_swift',arguments:{symbols:[shared.increment,shared.asyncName]}},{timeout:120000});assert.equal(result.isError,undefined);const e=result.structuredContent;assert.equal(e.provider.id,'swift-demangle');assert.ok(e.normalized_result.symbols.every(s=>s.status==='demangled'));const bundle=await client.callTool({name:'get_evidence_bundle',arguments:{}},{timeout:30000});assert.ok(bundle.structuredContent.result.records.some(r=>r.evidence_id===e.evidence_id));receipt.observations.push({case:'actual-mcp-sdk',success:true,evidence_id:e.evidence_id});}finally{await client.close();await transport.close();}});
test('cancellation after an actual completed Swift invocation leaves no result retained',options,async()=>{const controller=new AbortController(),ctx=await engine({config:selected,signal:controller.signal}),run=ctx.run.bind(ctx),observed=[];ctx.run=async(command,settings)=>{const result=await run(command,settings);observed.push({command,exit_code:result.exitCode});if(command[1]==='--compact')controller.abort(new Error('Owned Swift fixture cancellation'));return result;};await assert.rejects(()=>ctx.call('demangle_swift',{symbols:[shared.increment,shared.echo]}),/Owned Swift fixture cancellation/);assert.equal(observed.length,2);assert.ok(observed.every(p=>p.exit_code===0));assert.equal(ctx.ledger.size,0);assert.equal(ctx.history.length,0);receipt.observations.push({case:'completed-invocation-cancellation',success:true,observed});});
test('real Swift consumes response-file-shaped input as literal pipe data without reading its named file',options,async()=>{const responsePath=join(shared.folder,'owned.rsp');await writeFile(responsePath,shared.increment);const before=digest(await readFile(responsePath)),ctx=await engine({config:selected}),run=ctx.run.bind(ctx),read=ctx.read.bind(ctx),calls=[],reads=[];ctx.run=async(argv,settings)=>{calls.push({argv:[...argv],stdin_bytes:settings.stdin===undefined?0:Buffer.byteLength(settings.stdin)});return run(argv,settings);};ctx.read=async(path,settings)=>{reads.push(path);return read(path,settings);};const e=await ctx.call('demangle_swift',{symbols:[shared.increment,'@'+responsePath]});assert.equal(calls.length,3);assert.deepEqual(calls[2].argv,[shared.exe,'--compact']);assert.equal(calls[2].stdin_bytes,Buffer.byteLength('@'+responsePath+'\n'));assert.equal(reads.includes(responsePath),false);assert.deepEqual(e.normalized_result.symbols[1],{input:'@'+responsePath,output:'@'+responsePath,status:'unchanged'});assert.equal(ctx.ledger.size,1);assert.equal(digest(await readFile(responsePath)),before);receipt.observations.push({case:'literal-response-file-shaped-stdin',success:true,provider_calls:calls.length,identity_reads:reads.length,file_preserved:true,stdin_command:calls[2]});});
test.after(async()=>{try{if(!shared)return;receipt.verified_at=new Date().toISOString();receipt.source_preserved=digest(await readFile(sourcePath))===shared.sourceHash;assert.equal(receipt.source_preserved,true);assert.equal(receipt.observations.length,6);await writeFile(join(root,'docs/verification/SWIFT_PROVIDER_REPORT.json'),JSON.stringify(receipt,null,2)+'\n');}finally{if(fixtureFolder){assert.ok(resolve(fixtureFolder).startsWith(resolve(testRoot)+sep+'runtime-swift-'));await rm(fixtureFolder,{recursive:true,force:true,maxRetries:8,retryDelay:100});}}});
