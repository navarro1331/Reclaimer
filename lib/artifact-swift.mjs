import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { digest, InvestigationError } from './core.mjs';

const operation='demangle_swift';
const callOptions={timeout:10_000,maxBytes:16*1024*1024};
export const SWIFT_BATCH_LIMITS=Object.freeze({maxSymbols:1024,maxInputBytes:1048576,maxOutputBytes:16777216,timeoutMs:120000});
const terminated=text=>text.replace(/(?:\r\n|\n|\r)+$/u,'');
const cancelled=(error,ctx)=>ctx.signal?.aborted||error?.name==='AbortError'||error?.code==='cancelled';
function batchLimits(config){
 if(config===undefined)return SWIFT_BATCH_LIMITS;
 if(config===null||typeof config!=='object'||Array.isArray(config))throw new InvestigationError('input',operation,'swiftBatchBudget must be an object of supported lower limits');
 const limits={...SWIFT_BATCH_LIMITS};
 for(const key of Reflect.ownKeys(config)){
  const value=config[key];
  if(typeof key!=='string'||!Object.hasOwn(SWIFT_BATCH_LIMITS,key)||!Number.isSafeInteger(value)||value<=0||value>SWIFT_BATCH_LIMITS[key])throw new InvestigationError('input',operation,'swiftBatchBudget contains an unknown, invalid or raised limit',{setting:String(key)});
  limits[key]=value;
 }
 return limits;
}
function exhausted(dimension,limit,observed,details={}){
 const measured=Number.isFinite(observed)?Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,observed)):Number.MAX_SAFE_INTEGER;
 return new InvestigationError('capacity',operation,'Swift demangle batch budget exhausted',{reason:'swift_batch_budget_exhausted',dimension,limit,observed:measured,used:measured,...details,remediation:'Split the symbol batch or reduce its input, captured output or processing time before retrying.'});
}
function scopedBudget(ctx,callerSignal,limits,started){
 const controller=new AbortController(),scope=Object.create(ctx);scope.signal=controller.signal;scope.ledger=new Map();
 let outputUsed=0;
 const elapsed=()=>performance.now()-started;
 const callerCheck=()=>callerSignal?.throwIfAborted();
 const fail=(dimension,limit,observed,details)=>{const error=exhausted(dimension,limit,observed,details);controller.abort(error);throw error;};
 const check=()=>{
  callerCheck();
  const used=elapsed();if(used>=limits.timeoutMs)fail('timeout_ms',limits.timeoutMs,used);
  scope.signal.throwIfAborted();
 };
 const relay=()=>controller.abort(callerSignal.reason);
 callerSignal?.addEventListener('abort',relay,{once:true});
 if(callerSignal?.aborted)relay();
 const timer=setTimeout(()=>controller.abort(exhausted('timeout_ms',limits.timeoutMs,elapsed())),Math.max(1,Math.ceil(limits.timeoutMs-elapsed())));
 function consume(packet){
  callerCheck();
  outputUsed+=(typeof packet?.stdout==='string'?Buffer.byteLength(packet.stdout):0)+(typeof packet?.stderr==='string'?Buffer.byteLength(packet.stderr):0);
  if(outputUsed>limits.maxOutputBytes)fail('output_bytes',limits.maxOutputBytes,outputUsed);
  check();
 }
 async function invoke(command,stdin){
  check();
  const remainingBytes=limits.maxOutputBytes-outputUsed,remainingMs=limits.timeoutMs-elapsed();
  if(remainingBytes<=0)fail('output_bytes',limits.maxOutputBytes,outputUsed);
  if(remainingMs<=0)fail('timeout_ms',limits.timeoutMs,elapsed());
  // execFile accepts whole milliseconds. The isolated deadline signal and
  // monotonic post-check retain the batch bound despite submillisecond rounding.
  const timeout=Math.min(callOptions.timeout,Math.ceil(remainingMs));
  const options={timeout,maxBytes:Math.min(callOptions.maxBytes,remainingBytes)};
  if(stdin!==undefined)options.stdin=stdin;
  let reply;
  try {reply=await scope.run(command,options);}
  catch(error){
   consume(error);
   if(error?.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER')fail('output_bytes',limits.maxOutputBytes,outputUsed,{capture_truncated:true,per_stream_max_bytes:options.maxBytes});
   throw error;
  }
  consume(reply);return reply;
 }
 return {scope,check,invoke,cleanup(){clearTimeout(timer);callerSignal?.removeEventListener('abort',relay);}};
}
function streams(reply,command){
 if(typeof reply?.stdout!=='string'||typeof reply?.stderr!=='string'||!Number.isSafeInteger(reply.exitCode)||reply.signal!=null&&typeof reply.signal!=='string')throw new InvestigationError('provider',operation,'Swift provider did not return captured text and an actual exit code',{command});
 return {stdout:reply.stdout,stderr:reply.stderr,exit:{code:reply.exitCode,signal:reply.signal??null}};
}
function failed(error,command,hash){
 const details={command,executable_sha256:hash,exit:{code:Number.isSafeInteger(error?.code)?error.code:null,signal:typeof error?.signal==='string'?error.signal:null},cause_code:error?.code??null};
 if(typeof error?.stdout==='string')details.stdout_bytes=Buffer.byteLength(error.stdout);
 if(typeof error?.stderr==='string')details.stderr_bytes=Buffer.byteLength(error.stderr);
 const failure=new InvestigationError('provider',operation,'The configured Swift provider failed before a complete result could be retained',details);failure.cause=error;return failure;
}
function symbolResult(symbol,stdout){
 // An exact echo is an observation, not a Swift-validity decision. Recognize it
 // before removing terminators so caller-owned literal whitespace survives.
 for(const ending of ['','\n','\r\n','\r'])if(stdout===symbol+ending)return {input:symbol,output:symbol,status:'unchanged'};
 const output=terminated(stdout);
 if(!output.length||/[\r\n]/u.test(output))throw new InvestigationError('provider',operation,'Swift provider returned empty or inconsistent multiline symbol output',{input:symbol,stdout_bytes:Buffer.byteLength(stdout)});
 return {input:symbol,output,status:output===symbol?'unchanged':'demangled'};
}

export async function demangleSwift(args,ctx){
 const started=performance.now(),callerSignal=ctx.signal;callerSignal?.throwIfAborted();
 const limits=batchLimits(ctx.config?.swiftBatchBudget);
 if(args.symbols.length>limits.maxSymbols)throw exhausted('symbols',limits.maxSymbols,args.symbols.length);
 let inputBytes=0;for(const symbol of args.symbols){inputBytes+=Buffer.byteLength(symbol);if(inputBytes>limits.maxInputBytes)throw exhausted('input_bytes',limits.maxInputBytes,inputBytes);}
 const budget=scopedBudget(ctx,callerSignal,limits,started),scope=budget.scope;
 try {
 budget.check();
 const selected=scope.config?.swiftDemangle??process.env.REAL_SWIFT_DEMANGLE;
 if(!selected)scope.unavailable(operation,'swift-demangle is not configured','Set config.swiftDemangle or REAL_SWIFT_DEMANGLE to an existing Swift toolchain executable');
 if(typeof selected!=='string'||selected.includes('\0'))throw new InvestigationError('input',operation,'The Swift demangler configuration must be an executable path');
 const executable=await realpath(resolve(selected));budget.check();
 const executableHash=digest(await scope.read(executable));budget.check();
 const invocations=[],command=[executable,'--version'];let probe;
 try {probe=streams(await budget.invoke(command),command);}
 catch(error){
  if(cancelled(error,scope)||error.code==='capacity'&&error.details?.reason==='swift_batch_budget_exhausted')throw error;
  if(Number.isSafeInteger(error?.code)&&!error.killed&&error.signal==null&&typeof error.stdout==='string'&&typeof error.stderr==='string')probe={stdout:error.stdout,stderr:error.stderr,exit:{code:error.code,signal:null}};
  else throw failed(error,command,executableHash);
 }
 budget.check();
 if(probe.exit.signal!==null)throw new InvestigationError('provider',operation,'Swift version query did not complete normally',{command,executable_sha256:executableHash,exit:probe.exit,stdout_bytes:Buffer.byteLength(probe.stdout),stderr_bytes:Buffer.byteLength(probe.stderr)});
 const reported=terminated(probe.stdout||probe.stderr);
 const toolVersion=probe.exit.code===0&&/\S/u.test(reported)?reported:null;
 const versionReason=toolVersion!==null?null:probe.exit.code!==0?`Version probe exited with code ${probe.exit.code}; tool version was not established`:'Version probe returned no non-whitespace version text';
 invocations.push({command:[...command],...probe});
 const symbols=[];
 for(const symbol of args.symbols){
  budget.check();
  const stdin=symbol.startsWith('@')?symbol+'\n':undefined,command=stdin===undefined?[executable,'--compact','--',symbol]:[executable,'--compact'];let captured;
  try {captured=streams(await budget.invoke(command,stdin),command);}
  catch(error){if(cancelled(error,scope)||error.code==='capacity'&&error.details?.reason==='swift_batch_budget_exhausted')throw error;throw failed(error,command,executableHash);}
  budget.check();
  if(captured.exit.code!==0||captured.exit.signal!==null)throw new InvestigationError('provider',operation,'Swift provider did not complete a symbol invocation successfully',{command,executable_sha256:executableHash,exit:captured.exit,stdout_bytes:Buffer.byteLength(captured.stdout),stderr_bytes:Buffer.byteLength(captured.stderr)});
  symbols.push(symbolResult(symbol,captured.stdout));invocations.push({command,...captured,...(stdin===undefined?{}:{stdin:{bytes:Buffer.byteLength(stdin),sha256:digest(Buffer.from(stdin)),transport:'owned-closed-pipe'}})});
 }
 const finalHash=digest(await scope.read(executable));budget.check();
 if(finalHash!==executableHash)throw new InvestigationError('provider',operation,'Swift executable content changed during demangling',{executable,sha256_before:executableHash,sha256_after:finalHash});
 const limitations=[
  `This batch accepts at most ${limits.maxSymbols} symbols, ${limits.maxInputBytes} UTF-8 input bytes and ${limits.maxOutputBytes} combined captured stdout/stderr bytes. A ${limits.timeoutMs}-millisecond monotonic deadline is checked through identity reads and evidence publication; filesystem waits and synchronous work cannot be preempted instantly.`,
  'Subprocess timeouts round remaining time up to whole milliseconds; the isolated deadline signal and monotonic publication checks enforce the batch deadline.',
  '@-prefixed symbols use a closed standard-input pipe; their bytes never become response-file arguments or filenames to read. Other symbols retain literal argv handling after --. Standard input is the vendor textual demangling filter; statuses describe its actual output.',
  'Statuses describe the configured provider output; unchanged echoes do not distinguish plain names from invalid Swift manglings.',
  'Version text is the actual version-query response and may identify LLVM rather than the Swift compiler release.',
  'Byte counts describe captured UTF-8 stdout/stderr text; executable hashes before/after do not attest loaded image bytes or dependent libraries.',
 ];
 if(versionReason)limitations.push(versionReason);
 const provenance=invocations.map(invocation=>({tool:'swift-demangle',command:invocation.command,tool_version:toolVersion,version_reason:versionReason,executable_sha256:executableHash,exit:invocation.exit,stdout_bytes:Buffer.byteLength(invocation.stdout),stderr_bytes:Buffer.byteLength(invocation.stderr)}));
 budget.check();
 const evidence=await scope.evidence(operation,args,{symbols,provenance,limitations},{subject:null,provider:{id:'swift-demangle',name:'Configured Swift demangler',version:toolVersion},authority:'external-service',confidence:'observed',limitations,raw:{invocations}});
 budget.check();
 if(scope.ledger.size!==1||!scope.ledger.has(evidence.evidence_id))throw new InvestigationError('contract',operation,'Swift evidence staging did not produce exactly one retained record');
 const record=scope.ledger.get(evidence.evidence_id),had=ctx.ledger.has(evidence.evidence_id),previous=ctx.ledger.get(evidence.evidence_id);
 budget.check();ctx.ledger.set(evidence.evidence_id,record);
 try {budget.check();}catch(error){if(ctx.ledger.get(evidence.evidence_id)===record){if(had)ctx.ledger.set(evidence.evidence_id,previous);else ctx.ledger.delete(evidence.evidence_id);}throw error;}
 return evidence;
 } catch(error){budget.check();throw error;}finally {budget.cleanup();}
}
