import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Context,digest} from '../lib/core.mjs';
import {engine} from '../lib/engine.mjs';
import {recoverStandaloneSwiftModule} from '../lib/swift-standalone.mjs';

const image='swift@sha256:f7efcc22a7fb242fd3e23aeac1385cd84c05b574e469136f5ef18a6474314a1e';
const sourceText=`// Independently authored type producer; no target function is executed.
public func inlineEcho(_ value: InlineArray<3, Int>) -> InlineArray<3, Int> { return value }
public func sizedEcho(_ value: [3 of Int]) -> [3 of Int] { return value }
public func packEcho<each Element>(_ value: repeat each Element) -> (repeat each Element) { return (repeat each value) }
`;

test('actual isolated Swift 6.2 standalone module proves InlineArray integer count and pack declarations',{skip:process.env.REAL_RUN_NATIVE_VARIATIONS!=='1',timeout:180000},async t=>{
 const base=await fs.realpath(os.tmpdir()),root=await fs.mkdtemp(path.join(base,'reclaimer-swift-inline-')),sourceRoot=path.join(root,'source'),output=path.join(root,'output'),evidence=path.resolve(process.env.RECLAIMER_EXTENSION_EVIDENCE??path.join(os.tmpdir(),'reclaimer-owned-swift-extension-evidence')),runner=new Context({signal:t.signal}),names=[],invocations=[];let publicContext;
 await fs.mkdir(sourceRoot);await fs.mkdir(output);await fs.mkdir(evidence,{recursive:true});const source=path.join(sourceRoot,'OwnedInline.swift');await fs.writeFile(source,sourceText,{flag:'wx'});await fs.writeFile(path.join(evidence,path.basename(root)+'.swift'),sourceText,{flag:'wx'});
 const receipt={image,source_sha256:digest(Buffer.from(sourceText)),target_execution:'not-performed',apple_sdk:'not-used',invocations,success:false};
 try{
  await runner.run(['docker','image','inspect',image],{timeout:15000,maxBytes:1048576});
  const common=['run','--rm','--pull','never','--platform','linux/amd64','--network','none','--read-only','--user','65534:65534','--cpus','2','--memory','3g','--pids-limit','128','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,nosuid,nodev,size=536870912','--mount','type=bind,source='+sourceRoot+',target=/src,readonly','--mount','type=bind,source='+output+',target=/out','--entrypoint','/usr/bin/timeout'];
  for(const [stage,command]of [['version',['/usr/bin/swift-frontend','-version']],['hash',['/usr/bin/sha256sum','/usr/bin/swift-frontend']],['compile',['/usr/bin/swiftc','-emit-module','-parse-as-library','-enable-library-evolution','-module-name','OwnedInline','-module-cache-path','/tmp/cache','-emit-module-path','/out/OwnedInline.swiftmodule','/src/OwnedInline.swift']]]){
   const name=path.basename(root).toLowerCase()+'-'+stage;names.push(name);const argv=['docker',...common.slice(0,2),'--name',name,...common.slice(2),image,'60',...command];
   try{const result=await runner.run(argv,{timeout:75000,maxBytes:1048576});invocations.push({stage,argv,...result});}catch(error){invocations.push({stage,argv,code:error.code,stdout:error.stdout??'',stderr:error.stderr??'',message:error.message});throw error;}
  }
  assert.match(invocations[0].stdout,/Swift version 6\.2/);assert.equal(invocations[1].stdout.trim().split(/\s+/)[0],'cc7f04f1609262acb9115c6f283f93771f8c330a881285a9e12d1b3521db94bc');
  const file=path.join(output,'OwnedInline.swiftmodule'),bytes=await fs.readFile(file),model=recoverStandaloneSwiftModule(bytes,{signal:t.signal}),rows=model.swift_ast_modules[0].decoded_declarations,inline=rows.find(row=>row.name.startsWith('inlineEcho')),pack=rows.find(row=>row.name.startsWith('packEcho'));receipt.module_sha256=digest(bytes);receipt.module_bytes=bytes.length;receipt.decoded_declarations=rows;await fs.writeFile(path.join(evidence,path.basename(root)+'.swiftmodule'),bytes,{flag:'wx'});
  const sized=rows.find(row=>row.name.startsWith('sizedEcho'));assert.deepEqual(model.swift_ast_modules[0].version,{major:0,minor:944});assert.equal(inline.interface_type_reason,null);assert.equal(inline.interface_type.kind,'external');assert.equal(inline.interface_type.expression,'Swift.InlineArray<3, Swift.Int>');assert.equal(inline.interface_type.arguments[0].kind,'integer');assert.equal(inline.interface_type.arguments[0].value,'3');assert.equal(sized.interface_type_reason,null);assert.equal(sized.interface_type.kind,'inline_array');assert.equal(sized.interface_type.count.value,'3');assert.equal(sized.interface_type.element.expression,'Swift.Int');assert.equal(sized.interface_type.storage_reconstructed,false);assert.equal(pack.callable_signature.parameters[0].type.kind,'pack_expansion');
  publicContext=await engine({signal:t.signal});await publicContext.call('open_binary',{path:file});const envelope=await publicContext.call('inspect_native_dispatch_metadata',{});assert.ok(envelope.normalized_result.result.swift_decls.some(decl=>decl.name.startsWith('inlineEcho')));assert.equal(envelope.subject.digest.sha256,digest(bytes));receipt.evidence_id=envelope.evidence_id;receipt.source_preserved=digest(await fs.readFile(source))===receipt.source_sha256;receipt.success=true;
 }catch(error){receipt.failure={name:error.name,message:error.message};throw error;}
 finally{
  if(publicContext?.target){publicContext.signal=undefined;await publicContext.call('close_binary',{});}
  runner.signal=undefined;const absent=async name=>runner.run(['docker','container','inspect',name],{timeout:10000,maxBytes:1048576}).then(()=>false,error=>{if(error.code===1&&/No such (object|container)/i.test(error.stderr??''))return true;throw error;});
  receipt.container_cleanup=[];for(const name of names){if(!await absent(name))await runner.run(['docker','rm','-f',name],{timeout:15000,maxBytes:1048576});const removed=await absent(name);assert.equal(removed,true);receipt.container_cleanup.push({name,absent:removed});}
  const resolved=await fs.realpath(root);assert.equal(path.dirname(resolved),base);assert.ok(path.basename(resolved).startsWith('reclaimer-swift-inline-'));await fs.rm(resolved,{recursive:true,force:true});receipt.workspace_cleanup=true;await fs.writeFile(path.join(evidence,path.basename(root)+'-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 }
});
