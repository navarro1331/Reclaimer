import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,readFile,writeFile,cp,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {inspectRuntimeExecutable,applyRuntimePrerequisite} from './runtime-provider-prerequisites.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),execute=promisify(execFile);
const files=['lib/core.mjs','lib/contracts.mjs','lib/api-contracts.json','lib/operation-commit.mjs','lib/session-observations.mjs','lib/browser-cdp.mjs','lib/process-native.mjs','lib/process-native-linux.mjs','test/runtime-completion-linux-ui-producer.test.mjs',...['Dockerfile','owned-gtk.py','owned-spoof.py','helper-launcher.py','verify.mjs'].map(f=>'test/fixtures/runtime-linux-ui/'+f)];
async function snapshot(){return Promise.all(files.map(async file=>{const bytes=await readFile(join(root,file));return {file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}));}

test('actual isolated Linux X11 and AT-SPI UI preserves selected ownership, effects, cancellation and cleanup',{timeout:240000},async t=>{
 const docker=applyRuntimePrerequisite(t,await inspectRuntimeExecutable({provider:'owned-Linux-X11-AT-SPI-container',envName:'REAL_TEST_DOCKER',names:process.platform==='win32'?['docker.exe']:['docker']}));if(!docker)return;
 const image=process.env.REAL_TEST_LINUX_UI_IMAGE??'reclaimer-owned-linux-ui:six-area-20261016';assert.match(image,/^[a-z0-9][a-z0-9._:/@-]*$/);
 const before=await snapshot(),base=await realpath(tmpdir()),workspace=await mkdtemp(join(base,'reclaimer-linux-ui-')),project=join(workspace,'project');await mkdir(project);await mkdir(join(project,'lib'));
 const evidence=process.env.RECLAIMER_RECOVERY_EVIDENCE?resolve(process.env.RECLAIMER_RECOVERY_EVIDENCE,'runtime-linux-ui-'+randomUUID()):await mkdtemp(join(base,'reclaimer-linux-ui-evidence-')),artifacts=join(evidence,'artifacts');await mkdir(artifacts,{recursive:true});
 const calls=[];let id,ownedName,receipt,success=false;
 async function run(args,{timeout=30000,signal=t.signal,allowFailure=false}={}){let result;try{const value=await execute(docker,args,{shell:false,windowsHide:true,timeout,signal,maxBuffer:4*1024*1024,encoding:'utf8'});result={exit_code:0,stdout:value.stdout,stderr:value.stderr};}catch(cause){result={exit_code:Number.isInteger(cause.code)?cause.code:null,signal:cause.signal??null,killed:!!cause.killed,stdout:cause.stdout??'',stderr:cause.stderr??'',message:cause.message};}calls.push({argv:[docker,...args],...result});await writeFile(join(evidence,'DOCKER_CALLS.json'),JSON.stringify(calls,null,2));if(!allowFailure)assert.equal(result.exit_code,0,result.stderr||result.message);return result;}
 try{
  const selectedImage=await run(['image','inspect',image]);const inventory=JSON.parse(selectedImage.stdout)[0];assert.equal(inventory.Config.Labels['reclaimer.owned-proof'],'six-area-linux-ui-20261016');
  for(const file of files.filter(f=>f.startsWith('lib/')))await cp(join(root,file),join(project,file));
  for(const file of ['owned-gtk.py','owned-spoof.py','helper-launcher.py','verify.mjs'])await cp(join(root,'test/fixtures/runtime-linux-ui',file),join(project,file));
  await writeFile(join(project,'package.json'),JSON.stringify({name:'owned-linux-ui-proof',private:true,type:'module'}));
  for(const name of ['ajv','ajv-formats','fast-uri','fast-deep-equal','json-schema-traverse','require-from-string'])await cp(join(root,'node_modules',name),join(project,'node_modules',name),{recursive:true});
  const name='reclaimer-ui-'+randomUUID(),label='reclaimer.owned-proof='+name;ownedName=name;
  const created=await run(['create','--name',name,'--label',label,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','128','--memory','512m','--cpus','1','--init','--tmpfs','/tmp:rw,nosuid,nodev,size=128m','--mount','type=bind,source='+project+',target=/proof,readonly','--mount','type=bind,source='+artifacts+',target=/artifacts',image,'dbus-run-session','--','node','/proof/verify.mjs']);id=created.stdout.trim();assert.match(id,/^[a-f0-9]{64}$/);
  const inspected=JSON.parse((await run(['inspect',id])).stdout)[0];assert.equal(inspected.Config.Labels['reclaimer.owned-proof'],name);assert.equal(inspected.Config.User,'1000:1000');assert.equal(inspected.HostConfig.NetworkMode,'none');assert.equal(inspected.HostConfig.ReadonlyRootfs,true);assert.deepEqual(inspected.HostConfig.CapDrop,['ALL']);assert.equal(inspected.HostConfig.Memory,512*1024*1024);assert.equal(inspected.HostConfig.PidsLimit,128);assert.equal(inspected.HostConfig.NanoCpus,1000000000);assert.equal(inspected.Mounts.length,2);assert(inspected.Mounts.some(m=>m.Destination==='/proof'&&!m.RW));assert(inspected.Mounts.some(m=>m.Destination==='/artifacts'&&m.RW));
  await run(['start','-a',id],{timeout:180000});const proof=JSON.parse(await readFile(join(artifacts,'PROOF.json'))),cleanup=JSON.parse(await readFile(join(artifacts,'CLEANUP.json')));assert.equal(proof.success,true);assert.equal(proof.observations.length,8);assert(proof.observations.every(o=>o.success));assert.equal(proof.all_helpers_physically_absent,true);assert.equal(cleanup.complete,true);assert(cleanup.children.every(c=>c.physically_absent));assert.equal(proof.platform,'linux');assert.match(proof.node,/^v24\./);
  const after=await snapshot();assert.deepEqual(after,before);receipt={schema:'owned-linux-native-ui/v1',status:'pass',success:true,image:{id:inventory.Id,repo_digests:inventory.RepoDigests},source_files_before:before,source_files_after:after,source_files_unchanged:true,proof,cleanup,scope:'Actual authored GTK3/X11/AT-SPI profile; no host desktop, Wayland, macOS or general toolkit parity claim.'};success=true;
 }finally{
  if(!id&&ownedName){const candidate=await run(['inspect',ownedName],{signal:AbortSignal.timeout(30000),allowFailure:true});if(candidate.exit_code===0){const selected=JSON.parse(candidate.stdout)[0];assert.equal(selected.Config.Labels['reclaimer.owned-proof'],ownedName);id=selected.Id;}}
  if(id){const current=JSON.parse((await run(['inspect',id],{signal:AbortSignal.timeout(30000)})).stdout)[0];assert.equal(current.Config.Labels['reclaimer.owned-proof'],ownedName);await run(['rm','-f',id],{signal:AbortSignal.timeout(30000)});const absent=await run(['inspect',id],{signal:AbortSignal.timeout(30000),allowFailure:true});assert.equal(absent.exit_code,1);await writeFile(join(evidence,'CONTAINER_CLEANUP.json'),JSON.stringify({id,physical_absence_observed:true,inspect_exit_code:absent.exit_code}));}
  assert.equal(dirname(await realpath(workspace)),base);if(success)await rm(workspace,{recursive:true,force:true});else t.diagnostic('Retained owned Linux UI attempt '+workspace);
 }
 await writeFile(join(evidence,'LINUX_UI_RECEIPT.json'),JSON.stringify({...receipt,container_cleanup:{id,physical_absence_observed:true},workspace_cleanup:true},null,2));
 t.diagnostic('Actual isolated Linux UI proof '+evidence);
});
