import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Context,digest} from '../lib/core.mjs';
import {parseMacho} from '../lib/artifact-binary.mjs';

export const declarationSource=path.resolve('test/fixtures/swift-declaration-varied.swift');
export const swiftDeclarationEvidenceRoot=path.resolve(process.env.RECLAIMER_RECOVERY_EVIDENCE??path.join(os.tmpdir(),'reclaimer-owned-identities'),'swift');
let frontend=null;
try {const cfg=JSON.parse(await fs.readFile('config/local-swift.json','utf8'));frontend=path.join(path.dirname(cfg.swiftDemangle),'swift-frontend.exe');await fs.access(frontend);}catch{frontend=null;}
export const swiftDeclarationProviderAvailable=!!frontend;
const preparations=new Map();
export function prepareSwiftDeclarationFixture({signal,evidenceRoot=swiftDeclarationEvidenceRoot}={}) {
 const key=path.resolve(evidenceRoot);if(!preparations.has(key))preparations.set(key,produce({signal,evidenceRoot:key}));return preparations.get(key);
}
async function produce({signal,evidenceRoot}) {
 assert.ok(frontend,'Private configured Swift frontend is required');
 await fs.mkdir(evidenceRoot,{recursive:true});
 const ctx=new Context({signal}),sourceBytes=await fs.readFile(declarationSource),compilerBytes=await fs.readFile(frontend);
 const moduleFile=path.join(evidenceRoot,'OwnedVariedDeclarations.swiftmodule'),object=path.join(evidenceRoot,'owned-varied-declarations.o');
 // Compiler fixture setup has a separate bounded cold-start allowance.
 const version=await ctx.run([frontend,'-version'],{timeout:30000,maxBytes:1048576});assert.match(version.stdout,/Swift version 6\.1\.3/);
 const commands=[
  [frontend,'-emit-module','-parse-stdlib','-parse-as-library','-disable-objc-interop','-disable-implicit-concurrency-module-import','-enable-library-evolution','-enable-testing','-module-name','OwnedVariedDeclarations','-target','x86_64-apple-macosx10.15','-emit-module-path',moduleFile,declarationSource],
  [frontend,'-modulewrap',moduleFile,'-target','x86_64-apple-macosx10.15','-o',object]
 ],invocations=[];
 for(const argv of commands){const result=await ctx.run(argv,{timeout:30000,maxBytes:1048576});assert.equal(result.exitCode,0);assert.equal(result.stdout,'');assert.equal(result.stderr,'');invocations.push({argv,exit_code:result.exitCode,stdout_bytes:0,stderr_bytes:0});}
 assert.equal(digest(await fs.readFile(declarationSource)),digest(sourceBytes));assert.equal(digest(await fs.readFile(frontend)),digest(compilerBytes));
 const bytes=await fs.readFile(object),moduleBytes=await fs.readFile(moduleFile),image=parseMacho(bytes),ast=image.segments.items.flatMap(s=>s.sections.items).find(s=>s.name==='__swift_ast');
 assert.ok(ast);assert.deepEqual(bytes.subarray(ast.file_offset,ast.file_offset+ast.size),moduleBytes);
 return {object,moduleFile,bytes,moduleBytes,image,ast,receipt:{verified_at:new Date().toISOString(),compiler:{path:frontend,sha256:digest(compilerBytes),reported_version:version.stdout,version_argv:[frontend,'-version'],version_timeout_ms:30000,invocations},source:{path:declarationSource,sha256:digest(sourceBytes),bytes:sourceBytes.length,preserved:true},module:{path:moduleFile,sha256:digest(moduleBytes),bytes:moduleBytes.length},artifact:{path:object,sha256:digest(bytes),bytes:bytes.length,ast_section:ast},target_execution:'not-performed',apple_sdk:'not-used',observations:[]}};
}
export async function saveSwiftDeclarationReceipt(receipt){await fs.writeFile(path.join(swiftDeclarationEvidenceRoot,'SWIFT_VARIED_DECLARATIONS_REPORT.json'),JSON.stringify(receipt,null,2)+'\n');}
