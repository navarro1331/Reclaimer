import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { Context, digest } from '../lib/core.mjs';
import { demangleSwift } from '../lib/artifact-swift.mjs';

// These owned subprocess packets test rejection/provenance boundaries only.
// The authored file is an identity fixture, not a Swift executable or live tool.
const identity=Buffer.from('Owned negative provider identity fixture.\n');
const version='Owned fixture version 0\r\n';
const reply=stdout=>({stdout,stderr:'',exitCode:0});
async function owned(t,runner,{signal}={}){
 const root=await mkdtemp(join(tmpdir(),'real-swift-boundary-')),exe=join(root,'owned-provider.bytes');
 t.after(async()=>{const actual=await realpath(root);assert.ok(actual.toLowerCase().startsWith(resolve(tmpdir()).toLowerCase()+sep+'real-swift-boundary-'));await rm(actual,{recursive:true,force:true});});
 await writeFile(exe,identity,{flag:'wx'});const ctx=new Context({config:{swiftDemangle:exe},signal}),calls=[];
 ctx.handlers={demangle_swift:demangleSwift};ctx.run=async(argv,options)=>{calls.push({argv:structuredClone(argv),options:structuredClone(options)});return runner(argv,ctx,exe,options);};
 return {ctx,calls,exe:await realpath(exe)};
}

test('missing or explicitly empty tool selection is unavailable before any provider invocation',async()=>{
 const selected=process.env.REAL_SWIFT_DEMANGLE;delete process.env.REAL_SWIFT_DEMANGLE;
 try {for(const config of [{},{swiftDemangle:''}]){
  const ctx=new Context({config});ctx.handlers={demangle_swift:demangleSwift};ctx.run=async()=>{assert.fail('Missing configuration reached a provider');};
  await assert.rejects(()=>ctx.call('demangle_swift',{symbols:['owned plain']}),error=>error.code==='unavailable');assert.equal(ctx.ledger.size,0);assert.equal(ctx.history.length,0);
 }}finally {if(selected===undefined)delete process.env.REAL_SWIFT_DEMANGLE;else process.env.REAL_SWIFT_DEMANGLE=selected;}
});

test('owned negative provider keeps option-like inputs literal and whitespace echoes unchanged with actual packet receipts',async t=>{
 const inputs=['--version','  owned plain \t','owned\r','café'],f=await owned(t,async argv=>reply(argv[1]==='--version'?version:argv[3]+'\n'));
 const e=await f.ctx.call('demangle_swift',{symbols:inputs}),n=e.normalized_result;
 assert.deepEqual(n.symbols,inputs.map(input=>({input,output:input,status:'unchanged'})));
 assert.deepEqual(f.calls.map(call=>call.argv),[[f.exe,'--version'],...inputs.map(input=>[f.exe,'--compact','--',input])]);
 assert.equal(e.provider.id,'swift-demangle');assert.equal(e.provider.version,'Owned fixture version 0');assert.equal(e.subject,null);assert.equal(n.provenance.length,inputs.length+1);
 n.provenance.forEach((p,i)=>{assert.equal(p.executable_sha256,digest(identity));assert.deepEqual(p.command,f.calls[i].argv);assert.deepEqual(p.exit,{code:0,signal:null});assert.equal(p.stderr_bytes,0);assert.equal(p.stdout_bytes,Buffer.byteLength(i===0?version:inputs[i-1]+'\n'));assert.equal(p.tool_version,'Owned fixture version 0');assert.equal(p.version_reason,null);});
 assert.ok(n.limitations.some(value=>value.includes('invalid Swift manglings')));assert.ok(f.calls.every(call=>call.options.timeout>0&&call.options.timeout<=10000&&call.options.maxBytes>0&&call.options.maxBytes<=16*1024*1024));
});

test('owned negative provider empty or inconsistent multiline output cannot publish partial batch evidence',async t=>{
 for(const output of ['', '\n', 'owned first\nowned second\n']){
  const f=await owned(t,async argv=>reply(argv[1]==='--version'?version:argv[3]==='first'?'first\n':output));
  await assert.rejects(()=>f.ctx.call('demangle_swift',{symbols:['first','second']}),/empty or inconsistent multiline/);
  assert.equal(f.ctx.ledger.size,0);assert.equal(f.ctx.history.length,0);assert.equal(f.calls.length,3);
 }
});

test('owned failed symbol subprocess retains failure diagnostics and publishes no earlier successful symbol',async t=>{
 const cause=Object.assign(new Error('Owned provider failed'),{code:7,signal:null,stdout:'owned incomplete\n',stderr:'owned failure details\n'}),f=await owned(t,async argv=>{if(argv[1]==='--version')return reply(version);if(argv[3]==='first')return reply('first\n');throw cause;});
 await assert.rejects(()=>f.ctx.call('demangle_swift',{symbols:['first','second']}),error=>{assert.equal(error.code,'provider');assert.deepEqual(error.details.command,[f.exe,'--compact','--','second']);assert.deepEqual(error.details.exit,{code:7,signal:null});assert.equal(error.details.stdout_bytes,Buffer.byteLength(cause.stdout));assert.equal(error.details.stderr_bytes,Buffer.byteLength(cause.stderr));return true;});
 assert.equal(f.ctx.ledger.size,0);assert.equal(f.ctx.history.length,0);
});

test('owned unsupported version query records its actual exit without inventing a Swift version',async t=>{
 const f=await owned(t,async argv=>{if(argv[1]==='--version')throw Object.assign(new Error('Owned no version option'),{code:2,killed:false,signal:null,stdout:'',stderr:'Owned version query unavailable\n'});return reply(argv[3]+'\r\n');});
 const e=await f.ctx.call('demangle_swift',{symbols:['plain']}),p=e.normalized_result.provenance;
 assert.equal(e.provider.version,null);assert.equal(p[0].tool_version,null);assert.deepEqual(p[0].exit,{code:2,signal:null});assert.match(p[0].version_reason,/exited with code 2/);assert.equal(p[0].stderr_bytes,Buffer.byteLength('Owned version query unavailable\n'));assert.deepEqual(p[1].exit,{code:0,signal:null});assert.equal(e.normalized_result.symbols[0].status,'unchanged');
});

test('owned version-query timeout is a provider failure rather than a fabricated unknown-version success',async t=>{
 for(const cause of [{code:null,killed:true,signal:'SIGTERM'},{code:2,killed:false,signal:'SIGTERM'}]){
  const f=await owned(t,async()=>{throw Object.assign(new Error('Owned stopped version query'),{stdout:'',stderr:'',...cause});});
  await assert.rejects(()=>f.ctx.call('demangle_swift',{symbols:['plain']}),error=>error.code==='provider'&&error.details.exit.signal==='SIGTERM');assert.equal(f.calls.length,1);assert.equal(f.ctx.ledger.size,0);
 }
});

test('owned cancellation during version query or a later symbol publishes no evidence',async t=>{
 for(const phase of ['version','second']){
  const controller=new AbortController(),f=await owned(t,async argv=>{if(phase==='version'&&argv[1]==='--version'||phase==='second'&&argv[3]==='second')controller.abort();return reply(argv[1]==='--version'?version:argv[3]+'\n');},{signal:controller.signal});
  await assert.rejects(()=>f.ctx.call('demangle_swift',{symbols:['first','second']}),{name:'AbortError'});assert.equal(f.ctx.ledger.size,0);assert.equal(f.ctx.history.length,0);assert.equal(f.calls.length,phase==='version'?1:3);
 }
});

test('owned executable content changes and cancellation during the final identity read prevent publication',async t=>{
 const changed=await owned(t,async(argv,ctx,exe)=>{if(argv[1]==='--compact')await writeFile(exe,'Owned changed executable identity.');return reply(argv[1]==='--version'?version:argv[3]+'\n');});
 await assert.rejects(()=>changed.ctx.call('demangle_swift',{symbols:['plain']}),/executable content changed/);assert.equal(changed.ctx.ledger.size,0);
 const controller=new AbortController(),cancelled=await owned(t,async argv=>reply(argv[1]==='--version'?version:argv[3]+'\n'),{signal:controller.signal}),read=cancelled.ctx.read.bind(cancelled.ctx);let reads=0;
 cancelled.ctx.read=async(...args)=>{const value=await read(...args);if(++reads===2)controller.abort();return value;};
 await assert.rejects(()=>cancelled.ctx.call('demangle_swift',{symbols:['plain']}),{name:'AbortError'});assert.equal(cancelled.ctx.ledger.size,0);
});

test('public invalid symbol boundaries reject before the owned provider is invoked',async t=>{
 const f=await owned(t,async()=>{assert.fail('Invalid public input reached the owned provider');});
 for(const symbols of [[],[''],['owned\nsecond'],['owned\0second']])await assert.rejects(()=>f.ctx.call('demangle_swift',{symbols}),error=>error.code==='input');
 assert.equal(f.calls.length,0);assert.equal(f.ctx.ledger.size,0);
});

test('an owned response-file-shaped symbol stays literal pipe data and cannot read its named file',async t=>{
 const f=await owned(t,async(argv,ctx,exe,options)=>reply(argv[1]==='--version'?version:options.stdin??argv[3]+'\n')),response=join(resolve(f.exe,'..'),'owned.rsp'),contents=Buffer.from('Owned response-file text must remain data, never a symbol input.\n');
 await writeFile(response,contents,{flag:'wx'});const reads=[],read=f.ctx.read.bind(f.ctx);f.ctx.read=async(path,options)=>{reads.push(path);return read(path,options);};
 const evidence=await f.ctx.call('demangle_swift',{symbols:['valid-owned-plain','@'+response]});
 assert.equal(f.calls.length,3);assert.deepEqual(f.calls[2].argv,[f.exe,'--compact']);assert.equal(f.calls[2].options.stdin,'@'+response+'\n');assert.equal(reads.includes(response),false);assert.equal(reads.length,2);assert.deepEqual(evidence.normalized_result.symbols[1],{input:'@'+response,output:'@'+response,status:'unchanged'});assert.equal(evidence.raw_result.invocations[2].stdin.bytes,Buffer.byteLength('@'+response+'\n'));assert.equal(f.ctx.ledger.size,1);assert.deepEqual(await readFile(response),contents);
});
