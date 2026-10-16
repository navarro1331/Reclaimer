import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {decodeInstallerCodec,installerCodecFailureReceipt} from './lib/artifact-installer-codecs.mjs';

const source='/proof/held.py',observations=[];
const absent=pid=>{try{process.kill(pid,0);return false;}catch(error){if(error.code==='ESRCH')return true;throw error;}};
for(const mode of ['cancelled','timeout','overflow']){
 const marker='/artifacts/'+mode+'.ready',controller=new AbortController(),reason=Object.freeze(new Error('Owned POSIX codec cancellation')),started=Date.now(),pending=decodeInstallerCodec(Buffer.from('owned'),{encoding:'application/x-xz',expectedSize:1,pythonArgv:['/usr/bin/python3',source,marker,mode],signal:mode==='cancelled'?controller.signal:undefined,timeoutMs:mode==='timeout'?1500:15000}).then(()=>({completed:true}),error=>({error}));
 if(mode==='cancelled'){let ready=false;try{const until=Date.now()+10000;while(Date.now()<until){if(await fs.access(marker).then(()=>true,()=>false)){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}}finally{controller.abort(reason);}assert.equal(ready,true);}
 const {error}=await pending;assert.ok(error);if(mode==='cancelled')assert.equal(error,reason);const receipt=installerCodecFailureReceipt(error);assert.ok(receipt?.pid);assert.equal(receipt.argv.includes('-B'),true);assert.equal(receipt.forced_kill,true);assert.equal(receipt.physical_exit,true);assert.equal(receipt.process_closed,true);assert.equal(receipt.cleanup_unconfirmed,false);assert.equal(receipt.workspace_cleanup,true);assert.equal(absent(receipt.pid),true);const markerValue=JSON.parse(await fs.readFile(marker,'utf8'));assert.equal(markerValue.dont_write_bytecode,true);assert.ok(Date.now()-started<20000);if(mode==='timeout')assert.equal(receipt.timed_out,true);if(mode==='overflow')assert.equal(receipt.output_overflow,true);observations.push({case:mode,success:true,exact_cancel_reason:mode==='cancelled'?error===reason:null,ready:markerValue,physical_absence_observed:true,process:receipt});
}
await fs.writeFile('/artifacts/POSIX_CODEC_PROOF.json',JSON.stringify({schema:'reclaimer-posix-codec-proof-v1',success:true,platform:process.platform,node:process.version,observations},null,2));
