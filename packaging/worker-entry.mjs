import assert from 'node:assert/strict';
import {readFile,writeFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {engine} from '../lib/engine.mjs';
const input=await realpath(process.argv[2]??''),artifacts=await realpath(process.argv[3]??'');
assert.ok(input.startsWith('/project/'),'Input must be inside the explicit read-only project mount');assert.equal(artifacts,'/artifacts');
const sha=b=>createHash('sha256').update(b).digest('hex'),before=sha(await readFile(input)),ctx=await engine();let result;
try{await ctx.call('open_binary',{path:input});result=await ctx.call('binary_overview',{});}finally{if(ctx.nativeSession)await ctx.call('close_binary',{});}
const after=sha(await readFile(input));assert.equal(after,before);assert.equal(result.subject.digest.sha256,before);
await writeFile(path.join(artifacts,'binary-overview.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
const receipt={status:'pass',node:process.version,platform:process.platform,architecture:process.arch,input_sha256:before,source_preserved:true,operation:result.operation,network:'none required by launch argv',mounts:'explicit read-only /project and writable /artifacts',client_activation:'pending',worker_registration:false};await writeFile(path.join(artifacts,'worker-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt));
