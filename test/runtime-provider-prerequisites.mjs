import {access,stat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {basename,delimiter,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const runtimeVendorRoot=process.env.REAL_TEST_VENDOR_ROOT?resolve(process.env.REAL_TEST_VENDOR_ROOT):fileURLToPath(new URL('./runtime-vendors/',import.meta.url));
export const runtimeElectronPath=process.env.REAL_TEST_ELECTRON?resolve(process.env.REAL_TEST_ELECTRON):process.env.REAL_TEST_ELECTRON??join(runtimeVendorRoot,'electron-44.7.0','runtime','electron.exe');
const supportedHosts=['win32','linux','darwin'];
async function executableState(path,platform){
 try{if(!path||path.includes('\0'))return 'configuration-invalid';const entry=await stat(path);if(!entry.isFile())return 'not-regular-file';await access(path,platform==='win32'?constants.F_OK:constants.X_OK);return null;}
 catch(cause){return ['ENOENT','ENOTDIR'].includes(cause.code)?'executable-missing':cause.code==='EACCES'?'not-executable':'executable-unavailable';}
}
export async function inspectRuntimeExecutable({provider,envName,defaults=[],names=[],platforms=supportedHosts},{env=process.env,platform=process.platform}={}){
 const base={provider,platform,env_name:envName??null,available:false,executable:null,source:null,reason:null};
 if(!platforms.includes(platform))return {...base,reason:'fixture-platform-unavailable'};
 const configured=envName&&Object.hasOwn(env,envName)?env[envName]:undefined;
 if(configured!==undefined){const path=typeof configured==='string'&&configured.length?resolve(configured):null,reason=await executableState(path,platform);return {...base,source:'configured',available:reason===null,executable:reason===null?path:null,reason};}
 for(const path of defaults)if(await executableState(path,platform)===null)return {...base,available:true,executable:path,source:'standard-location'};
 for(const entry of (env.PATH??env.Path??'').split(delimiter).filter(Boolean))for(const name of names){const directory=entry.replace(/^"(.*)"$/,'$1'),path=join(directory,name);if(platform==='win32'&&/[/\\]Microsoft[/\\]WindowsApps[/\\]/i.test(path))continue;if(await executableState(path,platform)===null)return {...base,available:true,executable:path,source:'PATH'};}
 return {...base,source:'discovery',reason:'executable-missing'};
}
export function runtimeDisposition(record,{env=process.env}={}){return record.available?'run':env.REAL_RUN_RUNTIME_VARIATIONS==='1'?'fail':'skip';}
export function applyRuntimePrerequisite(t,record,options={}){
 const disposition=runtimeDisposition(record,options),receipt={provider:record.provider,platform:record.platform,available:record.available,source:record.source,env_name:record.env_name,reason:record.reason,disposition};
 t.diagnostic('Runtime prerequisite '+JSON.stringify(receipt));
 if(disposition==='fail'){const error=new Error('Required runtime fixture prerequisite unavailable: '+record.provider+' ('+record.reason+').');error.code='RUNTIME_PREREQUISITE_UNAVAILABLE';throw error;}
 if(disposition==='skip'){t.skip('Runtime fixture prerequisite unavailable: '+record.provider+' ('+record.reason+').');return null;}
 return record.executable;
}
export async function runtimeChrome(t){return applyRuntimePrerequisite(t,await inspectRuntimeExecutable({provider:'owned-Chromium',envName:'REAL_TEST_CHROME',platforms:['win32'],defaults:['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'],names:['chrome.exe']}));}
export async function runtimeElectron(t){return runtimeFile(t,runtimeElectronPath,'owned-Electron',{envName:'REAL_TEST_ELECTRON'});}
export async function runtimeFile(t,path,provider,{envName=null,platforms=['win32']}={}){
 const record=await inspectRuntimeExecutable({provider,envName,platforms,defaults:[path]});record.source=envName&&Object.hasOwn(process.env,envName)?'configured':'fixture-location';return applyRuntimePrerequisite(t,record);
}
export async function runtimePython(t){const path=applyRuntimePrerequisite(t,await inspectRuntimeExecutable({provider:'owned-Python-regex',envName:'REAL_TEST_PYTHON',names:process.platform==='win32'?['python.exe','python3.exe']:['python3','python']}));return path?{executable:path,args:[...(process.platform==='win32'&&basename(path).toLowerCase()==='py.exe'?['-3']:[]),'-I','-B']}:null;}
export async function runtimePowerShell(t){
 const executable=applyRuntimePrerequisite(t,await inspectRuntimeExecutable({provider:'owned-WPF-UIA',envName:'REAL_TEST_POWERSHELL',platforms:['win32'],defaults:[join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe')]}));
 if(!executable)return null;const paths=['Framework64','Framework'].map(name=>join(process.env.SystemRoot??'C:\\Windows','Microsoft.NET',name,'v4.0.30319','WPF','PresentationFramework.dll'));
 const assembly=await inspectRuntimeExecutable({provider:'owned-WPF-assembly',platforms:['win32'],defaults:paths});if(!applyRuntimePrerequisite(t,assembly))return null;return executable;
}
