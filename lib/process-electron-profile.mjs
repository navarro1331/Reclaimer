import {rm,lstat} from 'node:fs/promises';
import {resolve,dirname,basename} from 'node:path';
import {error} from './browser-cdp.mjs';

const retryable=new Set(['EBUSY','EPERM','ENOTEMPTY','EMFILE','ENFILE']);
const maximumAttempts=10;
// A single operation has at most ten removal attempts and 4500 ms of retry
// delays. Each filesystem call is awaited; no deletion continues in the
// background after a timeout is reported. A busy profile never grants process
// termination authority. The caller must first finish owned process cleanup.
export async function removeOwnedElectronProfile(base,profile,{remove=rm,inspect=lstat,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const parent=resolve(base),selected=resolve(profile);let attempts=0,retryDelayMs=0;
 const failure=(code,message,cause)=>{
  const result=error(code,message,'Inspect the retained owned profile and its file holders before retrying.');
  result.details={...result.details,stage:'electron-profile-removal',profile:selected,attempts,retry_delay_ms:retryDelayMs,maximum_attempts:maximumAttempts,residual_paths:[selected],cause_code:cause?.code??null};if(cause)result.cause=cause;return result;
 };
 if(dirname(selected)!==parent||!basename(selected).startsWith('real-electron-'))throw failure('OWNERSHIP_BOUNDARY','Electron profile cleanup escaped its allocated direct-child directory.');
 const present=async()=>{let entry;try{entry=await inspect(selected);}catch(cause){if(cause.code==='ENOENT')return false;throw cause;}if(entry.isSymbolicLink()||!entry.isDirectory())throw failure('OWNERSHIP_BOUNDARY','Electron profile was replaced with a non-directory or link; removal refused.');return true;};
 for(;;){
  attempts++;
  try{
   if(!await present())return {removed:true,attempts:attempts-1,retry_delay_ms:retryDelayMs};
   await remove(selected,{recursive:true,force:true});
   if(!await present())return {removed:true,attempts,retry_delay_ms:retryDelayMs};
   throw Object.assign(new Error('Owned Electron profile still exists after removal'),{code:'ENOTEMPTY'});
  }catch(cause){
   if(cause.code==='OWNERSHIP_BOUNDARY')throw cause;
   if(!retryable.has(cause.code)||attempts>=maximumAttempts)throw failure('CLEANUP_FAILED','Owned Electron profile removal could not be confirmed; its path is retained for inspection.',cause);
   const delay=Math.max(1,attempts)*100;retryDelayMs+=delay;await wait(delay);
  }
 }
}
