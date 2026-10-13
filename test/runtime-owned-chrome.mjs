import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cdp, pause } from '../lib/browser-cdp.mjs';
import { boundedFixtureWait } from './runtime-fixture-waits.mjs';
const run=promisify(execFile),helper=fileURLToPath(new URL('./runtime-owned-chrome.ps1',import.meta.url));
async function os(mode,options){const argv=['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,'-Mode',mode];for(const [key,value]of Object.entries(options))argv.push('-'+key,typeof value==='string'?value:JSON.stringify(value));const r=await run(join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),argv,{shell:false,windowsHide:true,env:{SystemRoot:process.env.SystemRoot??'C:\\Windows'},timeout:mode==='exited'?20000:30000,maxBuffer:65536});return JSON.parse(r.stdout.trim());}
export async function captureOwnedChrome(executable,profile){if(process.platform!=='win32')throw new Error('The owned fixture OS Chrome adapter requires Windows.');try{return await os('capture',{OwnerPid:String(process.pid),OwnerExecutable:process.execPath,ChromeExecutable:executable,Profile:profile});}catch(cause){process.stderr.write('RUNTIME_FIXTURE OS capture failure '+JSON.stringify({code:cause.code,killed:cause.killed,signal:cause.signal,stdout:cause.stdout,stderr:cause.stderr})+'\n');throw cause;}}
export async function ownedChromeExited(identity){if(!identity)throw new Error('Owned Chrome OS identity was not captured; exit is unconfirmed.');return (await os('exited',{IdentityJson:identity})).exited;}
export async function closeOwnedChrome(browser,endpoint,identity){
 try{await boundedFixtureWait('Playwright graceful close',()=>browser.close(),{timeoutMs:10000});}catch{}
 if(await ownedChromeExited(identity))return;
 if(!endpoint)throw new Error('Owned fixture endpoint unavailable; Chrome exit is unconfirmed.');
 let client,endpointError;
 try{client=await Cdp.connect(endpoint);const processes=await client.send('SystemInfo.getProcessInfo');if(!processes.processInfo?.some(p=>p.type==='browser'&&Number(p.id)===identity.pid))throw new Error('Fixture endpoint no longer identifies its OS-confirmed owned Chrome root.');if(await ownedChromeExited(identity))return;await client.send('Browser.close');}catch(error){endpointError=error;}finally{client?.close();}
 if(await ownedChromeExited(identity))return;
 process.stderr.write('RUNTIME_FIXTURE owned browser attempting OS-revalidated root cleanup'+(endpointError?' after bounded endpoint error':'')+'\n');
 let forced,forceCause;try{forced=await os('force',{IdentityJson:identity});}catch(cause){forceCause=cause;}let stopped=false;await boundedFixtureWait('post-force actual OS root exit confirmation',async()=>{while(!stopped){if(await ownedChromeExited(identity))return;await pause(200);}throw forceCause??new Error('Owned Chrome actual OS exit remained unconfirmed.');},{timeoutMs:120000,onTimeout:()=>{stopped=true;}});process.stderr.write('RUNTIME_FIXTURE actual OS root exit confirmed after cleanup attempt; helper forced='+(forced?.forced===true)+'\n');
}
