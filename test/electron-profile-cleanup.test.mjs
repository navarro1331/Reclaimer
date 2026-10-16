import test from 'node:test';
import assert from 'node:assert/strict';
import fsPromises,{mkdtemp,mkdir,writeFile,readFile,readdir,rm,lstat,realpath,symlink} from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {join,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {runtimeElectron} from './runtime-provider-prerequisites.mjs';
import {context,electronPath} from './runtime-owned-fixtures.mjs';
import {removeOwnedElectronProfile} from '../lib/process-electron-profile.mjs';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function absent(path){await assert.rejects(lstat(path),{code:'ENOENT'});}
async function workspace(t,canRemove=()=>true){const base=await realpath(tmpdir()),root=await mkdtemp(join(base,'reclaimer-electron-profile-'));t.after(async()=>{assert.equal(dirname(root),base);assert.ok(basename(root).startsWith('reclaimer-electron-profile-'));if(!canRemove()){t.diagnostic('Retained unconfirmed owned Electron cleanup fixture '+root);return;}await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});await absent(root);});return root;}

test('owned Electron profile cleanup rejects escapes and replacement files without removal',async t=>{
 const root=await workspace(t),sibling=join(root,'unowned'),replacement=join(root,'real-electron-replaced'),link=join(root,'real-electron-link');await mkdir(sibling);await writeFile(replacement,'owned replacement');await writeFile(join(sibling,'marker'),'owned sibling');await symlink(sibling,link,process.platform==='win32'?'junction':'dir');
 for(const selected of [root,sibling,join(root,'..','outside'),replacement,link])await assert.rejects(removeOwnedElectronProfile(root,selected),cause=>cause.code==='OWNERSHIP_BOUNDARY');
 assert.equal(await readFile(replacement,'utf8'),'owned replacement');assert.ok((await lstat(sibling)).isDirectory());assert.equal(await readFile(join(sibling,'marker'),'utf8'),'owned sibling');assert.ok((await lstat(link)).isSymbolicLink());
});
test('owned Electron profile cleanup confirms absence and refuses nonretryable filesystem errors',async t=>{
 const root=await workspace(t),profile=join(root,'real-electron-owned');await mkdir(profile);let calls=0;
 await assert.rejects(removeOwnedElectronProfile(root,profile,{remove:async()=>{calls++;throw Object.assign(new Error('Owned denied fixture'),{code:'EACCES'});},wait:async()=>assert.fail('Nonretryable error must not wait')}),cause=>cause.code==='CLEANUP_FAILED'&&cause.details.cause_code==='EACCES'&&cause.details.attempts===1&&cause.details.residual_paths[0]===profile);
 assert.equal(calls,1);assert.ok((await lstat(profile)).isDirectory());await rm(profile,{recursive:true});assert.deepEqual(await removeOwnedElectronProfile(root,profile),{removed:true,attempts:0,retry_delay_ms:0});
});
test('owned Electron profile cleanup uses one aggregate retry count and only ENOENT proves absence',async t=>{
 const root=await workspace(t),profile=join(root,'real-electron-owned');await mkdir(profile);const waits=[];let calls=0;
 await assert.rejects(removeOwnedElectronProfile(root,profile,{remove:async()=>{calls++;throw Object.assign(new Error('Owned persistent busy fixture'),{code:'EBUSY'});},wait:async ms=>waits.push(ms)}),cause=>cause.code==='CLEANUP_FAILED'&&cause.details.attempts===10&&cause.details.retry_delay_ms===4500&&cause.details.cause_code==='EBUSY');assert.equal(calls,10);assert.equal(waits.reduce((sum,ms)=>sum+ms,0),4500);
 await assert.rejects(removeOwnedElectronProfile(root,profile,{inspect:async()=>{throw Object.assign(new Error('Owned inspection denied'),{code:'EACCES'});}}),cause=>cause.code==='CLEANUP_FAILED'&&cause.details.attempts===1);assert.ok((await lstat(profile)).isDirectory());
 let inspections=0;await assert.rejects(removeOwnedElectronProfile(root,profile,{inspect:async()=>{inspections++;throw Object.assign(new Error('Owned busy inspection'),{code:'EBUSY'});},wait:async()=>{}}),cause=>cause.code==='CLEANUP_FAILED'&&cause.details.attempts===10);assert.equal(inspections,10);
 let transientCalls=0;const transientWaits=[],removed=await removeOwnedElectronProfile(root,profile,{remove:async(...args)=>{if(++transientCalls<3)throw Object.assign(new Error('Owned transient busy'),{code:'EBUSY'});return rm(...args);},wait:async ms=>transientWaits.push(ms)});assert.deepEqual(removed,{removed:true,attempts:3,retry_delay_ms:300});assert.equal(transientCalls,3);assert.deepEqual(transientWaits,[100,200]);await absent(profile);
});

const lockSource=`param([string]$FilePath)
$ErrorActionPreference='Stop'
$held=[IO.File]::Open($FilePath,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try{[Console]::Out.WriteLine('READY');[Console]::Out.Flush();$null=[Console]::In.ReadLine()}finally{$held.Dispose()}
[Console]::Out.WriteLine('RELEASED');[Console]::Out.Flush()
`;
async function lockFile(root,file){
 const script=join(root,'owned-lock.ps1');await writeFile(script,lockSource,{flag:'wx'});const executable=join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),child=spawn(executable,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-FilePath',file],{shell:false,windowsHide:true,env:{SystemRoot:process.env.SystemRoot??'C:\\Windows'},stdio:['pipe','pipe','pipe']});let output='',stderr='',closed=false,exitCode=null,spawnError=null;const closedPromise=new Promise(resolve=>child.once('close',code=>{closed=true;exitCode=code;resolve();}));child.once('error',cause=>{spawnError=cause;});child.stdout.on('data',bytes=>output+=bytes.toString());child.stderr.on('data',bytes=>stderr+=bytes.toString());child.stdin.on('error',()=>{});
 const release=()=>{if(!child.stdin.writableEnded)child.stdin.end('release\n');},waitClosed=async()=>{let timer;try{await Promise.race([closedPromise,new Promise(resolve=>{timer=setTimeout(resolve,5000);})]);}finally{clearTimeout(timer);}};
 const stop=async()=>{if(!closed){release();await waitClosed();if(!closed){child.kill('SIGKILL');await waitClosed();}}assert.equal(closed,true,'Owned file-lock helper exit must be physical');if(spawnError&&!child.pid)return;assert.equal(exitCode,0,stderr);assert.equal(stderr,'');};
 try{const until=Date.now()+15000;while(!output.includes('READY')&&!closed&&!spawnError&&Date.now()<until)await sleep(25);if(spawnError)throw spawnError;assert.match(output,/^READY\r?\n/);assert.equal(closed,false);return {child,release,stop};}catch(cause){try{await stop();}catch(cleanup){throw Object.assign(new AggregateError([cause,cleanup],'Owned file-lock startup failed and cleanup could not be confirmed'),{cleanup_unconfirmed:!closed,owned_lock_pid:child.pid??null});}throw cause;}
}
async function profile(root){const until=Date.now()+15000;for(;;){const entries=(await readdir(root)).filter(name=>name.startsWith('real-electron-'));if(entries.length){assert.equal(entries.length,1);return join(root,entries[0]);}if(Date.now()>=until)throw new Error('Owned Electron profile allocation did not complete');await sleep(25);}}
async function fixture(root){
 const main=join(root,'main.cjs'),html=join(root,'index.html'),gate=join(root,'gate'),pidFile=join(root,'electron-pid');
 await writeFile(html,'<button id="ready" disabled>Ready</button>');
 await writeFile(main,`const {app,BrowserWindow}=require('electron');const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(pidFile)},String(process.pid));app.whenReady().then(async()=>{const win=new BrowserWindow({show:false});await win.loadFile(${JSON.stringify(html)});const poll=setInterval(()=>{if(fs.existsSync(${JSON.stringify(gate)})){clearInterval(poll);win.webContents.executeJavaScript("document.querySelector('#ready').disabled=false");}},20);});`);
 return {gate,pidFile,args:{executable_path:electronPath,application_path:main,application_root:root,actions:[{step_id:'allow-lock-helper',kind:'wait',duration_ms:6000},{step_id:'owned-lock-ready',kind:'click',selector:'#ready'}]}};
}
for(const mode of ['release','persistent','cancel','invalid-output'])test('genuine Electron owned profile lock '+mode+' preserves cleanup and evidence transaction',{timeout:240000},async t=>{
 if(process.platform!=='win32'){t.skip('This owned FileShare.None lock fixture verifies Windows file-deletion semantics.');return;}
 if(!await runtimeElectron(t))return;let cleanupConfirmed=false,helperCleanupUnconfirmed=false;const root=await workspace(t,()=>cleanupConfirmed),owned=await fixture(root),ctx=context(root),controller=new AbortController();ctx.signal=controller.signal;await ctx.evidence('owned-prior-evidence',{}, {owned:true},{subject:null});const before=structuredClone([...ctx.ledger]),priorHistory=structuredClone(ctx.history),original=ctx.evidence.bind(ctx),originalRemove=fsPromises.rm;let holder,selected,releaseTimer,evidenceReached=false,heldFailures=0,profileRemoveCalls=0;
 // Preserve the real OS failure and release only after removal has actually
 // encountered our locked file. Wall-clock release before traversal is flaky.
 fsPromises.rm=async(target,options)=>{if(selected&&target===selected)profileRemoveCalls++;try{return await originalRemove(target,options);}catch(cause){if(selected&&target===selected&&cause.path===join(selected,'owned-exclusive.tmp')&&cause.code==='EBUSY'){heldFailures++;if(heldFailures===1&&mode!=='persistent')releaseTimer=setTimeout(()=>{if(mode==='cancel')controller.abort(new Error('Owned cleanup-window cancellation'));holder.release();},25);}throw cause;}};syncBuiltinESMExports();
 ctx.evidence=(operation,args,result,options)=>{if(operation!=='capture_electron_scenario')return original(operation,args,result,options);evidenceReached=true;assert.ok(holder,'The OS lock must precede capture cleanup');assert.deepEqual([...ctx.ledger],before);const pending=original(operation,args,result,options);return mode==='invalid-output'?pending.then(envelope=>{envelope.normalized_result.application.process_ownership='external-invalid-owned-test';return envelope;}):pending;};
 let operation;try{
  operation=ctx.call('capture_electron_scenario',owned.args);operation.catch(()=>{});selected=await profile(root);holder=await lockFile(root,join(selected,'owned-exclusive.tmp'));await writeFile(owned.gate,'ready',{flag:'wx'});
  if(mode==='release'){const envelope=await operation;assert.equal(envelope.normalized_result.application.cleanup,'terminated-owned-process');assert.ok(envelope.normalized_result.actions.every(action=>action.status==='completed'));assert.equal(ctx.ledger.size,before.length+1);assert.deepEqual(ctx.ledger.get(envelope.evidence_id),envelope);await absent(selected);}
  else{await assert.rejects(operation,cause=>{t.diagnostic('Owned cleanup rejection '+JSON.stringify({mode,code:cause.code,held_failures:heldFailures,removal_calls:profileRemoveCalls,prior_evidence:before.length,current_evidence:ctx.ledger.size,prior_history:priorHistory.length,current_history:ctx.history.length}));return mode==='persistent'?cause.code==='CLEANUP_FAILED'&&cause.details.cause_code==='EBUSY'&&cause.details.attempts===10&&cause.details.profile===selected:mode==='cancel'?cause.code==='cancelled'||cause.message==='Owned cleanup-window cancellation':cause.code==='contract';});assert.deepEqual([...ctx.ledger],before);assert.deepEqual(ctx.history,priorHistory);if(mode==='persistent')assert.ok((await lstat(selected)).isDirectory());else await absent(selected);}
  assert.ok(heldFailures>0,'Actual Windows removal must encounter the owned exclusive lock');if(mode==='persistent')assert.equal(profileRemoveCalls,10);else assert.ok(profileRemoveCalls>1,'A real failed removal must precede successful retry');assert.equal(evidenceReached,true);const pid=Number(await readFile(owned.pidFile,'utf8'));assert.ok(pid>0);assert.throws(()=>process.kill(pid,0),cause=>cause.code==='ESRCH');t.diagnostic('Owned Electron root '+pid+' absent; locked profile mode '+mode+' verified with '+profileRemoveCalls+' removal calls.');
 }catch(cause){helperCleanupUnconfirmed=cause.cleanup_unconfirmed===true;throw cause;}finally{clearTimeout(releaseTimer);try{await holder?.stop();if(operation)await operation.catch(()=>{});try{const pid=Number(await readFile(owned.pidFile,'utf8'));if(pid>0)try{process.kill(pid,0);}catch(cause){if(cause.code==='ESRCH')cleanupConfirmed=!helperCleanupUnconfirmed;else throw cause;}}catch(cause){if(cause.code!=='ENOENT')throw cause;}}finally{fsPromises.rm=originalRemove;syncBuiltinESMExports();}}
});
