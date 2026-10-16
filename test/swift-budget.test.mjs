import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,realpath,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {performance} from 'node:perf_hooks';
import {Context,digest,errorResult} from '../lib/core.mjs';
import {demangleSwift,SWIFT_BATCH_LIMITS} from '../lib/artifact-swift.mjs';
import {elfFixture} from './artifact-fixtures.mjs';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';

const root=fileURLToPath(new URL('../',import.meta.url)),execute=promisify(execFile),childFixture=join(root,'test/fixtures/swift-budget-child.mjs');
const packet=(stdout,stderr='')=>({stdout,stderr,exitCode:0}),observations=[];
function capacity(dimension){return error=>{assert.equal(error.code,'capacity');assert.equal(error.operation,'demangle_swift');assert.equal(error.details.reason,'swift_batch_budget_exhausted');assert.equal(error.details.dimension,dimension);assert.equal(errorResult(error,'demangle_swift').error.code,'resource_constraint');return true;};}
async function owned(t,budget={},runner){
 const folder=await mkdtemp(join(tmpdir(),'real-swift-budget-')),identity=join(folder,'provider.bytes');
 t.after(async()=>{const actual=await realpath(folder);assert.ok(actual.toLowerCase().startsWith(resolve(tmpdir()).toLowerCase()+sep+'real-swift-budget-'));await rm(actual,{recursive:true,force:true,maxRetries:8,retryDelay:100});});
 await writeFile(identity,'Owned budget provider identity; never executed.\n',{flag:'wx'});
 const ctx=new Context({config:{swiftDemangle:identity,swiftBatchBudget:budget}}),calls=[];ctx.handlers={demangle_swift:demangleSwift};
 ctx.run=async function(argv,options){calls.push({argv:[...argv],options:{...options},signal:this.signal});return runner?runner.call(this,argv,options):packet(argv[1]==='--version'?'v\n':argv[3]+'\n');};
 return {folder,identity,ctx,calls};
}
const empty=ctx=>{assert.equal(ctx.ledger.size,0);assert.equal(ctx.history.length,0);};
async function absent(pid){const until=performance.now()+3000;while(true){try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH')return;throw e;}assert.ok(performance.now()<until,'Owned child must physically exit after request exhaustion');await delay(25);}}
const note=(name,details={})=>observations.push({case:name,success:true,...details});

test('batch symbol and UTF-8 input quotas reject before identity reads or child invocation',async t=>{
 for(const [budget,symbols,dimension] of [[{},Array(1025).fill('a'),'symbols'],[{maxInputBytes:5},['ééé'],'input_bytes']]){
  const f=await owned(t,budget);let reads=0;f.ctx.read=async()=>{reads++;assert.fail('Over-budget input reached identity reads');};
  await assert.rejects(()=>f.ctx.call('demangle_swift',{symbols}),capacity(dimension));assert.equal(reads,0);assert.equal(f.calls.length,0);empty(f.ctx);
 }
 note('input-preflight');
});
test('invalid and raised local budget settings fail without provider access',async t=>{
 for(const budget of [null,[],1,{unknownLimit:1},{timeoutMs:0},{maxOutputBytes:1.5},{maxInputBytes:'5'},{maxSymbols:1025},{timeoutMs:120001},{maxOutputBytes:16777217}]){
  const f=await owned(t,budget);f.ctx.read=async()=>assert.fail('Invalid budget reached identity reads');
  await assert.rejects(()=>f.ctx.call('demangle_swift',{symbols:['a']}),e=>e.code==='input');assert.equal(f.calls.length,0);empty(f.ctx);
 }
 note('config-validation');
});
test('exact aggregate byte boundaries accept a full batch and include version stderr and multibyte symbols',async t=>{
 const f=await owned(t,{maxSymbols:2,maxInputBytes:3,maxOutputBytes:10},async argv=>packet(argv[1]==='--version'?'v\n':argv[3]+'\n',argv[1]==='--version'?'wé':''));
 const e=await f.ctx.call('demangle_swift',{symbols:['é','x']});
 assert.deepEqual(e.normalized_result.symbols.map(s=>s.output),['é','x']);assert.equal(f.ctx.ledger.size,1);assert.equal(f.ctx.history.length,1);
 assert.equal(e.normalized_result.provenance.reduce((n,p)=>n+p.stdout_bytes+p.stderr_bytes,0),10);
 assert.deepEqual(f.calls.map(c=>c.options.maxBytes),[10,5,2]);assert.ok(f.calls.every(c=>c.options.timeout>0&&c.options.timeout<=30000));
 assert.equal(f.ctx.signal,undefined);assert.equal(digest(await readFile(f.identity)),digest('Owned budget provider identity; never executed.\n'));
 note('exact-boundaries',{output_bytes:10,input_bytes:3});
});
test('combined version streams can exhaust the batch before any symbol invocation',async t=>{
 const f=await owned(t,{maxOutputBytes:5},async()=>packet('v\n','éé'));
 await assert.rejects(()=>f.ctx.call('demangle_swift',{symbols:['x']}),capacity('output_bytes'));assert.equal(f.calls.length,1);empty(f.ctx);note('version-streams');
});
test('a later combined-stream overrun discards prior batch results and preserves unrelated ledger history',async t=>{
 const f=await owned(t,{maxOutputBytes:9},async argv=>argv[1]==='--version'?packet('v\n'):argv[3]==='é'?packet('é\n'):packet('x\n','éé'));
 f.ctx.ledger.set('owned-prior',{kept:true});f.ctx.history.push({operation:'owned-prior'});
 await assert.rejects(()=>f.ctx.call('demangle_swift',{symbols:['é','x','never']}),capacity('output_bytes'));
 assert.equal(f.calls.length,3);assert.deepEqual([...f.ctx.ledger],[['owned-prior',{kept:true}]]);assert.deepEqual(f.ctx.history,[{operation:'owned-prior'}]);
 assert.deepEqual(f.calls.map(c=>c.options.maxBytes),[9,7,4]);note('atomic-output-overrun');
});
test('a nonzero version response consumes its real output quota instead of resetting the batch',async t=>{
 const f=await owned(t,{maxOutputBytes:4},async()=>{throw Object.assign(new Error('Owned unsupported version'),{code:2,killed:false,signal:null,stdout:'',stderr:'éé'});});
 await assert.rejects(()=>f.ctx.call('demangle_swift',{symbols:['x']}),capacity('output_bytes'));assert.equal(f.calls.length,1);empty(f.ctx);note('nonzero-version-accounting');
});
test('failed later subprocess output is still subject to the shared quota',async t=>{
 const f=await owned(t,{maxOutputBytes:6},async argv=>{if(argv[1]==='--version')return packet('v\n');if(argv[3]==='first')return packet('a\n');throw Object.assign(new Error('Owned failed packet'),{code:7,signal:null,stdout:'b\n',stderr:'é'});});
 await assert.rejects(()=>f.ctx.call('demangle_swift',{symbols:['first','second']}),capacity('output_bytes'));assert.equal(f.calls.length,3);empty(f.ctx);note('failed-packet-accounting');
});
test('request deadlines are isolated across concurrent calls sharing a Context',async t=>{
 const f=await owned(t,{timeoutMs:1000},async function(argv){if(argv[1]==='--version')return packet('v\n');if(argv[3]==='fast'){await delay(5);return packet('fast\n');}await delay(3000,undefined,{signal:this.signal});return packet('slow\n');});
 const slow=assert.rejects(()=>f.ctx.call('demangle_swift',{symbols:['slow']}),capacity('timeout_ms'));
 const fast=await f.ctx.call('demangle_swift',{symbols:['fast']});await slow;
 assert.equal(f.ctx.signal,undefined);assert.equal(f.ctx.ledger.size,1);assert.ok(f.ctx.ledger.has(fast.evidence_id));assert.deepEqual(f.ctx.history.map(h=>h.evidence_id),[fast.evidence_id]);
 const scopes=new Set(f.calls.map(c=>c.signal));assert.equal(scopes.size,2);assert.ok([...scopes].every(s=>s instanceof AbortSignal));note('shared-context-isolation');
});
test('final identity reads that resolve or reject after the deadline cannot publish expired evidence',async t=>{
 for(const outcome of ['resolve','reject']){
  // Allow cold filesystem setup to reach the intended final-read boundary; the
  // injected delay still exceeds this owned fixture's total request deadline.
  const f=await owned(t,{timeoutMs:1000}),read=f.ctx.read;let count=0;
  f.ctx.read=async function(...args){const bytes=await read.apply(this,args);if(++count===2){await delay(1100);if(outcome==='reject')throw Object.assign(new Error('Owned delayed identity failure'),{code:'EIO'});}return bytes;};
  await assert.rejects(()=>f.ctx.call('demangle_swift',{symbols:['x']}),capacity('timeout_ms'));assert.equal(count,2);empty(f.ctx);
 }
 note('final-identity-deadline',{read_outcomes:['resolve','reject']});
});
test('evidence remains staged when the deadline expires after constructing its schema-valid record',async t=>{
 const f=await owned(t,{timeoutMs:1000}),evidence=f.ctx.evidence;let staged;
 f.ctx.evidence=async function(...args){staged=await evidence.apply(this,args);assert.ok(this.ledger.has(staged.evidence_id));await delay(1100);return staged;};
 await assert.rejects(()=>f.ctx.call('demangle_swift',{symbols:['x']}),capacity('timeout_ms'));assert.ok(staged);empty(f.ctx);note('staged-publication-deadline');
});
test('caller cancellation keeps its original reason and cannot affect a later successful request',async t=>{
 const f=await owned(t,{timeoutMs:500},async function(argv){if(argv[1]==='--version')return packet('v\n');await delay(1000,undefined,{signal:this.signal});return packet('x\n');}),controller=new AbortController(),reason=new Error('Owned caller cancellation');
 f.ctx.signal=controller.signal;const pending=assert.rejects(()=>f.ctx.call('demangle_swift',{symbols:['x']}),error=>error===reason||error.name==='AbortError');
 const timer=setTimeout(()=>controller.abort(reason),20);try{await pending;}finally{clearTimeout(timer);}empty(f.ctx);assert.equal(f.ctx.signal,controller.signal);
 f.ctx.signal=undefined;f.ctx.run=async argv=>packet(argv[1]==='--version'?'v\n':argv[3]+'\n');const e=await f.ctx.call('demangle_swift',{symbols:['x']});await delay(550);assert.ok(f.ctx.ledger.has(e.evidence_id));assert.equal(f.ctx.history.length,1);assert.equal(f.ctx.signal,undefined);note('caller-cancellation-and-reuse');
});
test('the batch deadline terminates a real owned Node child before its delayed filesystem action',async t=>{
 // Isolate the held-child deadline from version-process startup. Actual Swift
 // version/symbol subprocesses remain covered by the live provider fixtures.
 const f=await owned(t,{timeoutMs:25000}),record=join(f.folder,'children.jsonl'),marker=join(f.folder,'after-deadline.txt');
 f.ctx.run=async function(argv,options){f.calls.push({argv:[...argv],options:{...options}});if(argv[1]==='--version')return packet('v\n');return Context.prototype.run.call(this,[process.execPath,childFixture,record,marker,...argv.slice(1)],options);};
 const started=performance.now();await assert.rejects(()=>f.ctx.call('demangle_swift',{symbols:['hold']}),capacity('timeout_ms'));const elapsed=performance.now()-started;
 const children=(await readFile(record,'utf8')).trim().split('\n').map(JSON.parse);assert.equal(children.length,1);await access(marker+'.started');assert.equal(f.calls.length,2);
 for(const child of children)await absent(child.pid);await assert.rejects(()=>access(marker),e=>e.code==='ENOENT');assert.ok(elapsed<35000);empty(f.ctx);assert.ok(f.calls[1].options.timeout<=25000);
 note('actual-owned-child-deadline',{elapsed_ms:elapsed,children,processes_physically_absent:true,delayed_action_absent:true});
});
test('a lowered batch deadline cancels a real owned child before its readiness receipt',async t=>{
 const f=await owned(t,{timeoutMs:3000}),record=join(f.folder,'not-ready.jsonl'),marker=join(f.folder,'not-ready.txt');let child;
 f.ctx.run=async function(argv,options){
  f.calls.push({argv:[...argv],options:{...options}});if(argv[1]==='--version')return packet('v\n');
  const pending=execute(process.execPath,[childFixture,record,marker,...argv.slice(1)],{timeout:options.timeout,maxBuffer:options.maxBytes,
   signal:this.signal,shell:false,windowsHide:true,env:{SystemRoot:process.env.SystemRoot??'C:\\Windows',PATH:process.env.PATH??'',TEMP:process.env.TEMP??'',TMP:process.env.TMP??''}});
  child=pending.child;const result=await pending;return {...result,exitCode:0};
 };
 await assert.rejects(()=>f.ctx.call('demangle_swift',{symbols:['bootstrap']}),capacity('timeout_ms'));
 assert.ok(Number.isSafeInteger(child?.pid));await absent(child.pid);
 for(const file of [record,marker,marker+'.started'])await assert.rejects(()=>access(file),e=>e.code==='ENOENT');
 assert.equal(f.calls.length,2);assert.ok(f.calls[1].options.timeout<=3000);empty(f.ctx);
 note('actual-owned-pre-readiness-deadline',{pid:child.pid,process_physically_absent:true,readiness_receipt_absent:true});
});
test('remaining output quota bounds a real owned child and maps maxBuffer exhaustion to capacity',async t=>{
 const f=await owned(t,{maxOutputBytes:64}),record=join(f.folder,'children.jsonl'),marker=join(f.folder,'marker.txt');let actualError;
 f.ctx.run=async function(argv,options){f.calls.push({argv:[...argv],options:{...options}});try{return await Context.prototype.run.call(this,[process.execPath,childFixture,record,marker,...argv.slice(1)],options);}catch(e){actualError=e;throw e;}};
 await assert.rejects(()=>f.ctx.call('demangle_swift',{symbols:['emit']}),capacity('output_bytes'));assert.equal(actualError.code,'ERR_CHILD_PROCESS_STDIO_MAXBUFFER');
 const children=(await readFile(record,'utf8')).trim().split('\n').map(JSON.parse);for(const child of children)await absent(child.pid);assert.deepEqual(f.calls.map(c=>c.options.maxBytes),[64,62]);empty(f.ctx);
 note('actual-owned-child-output',{actual_error_code:actualError.code,children,processes_physically_absent:true});
});
test('actual CLI and unmodified MCP SDK retain existing resource error contracts and no partial Swift evidence',async t=>{
 const f=await owned(t,{maxSymbols:1}),config=join(f.folder,'config.json'),target=join(f.folder,'owned.elf');await writeFile(config,JSON.stringify(f.ctx.config));await writeFile(target,elfFixture());const before=digest(await readFile(target));let cliError;
 try{await execute(process.execPath,[join(root,'scripts/real.mjs'),'demangle-swift',target,'first','second','--format','json'],{cwd:root,shell:false,windowsHide:true,timeout:30000,env:{...process.env,REAL_CONFIG:config}});assert.fail('Over-budget CLI succeeded');}catch(error){assert.equal(error.code,1);cliError=JSON.parse(error.stdout);assert.equal(cliError.error.code,'resource_constraint');assert.equal(cliError.error.details.reason,'swift_batch_budget_exhausted');}
 assert.equal(digest(await readFile(target)),before);
 const client=new Client({name:'owned-swift-budget',version:'1'}),transport=new StdioClientTransport({command:process.execPath,args:[join(root,'scripts/real.mjs'),'mcp'],cwd:root,stderr:'pipe',env:{REAL_CONFIG:config}});let mcpError;
 try{await client.connect(transport);const result=await client.callTool({name:'demangle_swift',arguments:{symbols:['first','second']}});assert.equal(result.isError,true);mcpError=result.structuredContent;assert.equal(mcpError.error.code,'resource_constraint');assert.equal(mcpError.error.details.reason,'swift_batch_budget_exhausted');const bundle=await client.callTool({name:'get_evidence_bundle',arguments:{}});assert.equal(bundle.structuredContent.result.records.length,0);}finally{await client.close();await transport.close();}
 note('actual-cli-mcp-error-contracts',{cli:cliError,mcp:mcpError,selected_source_preserved:true,retained_mcp_records:0});
});
test.after(async()=>{assert.equal(observations.length,15);await writeFile(join(root,'docs/verification/SWIFT_BUDGET_REPORT.json'),JSON.stringify({verified_at:new Date().toISOString(),limits:SWIFT_BATCH_LIMITS,code_sha256:digest(await readFile(join(root,'lib/artifact-swift.mjs'))),fixture_sha256:digest(await readFile(childFixture)),observations,limits_of_evidence:['Packet injections establish the asserted decisions, not vendor Swift behavior.','Three real owned Node child cases establish the recorded Windows readiness/termination/output outcomes; they are not actual Swift child teardown or arbitrary descendant-tree proof.','The held-child deadline case uses an owned version packet to isolate its real child from separate version startup; live provider fixtures verify actual version subprocesses.','Budgets cover decoded UTF-8 provider text and bounded symbol data inside this handler, not transport parsing, whole-process RSS or universal format/runtime parity.']},null,2)+'\n');});
