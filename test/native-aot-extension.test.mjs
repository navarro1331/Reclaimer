import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from '../lib/core.mjs';
import {recoverNativeAotDetailed} from '../lib/native-aot.mjs';
import {aotExtensionFixture} from './native-aot-extension-fixtures.mjs';
const decode=(f,options={})=>recoverNativeAotDetailed(f.bytes,f.model,digest(f.bytes),f.architecture,options);

test('owned two-argument NativeAOT composition preserves order, duplicate argument identities and readonly field mapping',()=>{
 const f=aotExtensionFixture(),before=digest(f.bytes),detail=decode(f),inventory=detail.identity_recovery.modules[0],type=inventory.types.find(type=>type.identity_kind==='constructed-generic');
 assert.equal(type.qualified_name,f.constructed_name);assert.equal(type.method_table_address,f.constructed_address);assert.equal(type.generic_arguments.length,2);assert.deepEqual(type.generic_arguments.map(arg=>arg.method_table_address),[f.other_method_table_address,f.other_method_table_address]);
 assert.ok(type.source_bindings.some(binding=>binding.role==='win-x64-dotnet8-relative-generic-argument-composition'));
 const method=inventory.methods.find(method=>method.qualified_name===f.constructed_name+'.Mix'),field=inventory.fields.find(field=>field.qualified_name===f.constructed_name+'.Serial');assert.equal(method.target_address,f.code);assert.equal(field.offset_bytes,8);assert.equal(field.is_init_only,true);assert.equal(field.reflection_map_flags,'0xa8');assert.equal(digest(f.bytes),before);
});

test('NativeAOT missing, imported/tagged or unbacked argument composition never promotes contextual names or members',()=>{
 for(const options of [{unknownArgument:true},{taggedComposition:true},{unmappedComposition:true}]){const f=aotExtensionFixture(options),inventory=decode(f).identity_recovery.modules[0];assert.ok(!inventory.types.some(type=>type.identity_kind==='constructed-generic'));assert.ok(!inventory.methods.some(method=>method.qualified_name===f.constructed_name+'.Mix'));assert.ok(inventory.constructed_candidates.length>0);}
});

test('NativeAOT readonly reflection flag must agree with metadata while mutable offsets remain supported',()=>{
 const contradictory=aotExtensionFixture({contradictReadonly:true}),bad=decode(contradictory).identity_recovery.modules[0],field=bad.fields.find(field=>field.qualified_name===contradictory.constructed_name+'.Serial');assert.equal(field.binding_status,'metadata-only');assert.equal(field.offset_bytes,null);
 const mutable=aotExtensionFixture({readonly:false}),good=decode(mutable).identity_recovery.modules[0].fields.find(field=>field.qualified_name===mutable.constructed_name+'.Serial');assert.equal(good.binding_status,'associated');assert.equal(good.is_init_only,false);
});

test('NativeAOT added argument proof merging is request-bounded and cancellable without source mutation',()=>{
 const f=aotExtensionFixture(),before=digest(f.bytes);assert.throws(()=>decode(f,{maxAssociationProofWork:1}),error=>error.code==='capacity'&&/proof traversal/.test(error.message));assert.throws(()=>decode(f,{maxAssociationProofWork:1000001}),/bound is invalid/);assert.throws(()=>decode(f,{maxTotalTypes:1}),error=>error.code==='capacity');const c=new AbortController();c.abort();assert.throws(()=>decode(f,{signal:c.signal}),error=>error.name==='AbortError');assert.equal(digest(f.bytes),before);
});
