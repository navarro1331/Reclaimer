import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Context,digest} from '../lib/core.mjs';
import {parseMacho} from '../lib/artifact-binary.mjs';
import {parseAppleMetadata} from '../lib/artifact-apple-metadata.mjs';
import {recoverStandaloneSwiftModule} from '../lib/swift-standalone.mjs';
import {engine} from '../lib/engine.mjs';

const program=`// Independently authored metadata and serialized type producer; never executed.
precedencegroup AssignmentPrecedence {
 assignment: true
 associativity: right
}
public struct Marker { public init() {} }
public struct Holder<Element> { public let value: Element; public init(_ value: Element) { self.value = value } }
public protocol Worker { func work() }
public class Owner { public init() {}; public func work() {} }
public class Child: Owner, Worker { public override func work() {} }
public func packIdentity<each Element>(_ value: repeat each Element) -> (repeat each Element) { return (repeat each value) }
`;
const enabled=process.env.REAL_RUN_NATIVE_VARIATIONS==='1';
async function workspace(t,prefix){const base=await fs.realpath(os.tmpdir()),root=await fs.mkdtemp(path.join(base,prefix));t.after(async()=>{const resolved=await fs.realpath(root);assert.equal(path.dirname(resolved),base);assert.ok(path.basename(resolved).startsWith(prefix));await fs.rm(resolved,{recursive:true,force:true});});return root;}
const evidenceRoot=()=>path.resolve(process.env.RECLAIMER_EXTENSION_EVIDENCE??path.join(os.tmpdir(),'reclaimer-owned-swift-extension-evidence'));

test('actual owned Swift module and ARM64 metadata object retain declarations and local relocation proofs',{skip:!enabled,timeout:180000},async t=>{
 const cfg=JSON.parse(await fs.readFile('config/local-swift.json','utf8')),frontend=path.join(path.dirname(cfg.swiftDemangle),'swift-frontend.exe'),compilerHash=digest(await fs.readFile(frontend)),root=await workspace(t,'reclaimer-swift-extension-'),evidence=evidenceRoot();await fs.mkdir(evidence,{recursive:true});
 const source=path.join(root,'OwnedSwiftExtension.swift'),moduleFile=path.join(root,'OwnedSwiftExtension.swiftmodule');await fs.writeFile(source,program,{flag:'wx'});await fs.writeFile(path.join(evidence,path.basename(root)+'.swift'),program,{flag:'wx'});
 const ctx=new Context({signal:t.signal}),env={PATH:process.env.PATH??'',SystemRoot:process.env.SystemRoot??'',TEMP:root,TMP:root,USERPROFILE:root,HOME:root,APPDATA:root,LOCALAPPDATA:root},common=['-parse-stdlib','-parse-as-library','-disable-objc-interop','-disable-implicit-concurrency-module-import','-enable-library-evolution','-module-name','OwnedSwiftExtension','-module-cache-path',path.join(root,'cache')],invocations=[];
 for(const argv of [[frontend,'-emit-module',...common,'-target','x86_64-apple-macosx10.15','-emit-module-path',moduleFile,source],...[['x86_64-apple-macosx10.15','x64'],['arm64-apple-macosx11.0','arm64']].map(([target,name])=>[frontend,'-emit-object',...common,'-target',target,'-o',path.join(root,name+'.o'),source])]){const result=await ctx.run(argv,{cwd:root,timeout:60000,maxBytes:1048576,env});invocations.push({argv,...result});}
 const moduleBytes=await fs.readFile(moduleFile),standalone=recoverStandaloneSwiftModule(moduleBytes,{signal:t.signal}),observations=[],artifacts=[];
 await fs.writeFile(path.join(evidence,path.basename(root)+'.swiftmodule'),moduleBytes,{flag:'wx'});
 for(const name of ['x64','arm64']){const bytes=await fs.readFile(path.join(root,name+'.o')),retained=path.join(evidence,path.basename(root)+'-'+name+'.o');await fs.writeFile(retained,bytes,{flag:'wx'});artifacts.push({name,sha256:digest(bytes),retained_path:retained,bytes:bytes.length});}
 await fs.writeFile(path.join(evidence,path.basename(root)+'-production.json'),JSON.stringify({compiler_sha256:compilerHash,source_sha256:digest(Buffer.from(program)),module_sha256:digest(moduleBytes),invocations,artifacts,target_execution:'not-performed',apple_sdk:'not-used'},null,2)+'\n',{flag:'wx'});
 for(const artifact of artifacts){const {name}=artifact,bytes=await fs.readFile(artifact.retained_path),image=parseMacho(bytes),metadata=parseAppleMetadata(bytes,{signal:t.signal});observations.push({name,sha256:digest(bytes),bytes:bytes.length,architecture:image.architectures.items[0].name,types:metadata.swift_types.map(type=>type.qualified),dispatch:metadata.swift_dispatch_slots,relocations:metadata.object_relocations,issues:metadata.issues});}
 const receipt={success:false,compiler_sha256:compilerHash,source_sha256:digest(Buffer.from(program)),module_sha256:digest(moduleBytes),invocations,standalone:standalone.swift_ast_modules,observations,target_execution:'not-performed',apple_sdk:'not-used',source_preserved:digest(await fs.readFile(source))===digest(Buffer.from(program))};
 await fs.writeFile(path.join(evidence,path.basename(root)+'-probe.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 for(const observed of observations){assert.ok(observed.types.includes('OwnedSwiftExtension.Holder'),observed.name);assert.ok(observed.dispatch.length>0,observed.name);assert.ok(observed.relocations.some(record=>record.status==='derived'),observed.name);}
 const pack=standalone.swift_ast_modules[0].decoded_declarations.find(row=>row.name.startsWith('packIdentity'));assert.ok(pack);assert.equal(pack.interface_type_reason,null);assert.ok(pack.callable_signature.parameters.some(parameter=>parameter.type.kind==='pack_expansion'));
 const publicContext=await engine({signal:t.signal});try{const opened=await publicContext.call('open_binary',{path:moduleFile});assert.equal(opened.result.format,'analysis-database');assert.equal(opened.result.kind,'database');assert.equal(opened.result.architecture,null);const envelope=await publicContext.call('inspect_native_dispatch_metadata',{}),types=await publicContext.call('analyze_swift_types',{});assert.ok(envelope.normalized_result.result.swift_decls.length>0);assert.equal(envelope.raw_result.source_identity.sha256,digest(moduleBytes));assert.equal(envelope.raw_result.swift_ast_modules[0].location.address,null);assert.equal(types.normalized_result.total,0);assert.ok(types.limitations.some(reason=>reason.includes('Standalone')));receipt.public_standalone={evidence_id:envelope.evidence_id,normalized_declarations:envelope.normalized_result.result.swift_decls.length,native_address_types:types.normalized_result.total,source_sha256:envelope.subject.digest.sha256};}finally{if(publicContext.target){const signal=publicContext.signal;publicContext.signal=undefined;try{await publicContext.call('close_binary',{});}finally{publicContext.signal=signal;}}}
 assert.equal(digest(await fs.readFile(frontend)),compilerHash);receipt.success=true;await fs.writeFile(path.join(evidence,path.basename(root)+'-success.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
});
