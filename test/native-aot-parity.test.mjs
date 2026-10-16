import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Context } from '../lib/core.mjs';
import { handlers } from '../lib/native.mjs';
import { digest } from '../lib/artifact-binary.mjs';
import { rehydrateAot, recoverNativeAot } from '../lib/native-aot.mjs';
import { elfFixture } from './artifact-fixtures.mjs';

function stream(){const b=Buffer.alloc(33);b.writeInt32LE(0x2000,0);b.writeUInt32LE(25,4);let p=8;b[p++]=3<<3;Buffer.from('own').copy(b,p);p+=3;b[p++]=(5<<3)|1;b[p++]=(1<<3)|3;b[p++]=2;b[p++]=(1<<3)|5;b.writeInt32LE(0x3000,p);p+=4;b[p++]=(1<<3)|4;b.writeInt32LE(0x4000,p);p+=4;assert.equal(p,25);b.writeInt32LE(0x5000,25);b.writeInt32LE(0x6000,29);return b;}
function expected(){const b=Buffer.alloc(32);b.write('own');b.writeBigUInt64LE(0x701dn,8);b.writeInt32LE(0x3009,16);b.writeBigUInt64LE(0x4010n,20);b.writeInt32LE(0x1ff9,28);return b;}
function fixture(){const b=elfFixture();b.fill(0,256);b.writeBigUInt64LE(256n,96);b.writeBigUInt64LE(256n,104);b.writeUInt32LE(0x00525452,256);b.writeUInt16LE(31,260);b.writeUInt16LE(2,268);b[270]=16;b[271]=1;b.writeUInt32LE(204,272);b.writeUInt32LE(8,276);b.writeBigUInt64LE(0x400040n,280);b.writeUInt32LE(207,288);b.writeUInt32LE(33,292);b.writeBigUInt64LE(0x400050n,296);const s=stream();s.copy(b,336);return b;}
test('NativeAOT rehydration preserves literals, zeros, table and inline absolute/relative pointers',()=>{const r=rehydrateAot(stream(),0x1000n,8);assert.equal(r.address,0x3000n);assert.equal(r.commands,6);assert.deepEqual(r.bytes,expected());});
test('NativeAOT extended commands, invalid fixups/opcodes and output overflow remain bounded',()=>{const b=Buffer.alloc(40);b.writeInt32LE(0x1000);b.writeUInt32LE(40,4);b[8]=29<<3;b[9]=2;b.fill(0x61,10);assert.equal(rehydrateAot(b,0x1000,4).bytes.length,30);const invalid=stream();invalid[13]=(20<<3)|3;assert.throws(()=>rehydrateAot(invalid,0x1000,8),/outside the lookup table/);const opcode=stream();opcode[8]=6;assert.throws(()=>rehydrateAot(opcode,0x1000,8),/opcode/);assert.throws(()=>rehydrateAot(stream(),0x1000,8,{maxBytes:10}),/budget/);const truncated=Buffer.alloc(13);truncated.writeUInt32LE(9,4);truncated[8]=31<<3;assert.throws(()=>rehydrateAot(truncated,0x1000,4),/extended command/);});
test('NativeAOT-shaped owned bytes retain actual derived memory with unchanged load-image schema',async t=>{const bytes=fixture(),root=await fs.mkdtemp(path.resolve('.aot-parity-')),file=path.join(root,'owned.elf'),ctx=new Context({signal:t.signal});ctx.handlers=handlers;t.after(async()=>{if(ctx.target)await ctx.call('close_binary',{});assert.ok(root.startsWith(path.resolve('.')+path.sep)&&path.basename(root).startsWith('.aot-parity-'));await fs.rm(root,{recursive:true,force:true});});await fs.writeFile(file,bytes);await ctx.call('open_binary',{path:file});const r=(await ctx.call('inspect_native_load_image',{})).normalized_result,metadata=r.observations.metadata_recovery[0];assert.equal(r.status,'unsupported');assert.equal(r.observations.mappings.length,0);assert.equal(metadata.status,'partial');assert.equal(metadata.header_address,'0x400000');assert.equal(metadata.format_major,31);assert.equal(metadata.derived_memory.address,'0x402050');const decoded=rehydrateAot(stream(),0x400050n,8);assert.equal(metadata.derived_memory.sha256,digest(decoded.bytes));assert.equal(metadata.derived_memory.size_bytes,32);assert.equal(metadata.method_tables,0);assert.deepEqual(metadata.types,[]);assert.equal(metadata.analysis_artifact_sha256,digest(bytes));assert.equal(digest(await fs.readFile(file)),digest(bytes));});
test('CoreCLR RTR signature alone is never labeled NativeAOT and malformed sections do not fabricate recovery',()=>{const generic=fixture();generic[270]=0;const model={segments:[{start:'0x400000',file_offset:256,file_size:256}],symbols:[]};assert.deepEqual(recoverNativeAot(generic,model,digest(generic),'x86_64'),[]);const truncated=fixture();truncated.writeUInt16LE(200,268);assert.deepEqual(recoverNativeAot(truncated,model,digest(truncated),'x86_64'),[]);const unavailable=fixture();unavailable.writeBigUInt64LE(0x800000n,296);const report=recoverNativeAot(unavailable,model,digest(unavailable),'x86_64')[0];assert.equal(report.derived_memory,null);assert.ok(report.diagnostics.some(d=>d.includes('not uniquely file-backed')));});
test('actual .NET NativeAOT compiler output yields bounded static rehydration from owned C#',{
 skip:process.env.REAL_RUN_NATIVE_VARIATIONS!=='1',timeout:120000,
},async t=>{
  const base=path.join(path.resolve(process.env.REAL_TEST_EVIDENCE_ROOT??path.join(import.meta.dirname,'provider-fixtures')),'parity-20261013/owned-aot');
  const build=JSON.parse(await fs.readFile(path.join(base,'retry-build-receipt.json'),'utf8'));
  assert.equal(build.success,true);
  const file=path.join(base,'OwnedProbe.exe'),bytes=await fs.readFile(file);
  assert.equal(digest(bytes),build.target_sha256);
  assert.equal(build.target_sha256,'276ad7a50b8f0941b6001e2c84b4f1f1b0f3094e853f8d1f078ff7e397b3dda0');
  for(const source of build.sources){
    assert.equal(digest(await fs.readFile(path.join(import.meta.dirname,'fixtures/native-owned-aot',source.name))),source.sha256);
  }
  const ctx=new Context({signal:t.signal});ctx.handlers=handlers;
  t.after(async()=>{if(ctx.target)await ctx.call('close_binary',{});});
  await ctx.call('open_binary',{path:file});
  const load=await ctx.call('inspect_native_load_image',{}),records=load.normalized_result.observations.metadata_recovery??[];
  assert.equal(load.confidence,'derived');
  assert.equal(load.subject.digest.sha256,build.target_sha256);
  assert.equal(records.length,1);
  const committed=records[0],identityRecovery=load.raw_result.nativeaot_identity_recovery;
  assert.equal(identityRecovery.source_sha256,build.target_sha256);
  assert.equal(identityRecovery.modules.length,1);
  const inventory=identityRecovery.modules[0];
  assert.equal(committed.header_address,'0x14016be28');
  assert.equal(inventory.header_address,committed.header_address);
  assert.equal(committed.status,'partial');
  assert.equal(committed.analysis_artifact_sha256,build.target_sha256);
  assert.equal(committed.method_tables,766);
  assert.equal(committed.types.length,committed.method_tables);
  assert.equal(committed.coverage.frozen_objects_annotated,778);
  assert.equal(inventory.types.filter(type=>!type.identity_kind).length,588);
  assert.equal(inventory.types.filter(type=>type.identity_kind==='constructed-generic').length,11);
  assert.equal(inventory.methods.filter(method=>!method.identity_kind).length,79);
  assert.equal(inventory.fields.length,135);
  assert.equal(inventory.extra_types.length,470);
  const associated=inventory.types.filter(type=>type.binding_status==='associated');
  assert.equal(associated.length,536);
  const byAddress=new Map(associated.map(type=>[type.method_table_address,type]));
  assert.equal(byAddress.size,536);
  for(const type of committed.types){
    const identity=byAddress.get(type.address);
    assert.equal(type.type,identity?.qualified_name??'NativeAOT_MT_'+BigInt(type.address).toString(16));
  }
  const generated=committed.types.filter(type=>!byAddress.has(type.address));
  assert.equal(generated.length,230);

  const derivedEvidence=await ctx.call('read_bytes',{address:committed.derived_memory.address,length:committed.derived_memory.size_bytes});
  const derivedRead=derivedEvidence.normalized_result,rebuilt=Buffer.from(derivedRead.bytes_hex,'hex');
  assert.equal(derivedRead.returned_bytes,216368);
  assert.equal(derivedRead.complete,true);
  assert.equal(digest(rebuilt),committed.derived_memory.sha256);
  assert.equal(derivedEvidence.confidence,'derived');
  assert.equal(derivedEvidence.provider.id,'reclaimer-nativeaot-session');
  assert.equal(derivedEvidence.raw_result.derived_memory.file_offset,null);
  assert.equal(derivedEvidence.raw_result.returned_bytes_sha256,committed.derived_memory.sha256);
  const selectedIdentities=[];
  let fileBindings=0,derivedBindings=0;
  for(const expected of [
    {name:'System.String',address:'0x1400f81f0',assembly:'System.Private.CoreLib'},
    {name:'Program',address:'0x1400f7a18',assembly:'OwnedProbe'},
    {name:'OwnedProbe',address:'0x1400f79e0',assembly:'OwnedProbe'},
    {name:'System.Collections.Generic.EqualityComparer`1',address:'0x1400f6e40',assembly:'System.Private.CoreLib',arity:1},
  ]){
    const evidence=await ctx.call('inspect_native_data_type',{address:expected.address});
    const datatype=evidence.normalized_result,identity=evidence.raw_result.nativeaot_identity;
    const legacyAlias='NativeAOT_MT_'+BigInt(expected.address).toString(16);
    assert.equal(datatype.id,'nativeaot:mt:'+expected.address);
    assert.equal(datatype.name,expected.name);
    assert.equal(datatype.metadata_recovery.name_origin,'inferred');
    assert.equal(datatype.metadata_recovery.original_name,null);
    assert.equal(evidence.raw_result.source_sha256,build.target_sha256);
    assert.equal(identity.binding_status,'associated');
    assert.equal(identity.qualified_name,expected.name);
    assert.equal(identity.assembly.name,expected.assembly);
    assert.equal(identity.method_table_address,expected.address);
    assert.equal(byAddress.get(expected.address).qualified_name,expected.name);
    if(expected.arity){assert.equal(identity.generic_parameter_count,expected.arity);assert.equal(identity.generic_parameters[0].name,'T');assert.equal(datatype.metadata_recovery.base_size_bytes,0);}
    for(const role of ['metadata-record','metadata-name','type-map-runtime-reference-and-metadata-token',
      'common-fixup-relative-method-table-pointer','recorded-method-table-hash','validated-fixed-method-table-layout']){
      assert.ok(identity.source_bindings.some(binding=>binding.role===role),role);
    }
    for(const binding of identity.source_bindings){
      let selected;
      if(binding.file_offset===null){
        const offset=Number(BigInt(binding.address)-BigInt(committed.derived_memory.address));
        assert.ok(Number.isSafeInteger(offset)&&offset>=0&&offset+binding.size_bytes<=rebuilt.length);
        assert.equal(binding.derived_memory_sha256,committed.derived_memory.sha256);
        selected=rebuilt.subarray(offset,offset+binding.size_bytes);derivedBindings++;
      }else{
        assert.ok(Number.isSafeInteger(binding.file_offset)&&binding.file_offset>=0&&binding.file_offset+binding.size_bytes<=bytes.length);
        selected=bytes.subarray(binding.file_offset,binding.file_offset+binding.size_bytes);fileBindings++;
      }
      assert.equal(digest(selected),binding.sha256,binding.role);
    }
    for(const selector of [expected.name,expected.assembly+'::'+expected.name,legacyAlias,datatype.id]){
      const alias=(await ctx.call('inspect_native_data_type',{type:selector})).normalized_result;
      assert.equal(alias.id,datatype.id);
      assert.equal(alias.name,expected.name);
      assert.equal(alias.metadata_recovery.name_origin,'inferred');
      assert.equal(alias.metadata_recovery.original_name,null);
    }
    selectedIdentities.push({qualified_name:identity.qualified_name,assembly:identity.assembly,
      method_table_address:identity.method_table_address,legacy_alias:legacyAlias,source_bindings:identity.source_bindings});
  }
  assert.ok(fileBindings>0&&derivedBindings>0);
  const generatedEvidence=await ctx.call('inspect_native_data_type',{address:generated[0].address});
  const generatedType=generatedEvidence.normalized_result;
  assert.equal(generatedType.name,generated[0].type);
  assert.equal(generatedType.metadata_recovery.name_origin,'generated');
  assert.equal(generatedType.metadata_recovery.original_name,null);
  assert.equal(generatedEvidence.raw_result?.nativeaot_identity,undefined);
  for(const selector of [generatedType.name,generatedType.id]){
    const alias=(await ctx.call('inspect_native_data_type',{type:selector})).normalized_result;
    assert.equal(alias.id,generatedType.id);
    assert.equal(alias.metadata_recovery.name_origin,'generated');
    assert.equal(alias.metadata_recovery.original_name,null);
  }

  // This compiler-produced frozen CRLF is an observed storage record, not a runtime allocation.
  const instance=(await ctx.call('inspect_native_data_type',{address:'0x1400e6d80'})).normalized_result;
  assert.equal(instance.id,'nativeaot:instance:0x1400e6d80');
  assert.equal(instance.fields.find(field=>field.name==='component_count').offset_bytes,8);
  assert.equal(instance.fields.find(field=>field.name==='utf16_data').offset_bytes,12);
  const storageEvidence=await ctx.call('read_bytes',{address:instance.address,length:16});
  const storage=Buffer.from(storageEvidence.normalized_result.bytes_hex,'hex');
  assert.equal(storage.readBigUInt64LE(0),0x1400f81f0n);
  assert.equal(storage.readUInt32LE(8),2);
  assert.deepEqual(storage.subarray(12),Buffer.from('\r\n','utf16le'));
  assert.equal(storageEvidence.confidence,'derived');
  assert.equal(storageEvidence.raw_result.derived_memory.file_offset,null);
  assert.equal(storageEvidence.raw_result.returned_bytes_sha256,digest(storage));
  assert.equal(digest(await fs.readFile(build.retained_target)),build.target_sha256);

  const notices=[];
  async function walk(dir){
    for(const entry of await fs.readdir(dir,{withFileTypes:true})){
      const notice=path.join(dir,entry.name);
      if(entry.isDirectory())await walk(notice);
      else if(/^(?:LICENSE|NOTICE|THIRD.PARTY)/i.test(entry.name))notices.push({path:notice,sha256:digest(await fs.readFile(notice))});
    }
  }
  await walk(path.join(base,'packages'));assert.ok(notices.length>=6);
  await fs.writeFile(path.resolve('docs/verification/NATIVEAOT_PROVIDER_REPORT.json'),JSON.stringify({
    verified_at:new Date().toISOString(),sdk:build.sdk_version,compiler_package:'Microsoft.DotNet.ILCompiler 8.0.31',
    artifact_sha256:build.target_sha256,artifact_bytes:bytes.length,source_records:build.sources,
    target_execution:'not-performed',source_preserved:true,recovery:records,
    identity_summary:{metadata_types:588,metadata_methods:79,metadata_fields:135,generic_definitions:118,constructed_generics:11,
      associated_types:536,generated_types:230,extra_anchored_tables:470,selected_identities:selectedIdentities,
      selected_generated_type:{id:generatedType.id,address:generatedType.address,name:generatedType.name},
      frozen_storage:{address:instance.address,method_table_address:'0x1400f81f0',component_count:2,
        utf16_bytes_hex:storage.subarray(12).toString('hex'),storage_sha256:digest(storage)}},
    private_vendor_notices:notices,
    limitations:[
      'Static selected-byte analysis of this retained .NET 8.0.425/ILCompiler 8.0.31 owned Windows x64 specimen commits 766 fixed method tables and 778 frozen storage records. Names associate for 407 canonical TypeDefinitions, 118 arity-matched generic definitions and 11 one-argument relative constructed contexts; 230 tables retain generated names. Public original_name remains null and generated aliases remain stable.',
      'The original metadata inventory includes 79 methods and 135 fields. Supported InvokeMap packets retain selected-byte entrypoint associations, which can identify reflection stubs rather than complete native method bodies. This older specimen has no nonempty supported FieldAccessMap member entries. Multi-argument/imported/dynamic/optional generic tails, shared canonical arguments, GC descriptors, interface dispatch maps and complete managed instance layouts remain outside the supported profile.',
      'The 216368 reconstructed bytes and selected frozen string storage are derived static observations, not live process memory. This case does not execute the target, modify its bytes or annotate a vendor database, and establishes no Mac or other compiler-version runtime coverage.',
    ],success:true,
  },null,2)+'\n');
});
