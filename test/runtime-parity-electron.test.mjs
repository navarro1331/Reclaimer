import { runtimeElectron } from './runtime-provider-prerequisites.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {context,root,electronPath} from './runtime-owned-fixtures.mjs';

async function fixture(t,mode='ipc'){
 const dir=await mkdtemp(join(root,'test/runtime-parity-electron-')),appDir=join(dir,'app');await mkdir(appDir);const main=join(appDir,'main.cjs'),pidPath=join(dir,'root-pid.txt'),effects=join(dir,'effects.json');let rootEnded=false;
 t.after(async()=>{if(rootEnded)await rm(dir,{recursive:true,force:true});else t.diagnostic('Retained unconfirmed owned Electron fixture '+dir);});
 const mainSource=`const {app,BrowserWindow,ipcMain}=require('electron');const fs=require('node:fs');const mode=${JSON.stringify(mode)},effects=${JSON.stringify(effects)};fs.writeFileSync(${JSON.stringify(pidPath)},String(process.pid));const originalHandle=ipcMain.handle;
 if(mode==='forced')app.on('before-quit',e=>e.preventDefault());
 ipcMain.on('owned-note',(e,payload)=>fs.writeFileSync(effects,JSON.stringify({note:payload.n})));
 ipcMain.on('owned-register',e=>{if(mode==='conflict')ipcMain.handle=originalHandle;ipcMain.handle('owned-sum',(_event,value)=>{const answer=value.left+value.right;fs.writeFileSync(effects,JSON.stringify({note:4,answer}));return {answer};});e.sender.send('owned-ready');});
 ipcMain.on('owned-block',()=>setTimeout(()=>{fs.writeFileSync(effects,'blocking');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);},250));
 app.whenReady().then(()=>{const w=new BrowserWindow({show:false,webPreferences:{preload:${JSON.stringify(join(appDir,'preload.cjs'))}}});w.loadFile(${JSON.stringify(join(appDir,'index.html'))});});
 if(mode==='conflict')app.on('before-quit',()=>fs.appendFileSync(effects,';restored='+String(ipcMain.handle===originalHandle)));`;
 new Script(mainSource,{filename:main});await writeFile(main,mainSource);
 await writeFile(join(appDir,'preload.cjs'),`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('owned',{run:async()=>{ipcRenderer.send('owned-note',{n:4,label:'private-fixture-value'});await new Promise(r=>{ipcRenderer.once('owned-ready',r);ipcRenderer.send('owned-register');});return await ipcRenderer.invoke('owned-sum',{left:7,right:9});},block:()=>ipcRenderer.send('owned-block')});`);
 await writeFile(join(appDir,'index.html'),`<button id="send">Send</button><button id="block">Block</button><output id="value">Ready</output><script>document.querySelector('#send').onclick=async()=>{const result=await owned.run();document.querySelector('#value').textContent=String(result.answer)};document.querySelector('#block').onclick=()=>owned.block();</script>`);
 return {dir,appDir,main,pidPath,effects,async confirm(){const pid=Number(await readFile(pidPath,'utf8'));assert.ok(pid>0);assert.throws(()=>process.kill(pid,0),e=>e.code==='ESRCH');assert.equal((await readdir(dir)).filter(n=>n.startsWith('real-electron-')).length,0);rootEnded=true;t.diagnostic('Owned Electron root '+pid+' absent; generated provider profile removed.');}};
}
const input=x=>({executable_path:electronPath,application_path:x.main,application_root:x.appDir,actions:[{step_id:'send',kind:'click',selector:'#send'},{step_id:'settle',kind:'wait',duration_ms:500}]});
test('genuine Electron observes real send/receive and future invoke shapes with application effects',async t=>{
 if(!await runtimeElectron(t))return;const x=await fixture(t),captured=(await context(x.dir).call('capture_electron_scenario',input(x))).normalized_result;
 assert.equal(captured.application.electron_version,'44.7.0');assert.ok(captured.actions.every(a=>a.status==='completed'),JSON.stringify(captured.actions));assert.deepEqual(JSON.parse(await readFile(x.effects,'utf8')),{note:4,answer:16});
 const rows=captured.ipc.events;t.diagnostic('Observed IPC '+JSON.stringify(rows));assert.ok(rows.some(e=>e.kind==='ipc-renderer-send'&&e.channel==='owned-note'&&e.direction==='renderer-to-main'));assert.ok(rows.some(e=>e.kind==='ipc-main-to-renderer'&&e.channel==='owned-ready'&&e.phase==='completed'));
 const invocation=rows.find(e=>e.kind==='main-handler-invocation'&&e.phase==='completed'&&e.channel==='owned-sum');assert.ok(invocation);assert.match(invocation.result_shape,/answer:number/);assert.ok(rows.some(e=>e.correlation_id===invocation.correlation_id&&e.phase==='attempted'));assert.equal(JSON.stringify(rows).includes('private-fixture-value'),false);
 assert.equal(captured.ipc.observed,rows.length);assert.equal(captured.ipc.dropped,0);assert.ok(captured.coverage.observed_roles.includes('main'));assert.ok(captured.coverage.unavailable_event_families.includes('pre-attachment-invoke-handlers'));assert.equal(captured.coverage.status,'partial_attach');await x.confirm();
});
test('genuine Electron hook conflict preserves application replacement rather than overwriting it',async t=>{
 if(!await runtimeElectron(t))return;const x=await fixture(t,'conflict'),captured=(await context(x.dir).call('capture_electron_scenario',input(x))).normalized_result;assert.ok(captured.actions.every(a=>a.status==='completed'));assert.equal(captured.coverage.status,'hook_conflict');assert.match(await readFile(x.effects,'utf8'),/restored=true/);assert.ok(captured.ipc.events.some(e=>e.channel==='owned-register'));await x.confirm();
});
test('genuine Electron scenario exercises integrated forced cleanup after real quit prevention',async t=>{
 if(!await runtimeElectron(t))return;const x=await fixture(t,'forced'),captured=(await context(x.dir).call('capture_electron_scenario',input(x))).normalized_result;assert.ok(captured.actions.every(a=>a.status==='completed'));assert.deepEqual(JSON.parse(await readFile(x.effects,'utf8')),{note:4,answer:16});assert.ok(captured.windows.length>0);assert.ok(captured.limitations.some(s=>s.includes('OS-verified forced termination')));await x.confirm();
});
test('genuine blocked Electron main preserves unavailable snapshots and uses owned forced cleanup',async t=>{
 if(!await runtimeElectron(t))return;const x=await fixture(t,'blocked'),request=input(x);request.actions=[{step_id:'block',kind:'click',selector:'#block'},{step_id:'settle',kind:'wait',duration_ms:800}];const captured=(await context(x.dir).call('capture_electron_scenario',request)).normalized_result;assert.ok(captured.actions.every(a=>a.status==='completed'),JSON.stringify(captured.actions));assert.deepEqual(captured.windows,[]);assert.deepEqual(captured.processes.items,[]);assert.ok(captured.coverage.unavailable_event_families.includes('window-metadata'));assert.ok(captured.coverage.unavailable_event_families.includes('process-metrics'));assert.ok(captured.coverage.unavailable_event_families.includes('ipc'));assert.ok(captured.limitations.some(s=>s.includes('OS-verified forced termination')));await x.confirm();
});