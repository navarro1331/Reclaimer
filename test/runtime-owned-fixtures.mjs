import { runtimeChrome, runtimeVendorRoot, runtimeElectronPath } from './runtime-provider-prerequisites.mjs';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { Context } from '../lib/core.mjs';
import { handlers } from '../lib/runtime.mjs';
import { pause, withPage } from '../lib/browser-cdp.mjs';
import { boundedFixtureWait, closeFixtureResources } from './runtime-fixture-waits.mjs';
import { captureOwnedChrome, closeOwnedChrome } from './runtime-owned-chrome.mjs';

export const root=fileURLToPath(new URL('../',import.meta.url));
export const vendorRoot=runtimeVendorRoot;
export const electronPath=runtimeElectronPath;
export async function ownedDirectory(t,label='fixture',automatic=true){
 const prefix=join(root,'test','runtime-gaps-'+label+'-'),dir=await mkdtemp(prefix);
 if(automatic)t.after(()=>removeOwnedDirectory(dir,prefix));return dir;
}
export async function removeOwnedDirectory(dir,prefix=join(root,'test','runtime-gaps-')){const selected=resolve(dir);assert.ok(selected.startsWith(resolve(prefix)));assert.ok(selected.startsWith(resolve(join(root,'test'))+sep));await rm(selected,{recursive:true,force:true});}
export function context(dir,config={}){const ctx=new Context({config:{temporaryDirectory:dir,...config}});ctx.handlers=handlers;return ctx;}
export async function ownedChrome(t,serve,options={}){
 const executable=await runtimeChrome(t);if(!executable)return null;
 const dir=await ownedDirectory(t,'chrome',false),sockets=new Set(),server=createServer(serve);server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 let identity,endpoint;const profile=join(dir,'profile');const browser=await chromium.launchPersistentContext(profile,{executablePath:executable,headless:true,viewport:{width:320,height:240},args:['--remote-debugging-port=0','--enable-experimental-web-platform-features',...options.args??[]],env:{SystemRoot:process.env.SystemRoot??'C:\\Windows',TEMP:dir,TMP:dir},timeout:30000});
 t.after(()=>closeFixtureResources({stopSockets:()=>{for(const socket of sockets)socket.destroy();},closeServer:()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())),closeBrowser:()=>closeOwnedChrome(browser,endpoint,identity),removeProfile:()=>removeOwnedDirectory(dir)},{browserMs:280000}));
 identity=await captureOwnedChrome(executable,profile);
 const page=browser.pages()[0];await page.goto(origin,{waitUntil:'load',timeout:30000});let port;
 for(let i=0;i<100;i++){try{port=(await readFile(join(dir,'profile','DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await pause(20);}}assert.ok(port);
 const ctx=context(dir),cdp_endpoint='http://127.0.0.1:'+port;endpoint=cdp_endpoint;const listed=(await ctx.call('list_browser_targets',{cdp_endpoint,allowed_origins:[origin]})).normalized_result;
 assert.equal(listed.targets.length,1);return {dir,server,sockets,browser,page,origin,ctx,request:{cdp_endpoint,target_id:listed.targets[0].target_id,allowed_origins:[origin]}};
}

export async function stopOwnedNavigationTimer(request){const controller=new AbortController();const reply=await boundedFixtureWait('post-session direct CDP timer cleanup',()=>withPage(request,{signal:controller.signal},({session})=>session.send('Runtime.evaluate',{expression:'(()=>{clearInterval(window.nav);window.nav=null;return window.nav===null;})()',returnByValue:true})),{timeoutMs:30000,onTimeout:()=>controller.abort()});assert.ok(!reply.exceptionDetails,'Owned timer cleanup reported a JavaScript exception');assert.equal(reply.result.type,'boolean');assert.equal(reply.result.value,true,'Owned navigation timer cleanup did not return its actual confirmation');}
