import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Context,digest} from '../lib/core.mjs';
import {engine} from '../lib/engine.mjs';
import {parseMacho} from '../lib/artifact-binary.mjs';

const source=path.resolve('test/fixtures/swift-declarations-owned.swift');
const evidence=path.resolve(process.env.RECLAIMER_RECOVERY_EVIDENCE??path.join(os.tmpdir(),'reclaimer-owned-recovery'),'swift');
let frontend=null;
try {
 const cfg=JSON.parse(await fs.readFile('config/local-swift.json','utf8'));
 frontend=path.join(path.dirname(cfg.swiftDemangle),'swift-frontend.exe');
 await fs.access(frontend);
} catch { frontend=null; }
const live={skip:!frontend&&process.env.REAL_RUN_SWIFT_VARIATIONS!=='1',timeout:60000};
let prepared;

async function produce(signal) {
 if(prepared)return prepared;
 assert.ok(frontend,'Private configured Swift frontend is required for this producer fixture');
 await fs.mkdir(evidence,{recursive:true});
 const runner=new Context({signal}),before=await fs.readFile(source),compilerBefore=await fs.readFile(frontend);
 const moduleFile=path.join(evidence,'OwnedDeclarations.swiftmodule'),object=path.join(evidence,'owned-serialized-declarations.o');
 const version=await runner.run([frontend,'-version'],{timeout:30000,maxBytes:1048576});
 assert.match(version.stdout,/Swift version 6\.1\.3/);
 const commands=[
  [frontend,'-emit-module','-parse-stdlib','-parse-as-library','-disable-objc-interop','-enable-library-evolution','-enable-testing','-module-name','OwnedDeclarations','-target','x86_64-apple-macosx10.15','-emit-module-path',moduleFile,source],
  [frontend,'-modulewrap',moduleFile,'-target','x86_64-apple-macosx10.15','-o',object]
 ],invocations=[];
 for(const argv of commands) {
  const r=await runner.run(argv,{timeout:30000,maxBytes:1048576});
  assert.equal(r.exitCode,0);assert.equal(r.stdout,'');assert.equal(r.stderr,'');
  invocations.push({argv,exit_code:r.exitCode,stdout_bytes:0,stderr_bytes:0});
 }
 assert.equal(digest(await fs.readFile(source)),digest(before));
 assert.equal(digest(await fs.readFile(frontend)),digest(compilerBefore));
 const bytes=await fs.readFile(object),moduleBytes=await fs.readFile(moduleFile),image=parseMacho(bytes);
 assert.equal(image.file_type,'MH_OBJECT');
 const ast=image.segments.items.flatMap(s=>s.sections.items).find(s=>s.name==='__swift_ast');
 assert.ok(ast,'The compiler wrapper must contain actual declaration-bearing bytes');
 assert.deepEqual(bytes.subarray(ast.file_offset,ast.file_offset+ast.size),moduleBytes);
 prepared={object,moduleFile,bytes,moduleBytes,image,ast,receipt:{
  verified_at:new Date().toISOString(),source:{path:source,bytes:before.length,sha256:digest(before),preserved:true},
  compiler:{path:frontend,sha256:digest(compilerBefore),reported_version:version.stdout,version_argv:[frontend,'-version'],version_timeout_ms:30000,invocations},
  module:{path:moduleFile,bytes:moduleBytes.length,sha256:digest(moduleBytes)},
  artifact:{path:object,bytes:bytes.length,sha256:digest(bytes),file_type:image.file_type,ast_section:ast},
  target_execution:'not-performed',apple_sdk:'not-used',observations:[],
  limitations:['Indexed nominal/actor and genuine global declarations are projected from selected serialized format 0.903 bytes, including supported inherited generic/alias relationships.','Members, initializers, enum cases and typealiases have no public declaration kind; extension access is not serialized. Supported forms retain structured raw facts and explicit normalized dispositions. Other type grammars and inherited-entry flag meanings remain partial.','A wrapped serialized module does not establish executable membership, loading or runtime use.']
 }};
 return prepared;
}

test('actual frontend modulewrap produces nonempty serialized declaration traits through Context.call',live,async t=>{
 const x=await produce(t.signal),ctx=await engine({signal:t.signal});
 await ctx.call('open_binary',{path:x.object});
 t.after(async()=>{if(ctx.target)await ctx.call('close_binary',{});});
 const read=ctx.read.bind(ctx),reads=[];
 ctx.read=async(...args)=>{reads.push(args[0]);assert.equal(args[0],x.object);return read(...args);};
 ctx.run=async()=>assert.fail('The production declaration reader must not invoke a provider');
 const e=await ctx.call('inspect_native_dispatch_metadata',{}),r=e.normalized_result.result,modules=e.raw_result.swift_ast_modules;
 assert.equal(modules.length,1);assert.deepEqual(modules[0].version,{major:0,minor:903});
 assert.equal(modules[0].sha256,digest(x.moduleBytes));
 const byName=new Map(r.swift_decls.map(d=>[d.name,d]));
 assert.deepEqual([...byName.keys()].sort(),['OwnedProtocol','SealedBox','FinalLeaf','ExtensibleBox','ChildBox','PublicPacket','InternalPacket','FilePacket','PrivatePacket','Choice'].sort());
 for(const [name,access]of [['OwnedProtocol','public'],['FinalLeaf','public'],['ExtensibleBox','open'],['PublicPacket','public'],['InternalPacket','internal'],['FilePacket','fileprivate'],['PrivatePacket','private'],['Choice','public']]) {
  const d=byName.get(name);assert.equal(d.access_level,access);assert.equal(d.module,'OwnedDeclarations');
  assert.equal(d.is_required,false);assert.equal(d.is_convenience_init,false);assert.equal(d.is_override,false);
 }
 assert.equal(byName.get('FinalLeaf').is_final,true);assert.equal(byName.get('ExtensibleBox').is_final,false);
 assert.equal(byName.get('Choice').kind,'enum');assert.equal(byName.get('PublicPacket').kind,'struct');
 assert.equal(byName.get('OwnedProtocol').kind,'protocol');assert.equal(byName.get('FinalLeaf').super_class,null);
 assert.ok(byName.get('FinalLeaf').protocols.includes('Builtin.Copyable'));
 const rawFinal=modules[0].declarations.find(d=>d.declaration.name==='FinalLeaf');
 assert.ok(rawFinal.attributes.some(a=>a.record_code===182));
 assert.equal(rawFinal.location.file_offset,x.ast.file_offset+Math.floor(rawFinal.bit_offset/8));
 assert.equal(rawFinal.location.bit_in_byte,rawFinal.bit_offset%8);
 assert.equal(byName.get('SealedBox').is_final,true);assert.ok(byName.get('SealedBox').protocols.includes('OwnedDeclarations.OwnedProtocol'));
 assert.equal(byName.get('ChildBox').super_class,'OwnedDeclarations.ExtensibleBox');
 assert.ok(modules[0].decoded_declarations.some(d=>d.kind==='constructor'));assert.ok(modules[0].suppressed.every(d=>d.reason.includes('The public schema has no')));
 assert.equal(r.swift_dispatch_slots.length,0);assert.equal(e.raw_result.swift_types.length,0);
 assert.deepEqual(reads,[x.object,x.object]);
 assert.equal(digest(await fs.readFile(x.object)),digest(x.bytes));assert.equal(digest(await fs.readFile(source)),x.receipt.source.sha256);
 x.receipt.observations.push({case:'actual-modulewrap-to-public-declarations',success:true,evidence_id:e.evidence_id,module_version:modules[0].version,declarations:r.swift_decls,raw_declarations:modules[0].declarations,suppressed:modules[0].suppressed,selected_artifact_only_reads:reads});
 await fs.writeFile(path.join(evidence,'SWIFT_DECLARATIONS_REPORT.json'),JSON.stringify(x.receipt,null,2)+'\n');
});

test('actual wrapped module signature mutation and decode quota reject without adding evidence',live,async t=>{
 const x=await produce(t.signal),root=await fs.mkdtemp(path.join(os.tmpdir(),'reclaimer-owned-swift-ast-'));
 t.after(async()=>{assert.ok(path.basename(root).startsWith('reclaimer-owned-swift-ast-'));await fs.rm(root,{recursive:true,force:true});});
 const changed=Buffer.from(x.bytes);changed[x.ast.file_offset]=0;
 const file=path.join(root,'owned-invalid-signature.o');await fs.writeFile(file,changed,{flag:'wx'});
 const ctx=await engine({signal:t.signal});await ctx.call('open_binary',{path:file});
 const retained=ctx.ledger.size,history=ctx.history.length;
 await assert.rejects(()=>ctx.call('inspect_native_dispatch_metadata',{}),/signature is absent/);
 assert.equal(ctx.ledger.size,retained);assert.equal(ctx.history.length,history);
 await ctx.call('close_binary',{});await ctx.call('open_binary',{path:x.object});
 const nextRetained=ctx.ledger.size,nextHistory=ctx.history.length;
 await assert.rejects(()=>ctx.call('inspect_native_dispatch_metadata',{max_records:1}),e=>e.code==='capacity');
 assert.equal(ctx.ledger.size,nextRetained);assert.equal(ctx.history.length,nextHistory);
 await ctx.call('close_binary',{});assert.equal(digest(await fs.readFile(x.object)),digest(x.bytes));
});

test('completed selected-object read cancellation publishes no declaration evidence',live,async t=>{
 const x=await produce(t.signal),ctx=await engine({signal:t.signal});await ctx.call('open_binary',{path:x.object});
 const retained=ctx.ledger.size,history=ctx.history.length,controller=new AbortController(),read=ctx.read.bind(ctx);
 ctx.read=async(...args)=>{const bytes=await read(...args);controller.abort(new Error('Owned serialized declaration read cancellation'));return bytes;};ctx.signal=controller.signal;
 await assert.rejects(()=>ctx.call('inspect_native_dispatch_metadata',{}),/Owned serialized declaration read cancellation/);
 assert.equal(ctx.ledger.size,retained);assert.equal(ctx.history.length,history);
 ctx.signal=null;ctx.read=read;await ctx.call('close_binary',{});
 assert.equal(digest(await fs.readFile(x.object)),digest(x.bytes));
});
