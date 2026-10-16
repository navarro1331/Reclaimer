import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {Context,digest} from '../lib/core.mjs';
import {parseMacho} from '../lib/artifact-binary.mjs';
import {engine} from '../lib/engine.mjs';

const requireProducers=process.env.RECLAIMER_REQUIRE_SWIFT_COMPLETION_PRODUCERS==='1';
const sourceFiles=['lib/swift-declarations.mjs','lib/swift-declaration-projector.mjs','lib/swift-declaration-types.mjs','lib/swift-declaration-versions.mjs','lib/swift-declaration-budget.mjs','lib/bounded-json.mjs','test/swift-completion.test.mjs','test/swift-completion-producers.test.mjs'];
const sourceSnapshot=()=>Promise.all(sourceFiles.map(async file=>{const bytes=await fs.readFile(new URL('../'+file,import.meta.url));return {path:file,sha256:digest(bytes),bytes:bytes.length};}));
async function closeOwnedContext(ctx){if(!ctx?.target)return;const signal=ctx.signal;try{ctx.signal=undefined;await ctx.call('close_binary',{});}finally{ctx.signal=signal;}}
const sourceText=`public struct Token { public init() {} }
public protocol Source { associatedtype Item; func load() -> Item }
public func closureFactory() -> (Token) -> Token { return { value in value } }
public protocol AsyncFactory { func asyncClosureFactory() -> (Token) async -> Token }
public func transform(_ body: @escaping (Token) -> Token) -> (Token) -> Token { return body }
public func genericClosure<Element>(_ value: Element) -> (Element) -> Element { return { other in other } }
public func dependent<S: Source>(_ source: S, value: S.Item) -> S.Item { return value }
public func metatype(_ value: Token.Type) -> Token.Type { return value }
open class Cloner { public init() {}; open func clone() -> Self { return self } }
public var closure: (Token) -> Token { return { value in value } }
`;
let frontend=null;
try{const cfg=JSON.parse(await fs.readFile('config/local-swift.json','utf8'));frontend=path.join(path.dirname(cfg.swiftDemangle),'swift-frontend.exe');await fs.access(frontend);}catch{frontend=null;}
test('actual Swift 6.1.3 owned module preserves complex signature bytes through the selected artifact', {skip:!frontend&&!requireProducers,timeout:180000},async t=>{
 assert.ok(frontend,'Strict completion verification requires the configured Swift 6.1.3 frontend');
 const sourceFilesBefore=await sourceSnapshot();
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'reclaimer-swift-completion-')),evidence=process.env.RECLAIMER_SWIFT_COMPLETION_EVIDENCE;
 let report,ctx;
 try{
  const source=path.join(root,'OwnedCompletion.swift'),moduleFile=path.join(root,'OwnedCompletion.swiftmodule'),object=path.join(root,'owned-completion.o');await fs.writeFile(source,sourceText,{flag:'wx'});
  const runner=new Context({signal:t.signal}),compilerBefore=digest(await fs.readFile(frontend)),sourceBefore=digest(await fs.readFile(source)),version=await runner.run([frontend,'-version'],{timeout:30000,maxBytes:1048576});assert.match(version.stdout,/Swift version 6\.1\.3/);
  const argv=[[frontend,'-emit-module','-parse-stdlib','-parse-as-library','-disable-objc-interop','-disable-implicit-concurrency-module-import','-enable-library-evolution','-enable-testing','-module-name','OwnedCompletion','-target','x86_64-apple-macosx10.15','-emit-module-path',moduleFile,source],[frontend,'-modulewrap',moduleFile,'-target','x86_64-apple-macosx10.15','-o',object]],invocations=[];
  for(const args of argv){const result=await runner.run(args,{timeout:30000,maxBytes:1048576});invocations.push({argv:args,exit_code:result.exitCode,stdout:result.stdout,stderr:result.stderr});assert.equal(result.exitCode,0);assert.equal(result.stdout,'');assert.equal(result.stderr,'');}
  const moduleBytes=await fs.readFile(moduleFile),bytes=await fs.readFile(object),image=parseMacho(bytes),ast=image.segments.items.flatMap(s=>s.sections.items).find(s=>s.name==='__swift_ast');assert.ok(ast);assert.deepEqual(bytes.subarray(ast.file_offset,ast.file_offset+ast.size),moduleBytes);
  if(evidence){await fs.mkdir(evidence,{recursive:true});await fs.writeFile(path.join(evidence,'swift-completion-owned.swift'),sourceText);await fs.writeFile(path.join(evidence,'swift-completion-owned.swiftmodule'),moduleBytes);await fs.writeFile(path.join(evidence,'swift-completion-owned.o'),bytes);}
  ctx=await engine({signal:t.signal});await ctx.call('open_binary',{path:object});const reads=[],originalRead=ctx.read.bind(ctx);ctx.read=async(...args)=>{reads.push(args[0]);assert.equal(args[0],object);return originalRead(...args);};ctx.run=async()=>assert.fail('Declaration recovery must not invoke providers');
  const result=await ctx.call('inspect_native_dispatch_metadata',{}),module=result.raw_result.swift_ast_modules[0],rows=module.decoded_declarations,find=name=>{const row=rows.find(d=>d.name===name||d.name===name+'()');assert.ok(row,name);return row;};
  assert.deepEqual(module.version,{major:0,minor:903});assert.equal(module.sha256,digest(moduleBytes));
  for(const name of ['closureFactory','AsyncFactory.asyncClosureFactory','transform(_:)','genericClosure(_:)'])assert.equal(find(name).interface_type.kind,'function',name);
  assert.equal(find('AsyncFactory.asyncClosureFactory').interface_type.is_async,true);assert.equal(find('closure').interface_type.kind,'function');
  assert.equal(find('metatype(_:)').interface_type.kind,'metatype');assert.equal(find('Cloner.clone').interface_type.kind,'dynamic_self');
  assert.equal(find('dependent(_:value:)').interface_type.kind,'dependent_member');assert.equal(find('dependent(_:value:)').callable_signature.parameters.length,2);assert.equal(find('transform(_:)').callable_signature.parameters[0].type.kind,'function');
  assert.equal(find('genericClosure(_:)').callable_signature.generic_signature.parameters.length,1);
  assert.ok(rows.some(d=>d.kind==='associated_type'));assert.ok(rows.filter(d=>d.kind==='associated_type').every(d=>d.normalized_disposition.includes('no associated_type')));
  assert.equal(digest(await fs.readFile(source)),sourceBefore);assert.equal(digest(await fs.readFile(frontend)),compilerBefore);assert.equal(digest(await fs.readFile(object)),digest(bytes));
  const sourceFilesAfter=await sourceSnapshot();assert.deepEqual(sourceFilesAfter,sourceFilesBefore);
  report={success:true,observed_at:new Date().toISOString(),source_files_before:sourceFilesBefore,source_files_after:sourceFilesAfter,compiler:{path:frontend,sha256:compilerBefore,preserved:true,version:version.stdout,version_argv:[frontend,'-version'],invocations},source:{path:source,sha256:sourceBefore,bytes:Buffer.byteLength(sourceText),preserved:true},artifact:{path:object,sha256:digest(bytes),bytes:bytes.length,preserved:true},module:{sha256:digest(moduleBytes),bytes:moduleBytes.length,version:module.version,preserved:true},reads,decoded_declarations:rows,public_declarations:result.normalized_result.result.swift_decls,evidence_id:result.evidence_id,target_execution:'not-performed',apple_sdk:'not-used',mac_live:'pending-unavailable',workspace_cleanup:false};
 } finally {
  await closeOwnedContext(ctx);assert.ok(path.basename(root).startsWith('reclaimer-swift-completion-'));await fs.rm(root,{recursive:true,force:true});assert.equal(await fs.access(root).then(()=>true,()=>false),false);
  if(report&&evidence){report.workspace_cleanup=true;await fs.writeFile(path.join(evidence,'swift-completion-compiler-report.json'),JSON.stringify(report,null,2)+'\n');}
 }
});

const containerProducers=[
 {version:'6.0.3',minor:871,image:'swift@sha256:b394f699c1844fabf5c01d8a5673639141dc007f500661a4fa56f4ba1f23d87b',compiler:'6243ab0357756987086a5620c1a280a243e9cebe5170ddc27f2066354cd7d4bd'},
 {version:'6.2',minor:944,image:'swift@sha256:f7efcc22a7fb242fd3e23aeac1385cd84c05b574e469136f5ef18a6474314a1e',compiler:'cc7f04f1609262acb9115c6f283f93771f8c330a881285a9e12d1b3521db94bc'}
];
function docker(args,{timeout=120000,signal}={}){
 return new Promise((resolve,reject)=>{
  signal?.throwIfAborted();const started=Date.now(),child=spawn('docker',args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']}),out=[],err=[];let timedOut=false,bytes=0;
  const stop=()=>child.kill(),timer=setTimeout(()=>{timedOut=true;stop();},timeout);signal?.addEventListener('abort',stop,{once:true});
  const capture=target=>b=>{bytes+=b.length;if(bytes>1048576){stop();reject(new Error('Owned Docker producer output budget exceeded'));}else target.push(b);};child.stdout.on('data',capture(out));child.stderr.on('data',capture(err));
  child.once('error',error=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);reject(error);});child.once('close',(code,sig)=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);resolve({argv:['docker',...args],exit_code:code,signal:sig,stdout:Buffer.concat(out).toString('utf8'),stderr:Buffer.concat(err).toString('utf8'),timed_out:timedOut,duration_ms:Date.now()-started});});
 });
}
for(const producer of containerProducers){
 const inventory=spawnSync('docker',['image','inspect',producer.image],{shell:false,windowsHide:true,stdio:'pipe',timeout:15000,maxBuffer:1048576});
 test('actual isolated Swift '+producer.version+' producer qualifies serialized minor '+producer.minor,{skip:inventory.status!==0&&!requireProducers,timeout:360000},async t=>{
  assert.equal(inventory.status,0,'Strict completion verification requires the previously fetched official image '+producer.image);
  const sourceFilesBefore=await sourceSnapshot(),root=await fs.mkdtemp(path.join(os.tmpdir(),'reclaimer-swift-container-')),sourceRoot=path.join(root,'source'),output=path.join(root,'artifacts'),names=[],invocations=[],cleanupInvocations=[],evidence=process.env.RECLAIMER_SWIFT_COMPLETION_EVIDENCE;
  let ctx,report;
  try{
   await fs.mkdir(sourceRoot);await fs.mkdir(output);const source=path.join(sourceRoot,'OwnedCompletion.swift');await fs.writeFile(source,sourceText,{flag:'wx'});const sourceHash=digest(await fs.readFile(source));
   const base=['run','--rm','--pull','never','--platform','linux/amd64','--network','none','--read-only','--user','65534:65534','--cpus','2','--memory','3g','--pids-limit','128','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,nosuid,nodev,size=536870912','--mount','type=bind,source='+sourceRoot+',target=/src,readonly','--mount','type=bind,source='+output+',target=/out','--entrypoint','/usr/bin/timeout'];
   const commands=[['version',['/usr/bin/swift-frontend','-version']],['hash',['/usr/bin/sha256sum','/usr/bin/swift-frontend']],['compile',['/usr/bin/swift-frontend','-emit-module','-parse-stdlib','-parse-as-library','-disable-objc-interop','-disable-implicit-concurrency-module-import','-enable-library-evolution','-enable-testing','-module-name','OwnedCompletion','-target','x86_64-apple-macosx10.15','-module-cache-path','/tmp/module-cache','-emit-module-path','/out/OwnedCompletion.swiftmodule','/src/OwnedCompletion.swift']],['wrap',['/usr/bin/swift-frontend','-modulewrap','/out/OwnedCompletion.swiftmodule','-target','x86_64-apple-macosx10.15','-o','/out/owned-completion.o']]];
   for(const [stage,command]of commands){const name=path.basename(root).toLowerCase()+'-'+stage;names.push(name);const result=await docker([...base.slice(0,2),'--name',name,...base.slice(2),producer.image,'60',...command],{timeout:75000,signal:t.signal});invocations.push({stage,...result});assert.equal(result.timed_out,false);assert.equal(result.exit_code,0);assert.equal(result.stderr,'');}
   assert.match(invocations[0].stdout,new RegExp('Swift version '+producer.version.replaceAll('.','\\.')));assert.equal(invocations[1].stdout.trim().split(/\s+/)[0],producer.compiler);
   const moduleFile=path.join(output,'OwnedCompletion.swiftmodule'),object=path.join(output,'owned-completion.o'),moduleBytes=await fs.readFile(moduleFile),bytes=await fs.readFile(object),image=parseMacho(bytes),ast=image.segments.items.flatMap(s=>s.sections.items).find(s=>s.name==='__swift_ast');assert.ok(ast);assert.deepEqual(bytes.subarray(ast.file_offset,ast.file_offset+ast.size),moduleBytes);
   ctx=await engine({signal:t.signal});await ctx.call('open_binary',{path:object});const reads=[],read=ctx.read.bind(ctx);ctx.read=async(...args)=>{reads.push(args[0]);assert.equal(args[0],object);return read(...args);};ctx.run=async()=>assert.fail('Recovery cannot invoke a provider');
   const envelope=await ctx.call('inspect_native_dispatch_metadata',{}),module=envelope.raw_result.swift_ast_modules[0],rows=module.decoded_declarations,find=name=>{const row=rows.find(d=>d.name===name||d.name===name+'()');assert.ok(row,name);return row;};assert.deepEqual(module.version,{major:0,minor:producer.minor});assert.equal(module.sha256,digest(moduleBytes));assert.equal(rows.length,17);assert.equal(envelope.normalized_result.result.swift_decls.length,10);
   for(const name of ['closureFactory','AsyncFactory.asyncClosureFactory','transform(_:)','genericClosure(_:)'])assert.equal(find(name).interface_type.kind,'function');assert.equal(find('AsyncFactory.asyncClosureFactory').interface_type.is_async,true);assert.equal(find('closure').interface_type.kind,'function');assert.equal(find('metatype(_:)').interface_type.kind,'metatype');assert.equal(find('Cloner.clone').interface_type.kind,'dynamic_self');
   const dependent=find('dependent(_:value:)');assert.equal(dependent.interface_type.kind,'dependent_member');assert.equal(dependent.callable_signature.parameters.length,2);assert.ok(dependent.callable_signature.generic_signature.requirements.some(r=>r.kind==='conformance'&&r.second.expression==='OwnedCompletion.Source'));assert.equal(find('transform(_:)').callable_signature.parameters[0].type.kind,'function');assert.ok(rows.some(r=>r.kind==='associated_type'));
   assert.equal(digest(await fs.readFile(source)),sourceHash);assert.equal(digest(await fs.readFile(object)),digest(bytes));assert.equal(digest(await fs.readFile(moduleFile)),digest(moduleBytes));
   const sourceFilesAfter=await sourceSnapshot();assert.deepEqual(sourceFilesAfter,sourceFilesBefore);
   report={success:true,observed_at:new Date().toISOString(),source_files_before:sourceFilesBefore,source_files_after:sourceFilesAfter,producer:{version:producer.version,image:producer.image,compiler_sha256:producer.compiler,inventory_argv:['docker','image','inspect',producer.image],inventory_exit_code:inventory.status,inventory_stdout:inventory.stdout.toString(),invocations,cleanup_invocations:cleanupInvocations},source:{sha256:sourceHash,bytes:Buffer.byteLength(sourceText),preserved:true},module:{sha256:digest(moduleBytes),bytes:moduleBytes.length,version:module.version,preserved:true},artifact:{sha256:digest(bytes),bytes:bytes.length,preserved:true},reads,evidence_id:envelope.evidence_id,decoded_declarations:rows,public_declarations:envelope.normalized_result.result.swift_decls,runtime_network:'none',target_execution:'not-performed',apple_sdk:'not-used',mac_live:'pending-unavailable',workspace_cleanup:false,container_cleanup:false};
   if(evidence){await fs.mkdir(evidence,{recursive:true});const stem='swift-completion-producer-'+producer.version;await fs.writeFile(path.join(evidence,stem+'.swift'),sourceText);await fs.writeFile(path.join(evidence,stem+'.swiftmodule'),moduleBytes);await fs.writeFile(path.join(evidence,stem+'.o'),bytes);report.module.retained_path=path.join(evidence,stem+'.swiftmodule');report.artifact.retained_path=path.join(evidence,stem+'.o');}
  }finally{
   await closeOwnedContext(ctx);
   for(const name of names){let absent=await docker(['container','inspect',name],{timeout:10000});cleanupInvocations.push(absent);if(absent.exit_code===0){cleanupInvocations.push(await docker(['rm','-f',name],{timeout:15000}));absent=await docker(['container','inspect',name],{timeout:10000});cleanupInvocations.push(absent);}assert.equal(absent.exit_code,1);assert.match(absent.stderr,/No such (object|container)/i);}
   assert.ok(path.basename(root).startsWith('reclaimer-swift-container-'));await fs.rm(root,{recursive:true,force:true});assert.equal(await fs.access(root).then(()=>true,()=>false),false);
   if(report&&evidence){report.workspace_cleanup=true;report.container_cleanup=true;await fs.mkdir(evidence,{recursive:true});await fs.writeFile(path.join(evidence,'swift-completion-producer-'+producer.version+'-report.json'),JSON.stringify(report,null,2)+'\n');}
  }
 });
}
