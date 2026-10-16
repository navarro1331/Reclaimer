import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverSwiftDeclarations} from '../lib/swift-declarations.mjs';
import {swiftExtensionPacket} from './swift-extension-packets.mjs';
import {isStandaloneSwiftModule,recoverStandaloneSwiftModule} from '../lib/swift-standalone.mjs';
import {digest} from '../lib/core.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {engine} from '../lib/engine.mjs';
const nominal={code:4,values:[1,0]},packParameter={code:2,values:[1,1,0,0,2,0]};
const row=options=>recoverSwiftDeclarations(swiftExtensionPacket(options)).modules[0].decoded_declarations.find(row=>row.name==='shape');

test('Swift serialized pack, element and expansion types retain referenced byte-derived structure',()=>{
 for(const version of [903,944]){
  const observed=row({version,types:[nominal,packParameter,{code:34,values:[2,0]},{code:33,values:[3,2]},{code:35,values:[1,4]}]});
  assert.equal(observed.interface_type_reason,null);assert.equal(observed.interface_type.kind,'pack');
  assert.equal(observed.interface_type.elements[1].kind,'pack_expansion');assert.equal(observed.interface_type.elements[1].pattern.kind,'pack_element');
  assert.equal(observed.interface_type.elements[1].count.parameter_kind,1);
 }
});

test('Swift 0.944 integer and InlineArray type facts do not allocate element storage',()=>{
 const observed=row({version:944,types:[nominal,{code:38,values:[0],blob:'18446744073709551616'},{code:41,values:[2,1]}]});
 assert.equal(observed.interface_type_reason,null);assert.equal(observed.interface_type.kind,'inline_array');
 assert.equal(observed.interface_type.count.value,'18446744073709551616');assert.equal(observed.interface_type.element.kind,'struct');
 assert.equal(observed.interface_type.elements,undefined);
});

test('Swift malformed pack/InlineArray references, extents and integer payloads reject instead of gaining types',()=>{
 for(const types of [[nominal,{code:33,values:[1]}],[nominal,{code:34,values:[99,0]}],[nominal,{code:38,values:[0],blob:'2x'}],[nominal,{code:38,values:[1],blob:'3'},{code:41,values:[2,1]}]]){
  assert.throws(()=>row({version:944,types}),error=>error.code==='swift_module_invalid');
 }
});

test('Swift pack display expansion and integer UTF-8 extents reject before unbounded string construction',()=>{
 assert.throws(()=>row({version:944,types:[{code:38,values:[0],blob:'9'.repeat(50000)},{code:35,values:Array(3000).fill(1)}]}),error=>error.code==='capacity'&&/pack expression/.test(error.message));
 assert.throws(()=>row({version:944,types:[{code:38,values:[0],blob:'9'.repeat(65537)}]}),error=>error.code==='capacity'&&/integer.*string budget/.test(error.message));
 assert.throws(()=>row({types:[{code:35,values:[1]}]}),error=>error.code==='swift_module_invalid'&&/cycle/.test(error.message));
});

test('standalone Swift models preserve selected-file bit bindings without inventing native addresses',()=>{
 const bytes=swiftExtensionPacket({types:[nominal]}),before=digest(bytes),model=recoverStandaloneSwiftModule(bytes);
 assert.equal(isStandaloneSwiftModule(bytes),true);assert.equal(model.source_identity.sha256,before);assert.equal(model.swift_declarations.length,2);
 assert.equal(model.swift_ast_modules[0].name,'OwnedExtension');assert.deepEqual(model.swift_types,[]);assert.deepEqual(model.swift_dispatch_slots,[]);
 for(const row of model.swift_ast_modules[0].decoded_declarations){assert.equal(row.location.address,null);assert.equal(row.location.file_offset,Math.floor(row.bit_offset/8));assert.equal(row.location.bit_in_byte,row.bit_offset%8);}
 assert.throws(()=>model.location(0n),/no native address/);assert.equal(digest(bytes),before);
});

test('standalone Swift malformed, conflicting, bounded and cancelled inputs never gain projected declarations',()=>{
 assert.equal(isStandaloneSwiftModule(Buffer.from('source.swift')),false);assert.throws(()=>recoverStandaloneSwiftModule(Buffer.from('source.swift')),/signature/);
 const bytes=swiftExtensionPacket({types:[nominal]}),other=swiftExtensionPacket({types:[nominal,{code:35,values:[]}]}),conflict=recoverStandaloneSwiftModule(Buffer.concat([bytes,other]));
 assert.deepEqual(conflict.swift_declarations,[]);assert.ok(conflict.swift_ast_modules.every(module=>module.conflicting));
 assert.throws(()=>recoverStandaloneSwiftModule(bytes,{maxRecords:1}),error=>error.code==='capacity');
 const c=new AbortController();c.abort();assert.throws(()=>recoverStandaloneSwiftModule(bytes,{signal:c.signal}),error=>error.name==='AbortError');
 assert.throws(()=>recoverStandaloneSwiftModule(bytes.subarray(0,-4)),/block|escapes|extent|truncated/);
});

test('public standalone Swift route publishes byte-bound declarations and rejects source, capacity and late-read cancellation atomically',async t=>{
 const base=await fs.realpath(os.tmpdir()),root=await fs.mkdtemp(path.join(base,'reclaimer-swift-standalone-')),file=path.join(root,'owned.swiftmodule'),bytes=swiftExtensionPacket({types:[nominal]}),ctx=await engine({signal:t.signal});await fs.writeFile(file,bytes,{flag:'wx'});
 t.after(async()=>{ctx.signal=undefined;if(ctx.target)await ctx.call('close_binary',{});const resolved=await fs.realpath(root);assert.equal(path.dirname(resolved),base);assert.ok(path.basename(resolved).startsWith('reclaimer-swift-standalone-'));await fs.rm(resolved,{recursive:true,force:true});});
 const opened=await ctx.call('open_binary',{path:file});assert.equal(opened.result.format,'analysis-database');assert.equal(opened.result.kind,'database');assert.equal(opened.result.architecture,null);
 const evidence=await ctx.call('inspect_native_dispatch_metadata',{});assert.equal(evidence.normalized_result.result.swift_decls.length,2);assert.equal(evidence.subject.digest.sha256,digest(bytes));assert.equal(evidence.raw_result.swift_ast_modules[0].location.address,null);
 const prior=[...ctx.ledger];await assert.rejects(ctx.call('inspect_native_dispatch_metadata',{max_records:1}),error=>error.code==='capacity');assert.deepEqual([...ctx.ledger],prior);
 const changed=Buffer.from(bytes);changed[4]^=1;await fs.writeFile(file,changed);await assert.rejects(ctx.call('inspect_native_dispatch_metadata',{}),/changed since open_binary/);assert.deepEqual([...ctx.ledger],prior);await fs.writeFile(file,bytes);
 const controller=new AbortController(),read=ctx.read.bind(ctx);let calls=0;ctx.signal=controller.signal;ctx.read=async(...args)=>{const bytes=await read(...args);if(++calls===2)controller.abort();return bytes;};await assert.rejects(ctx.call('inspect_native_dispatch_metadata',{}),error=>error.name==='AbortError'||error.code==='cancelled');assert.deepEqual([...ctx.ledger],prior);assert.equal(digest(await fs.readFile(file)),digest(bytes));
});
