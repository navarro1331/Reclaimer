import test from 'node:test';
import assert from 'node:assert/strict';
import { win32, posix, join } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { electronRootExitConfirmed, electronProfileContained, captureElectronOwnership, electronRootExited, terminateElectronOwned } from '../lib/process-electron-owner.mjs';

test('same creation with changed executable leaves root exit unconfirmed',()=>{
 const expected={pid:123,creation:'owned-start',executable:'/owned/app'};
 assert.equal(electronRootExitConfirmed(expected,{...expected}),false);
 assert.equal(electronRootExitConfirmed(expected,null),true);
 assert.equal(electronRootExitConfirmed(expected,{...expected,creation:'later-start',executable:'/another/app'}),true);
 assert.throws(()=>electronRootExitConfirmed(expected,{...expected,executable:'/changed/app'}),e=>e.code==='OWNERSHIP_BOUNDARY'&&/exit is unconfirmed/.test(e.message));
 assert.throws(()=>electronRootExitConfirmed(expected,{...expected,pid:124}),/selected root PID/);
});
test('Windows drive and UNC root profile containment rejects base and escapes',()=>{
 const cases=[['C:\\','C:\\real-electron-owned',true],['C:\\','C:\\',false],['C:\\temp','c:\\temp\\profile',true],['C:\\temp','C:\\temp',false],['C:\\temp','C:\\temp\\..',false],['C:\\temp','C:\\temp-other\\profile',false],['C:\\temp','D:\\temp\\profile',false],['C:\\temp','C:\\temp\\..owned\\profile',true],['\\\\server\\share\\','\\\\server\\share\\profile',true],['\\\\server\\share\\','\\\\server\\other\\profile',false]];
 for(const [base,profile,expected]of cases)assert.equal(electronProfileContained(base,profile,win32),expected,base+' -> '+profile);
});
test('POSIX root profile containment rejects base and parent/sibling escapes',()=>{
 const cases=[['/','/real-electron-owned',true],['/','/',false],['/tmp','/tmp/profile',true],['/tmp','/tmp',false],['/tmp','/tmp/..',false],['/tmp','/tmp-other/profile',false],['/tmp','/tmp/../outside',false],['/tmp','/tmp/..owned/profile',true],['/tmp','/tmp/./profile',true]];
 for(const [base,profile,expected]of cases)assert.equal(electronProfileContained(base,profile,posix),expected,base+' -> '+profile);
});
test('real owned Windows Node root executable mismatch rejects without killing the live child',{skip:process.platform!=='win32'},async()=>{
 const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{shell:false,windowsHide:true,env:{SystemRoot:process.env.SystemRoot??'C:\\Windows'},stdio:'ignore'});let ownership;
 try{await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});ownership=await captureElectronOwnership(child,process.execPath);assert.equal(await electronRootExited(ownership,child),false);const mismatched={...ownership,root:{...ownership.root,executable:ownership.root.executable+'.expected-mismatch'}};await assert.rejects(()=>electronRootExited(mismatched,child),/exit is unconfirmed/);for(const role of ['wrapper','root'])for(const field of ['creation','executable']){const changed={...ownership,[role]:{...ownership[role],[field]:ownership[role][field]+'.expected-mismatch'}};await assert.rejects(()=>terminateElectronOwned(changed,child),/identity changed/);}assert.equal(child.exitCode,null);assert.doesNotThrow(()=>process.kill(child.pid,0));}
 finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');let timer;try{if(child.exitCode===null&&child.signalCode===null)await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Owned Node child cleanup deadline elapsed')),5000);})]);}finally{clearTimeout(timer);}}
 if(ownership)assert.equal(await electronRootExited(ownership,child),true);
});

const runOwnerHelper=promisify(execFile),ownerHelperPath=fileURLToPath(new URL('../lib/process-electron-owner.ps1',import.meta.url));
async function directOwnedTermination(ownership){const r=await runOwnerHelper(join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',ownerHelperPath,'-Mode','terminate','-WrapperPid',String(ownership.wrapper.pid),'-Executable',ownership.selected_executable,'-IdentityJson',JSON.stringify(ownership)],{shell:false,windowsHide:true,env:{SystemRoot:process.env.SystemRoot??'C:\\Windows'},timeout:15000,maxBuffer:65536});return JSON.parse(r.stdout.trim());}
async function ownedNode(){
 const child=spawn(process.execPath,['-e',"process.stdin.resume();process.stdin.once('data',()=>process.exit(0));process.stdout.write('READY\\n');"],{shell:false,windowsHide:true,env:{SystemRoot:process.env.SystemRoot??'C:\\Windows'},stdio:['pipe','pipe','ignore']});
 try{
  // OS process creation does not establish that the owned command handler is ready.
  await new Promise((resolve,reject)=>{
   let output='';
   const finish=error=>{clearTimeout(timer);child.stdout.off('data',onData);child.off('error',onError);child.off('exit',onExit);error?reject(error):resolve();};
   const onData=chunk=>{output+=chunk.toString('utf8');if(output.length>1024)finish(new Error('Owned Node readiness output exceeded'));else if(output==='READY\n')finish();};
   const onError=error=>finish(error),onExit=()=>finish(new Error('Owned Node exited before readiness'));
   const timer=setTimeout(()=>finish(new Error('Owned Node readiness deadline elapsed')),15000);
   child.stdout.on('data',onData);child.once('error',onError);child.once('exit',onExit);
  });
  return child;
 }catch(error){await stopOwnedNode(child);throw error;}
}
async function awaitOwnedExit(child){if(child.exitCode!==null||child.signalCode!==null)return;let timer;try{await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Owned Node child exit deadline elapsed')),5000);})]);}finally{clearTimeout(timer);}}
async function stopOwnedNode(child){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await awaitOwnedExit(child);}
test('Windows helper termination after captured actual launcher/root exit returns no termination',{skip:process.platform!=='win32'},async t=>{
 const child=await ownedNode();let ownership;
 try{ownership=await captureElectronOwnership(child,process.execPath);assert.equal(await electronRootExited(ownership,child),false);child.stdin.end('exit');await awaitOwnedExit(child);assert.equal(child.exitCode,0);assert.equal(await electronRootExited(ownership,child),true);const result=await directOwnedTermination(ownership);assert.deepEqual(result,{terminated:false,exited:true,pid:ownership.root.pid});assert.equal(await terminateElectronOwned(ownership,child),false);t.diagnostic('Captured owned Node root '+ownership.root.pid+' exited before direct helper terminate; no termination issued.');}finally{await stopOwnedNode(child);}
});
test('Windows helper refuses absent launcher with still-live matching root and preserves live mismatch rejection',{skip:process.platform!=='win32'},async t=>{
 const live=await ownedNode();let departed,liveOwnership,departedOwnership;
 try{departed=await ownedNode();liveOwnership=await captureElectronOwnership(live,process.execPath);departedOwnership=await captureElectronOwnership(departed,process.execPath);departed.stdin.end('exit');await awaitOwnedExit(departed);assert.equal(await electronRootExited(departedOwnership,departed),true);const invalidLauncher={...liveOwnership,wrapper:departedOwnership.wrapper};await assert.rejects(()=>directOwnedTermination(invalidLauncher),/launcher is absent while the original root remains live; termination refused/);for(const field of ['creation','executable']){const changed={...invalidLauncher,root:{...invalidLauncher.root,[field]:invalidLauncher.root[field]+'.expected-mismatch'}};await assert.rejects(()=>directOwnedTermination(changed),/identity changed; original root exit is unconfirmed/);}assert.equal(await electronRootExited(liveOwnership,live),false);assert.equal(live.exitCode,null);assert.doesNotThrow(()=>process.kill(live.pid,0));t.diagnostic('Absent owned launcher record was deliberately paired with live owned root '+liveOwnership.root.pid+' as a negative lineage fixture; no root termination.');}finally{try{await stopOwnedNode(live);}finally{if(departed)await stopOwnedNode(departed);}}
});
