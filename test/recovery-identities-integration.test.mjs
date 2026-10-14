import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {digest} from '../lib/core.mjs';
import {checkBundle} from '../lib/evidence.mjs';
import {validate} from '../lib/contracts.mjs';
import {engine} from '../lib/engine.mjs';
import {elfFixture} from './artifact-fixtures.mjs';
import {identityFixture} from './native-aot-identity-fixtures.mjs';
import {prepareSwiftDeclarationFixture,swiftDeclarationProviderAvailable,declarationSource} from './swift-declaration-compiler-fixture.mjs';
import {recoveryWorkspace,ownedMcp,ownedCli,sourceBytes} from './recovery-identities-fixture.mjs';

const swiftRequired=process.env.REAL_RUN_SWIFT_VARIATIONS==='1';
const swiftOptions={skip:!swiftDeclarationProviderAvailable&&!swiftRequired,timeout:240000};
const declarationNames=['Reading','RefinedReading','Token','Base','Base.Nested','Child','GenericBase','Specialized','Container','Selection','identity(_:)','make(_:)','globalToken','Store'].sort();
function verifySwift(evidence,fixture){
 assert.equal(validate('inspect_native_dispatch_metadata','output',evidence).valid,true);
 assert.equal(evidence.subject.digest.sha256,digest(fixture.bytes));assert.equal(evidence.normalized_result.target_sha256,digest(fixture.bytes));
 const rows=evidence.normalized_result.result.swift_decls,byName=new Map(rows.map(row=>[row.name,row])),module=evidence.raw_result.swift_ast_modules[0];
 assert.deepEqual(rows.map(row=>row.name).sort(),declarationNames);assert.equal(byName.get('Base').access_level,'open');assert.ok(byName.get('Base').protocols.includes('OwnedVariedDeclarations.Reading'));
 assert.equal(byName.get('Child').super_class,'OwnedVariedDeclarations.Base');assert.equal(byName.get('Specialized').is_final,true);assert.equal(byName.get('Specialized').super_class,'OwnedVariedDeclarations.GenericBase<OwnedVariedDeclarations.Token>');
 assert.equal(byName.get('Store').kind,'actor');assert.equal(byName.get('Base.Nested').kind,'struct');assert.equal(byName.get('globalToken').kind,'global_var');assert.equal(byName.get('make(_:)').kind,'global_func');assert.equal(byName.get('identity(_:)').kind,'global_func');
 assert.equal(module.sha256,digest(fixture.moduleBytes));assert.deepEqual(module.version,{major:0,minor:903});assert.equal(module.decoded_declarations.length,38);
 const raw=new Map(module.decoded_declarations.map(row=>[row.name,row]));assert.equal(raw.get('Base.init(seed:)').is_required,true);assert.equal(raw.get('Base.init()').is_convenience_init,true);assert.equal(raw.get('Child.read()').is_override,true);assert.equal(raw.get('Base.sealed(_:)').is_final,true);
 const extension=module.decoded_declarations.find(row=>row.kind==='extension');assert.equal(extension.access_level,null);assert.match(extension.normalized_disposition,/not serialized/);assert.equal(raw.get('Token.read()').context_id,extension.id);
 assert.equal(raw.get('Selection.empty').kind,'enum_case');assert.equal(raw.get('Selection.empty').access_level,null);assert.equal(byName.has('Selection.empty'),false);assert.equal(byName.has('Child.read()'),false);assert.equal(byName.has('Base.init(seed:)'),false);
 for(const row of module.decoded_declarations){assert.equal(row.location.file_offset,fixture.ast.file_offset+Math.floor(row.bit_offset/8));assert.equal(row.location.bit_in_byte,row.bit_offset%8);assert.ok(row.record_bit_offset<fixture.moduleBytes.length*8);}
 return evidence;
}

test('actual Swift declaration recovery preserves unchanged CLI/MCP projection, evidence and atomic failures',swiftOptions,async t=>{
 assert.ok(swiftDeclarationProviderAvailable,'Strict Swift integration requires the actual configured frontend');
 const workspace=await recoveryWorkspace(t,'swift'),fixture=await prepareSwiftDeclarationFixture({signal:t.signal,evidenceRoot:join(workspace.directory,'compiled')}),selected=join(workspace.directory,'selected-declarations.o'),unrelated=join(workspace.directory,'unrelated-owned.elf'),bundle=join(workspace.directory,'captured-bundle.json');
 await writeFile(selected,fixture.bytes);await writeFile(unrelated,elfFixture());const sourceHash=digest(await readFile(declarationSource));let exportedRecords;
 const observed={mcp_recovery:false,capacity_rejected:false,source_mutation_rejected:false,export_records:0,fresh_import_records:0,cli_recovery:false};
 await t.test('official stdio MCP retains real declarations and unrelated parser evidence',async()=>{
  const session=await ownedMcp(workspace);
  try{
   const independent=await session.call('inspect_binary_layout',{path:unrelated});await session.call('open_binary',{path:selected});
   const recovered=verifySwift(await session.call('inspect_native_dispatch_metadata',{}),fixture);observed.mcp_recovery=true;const before=(await session.call('get_evidence_bundle')).result;assert.equal(before.records.length,2);assert.ok(before.records.some(row=>row.evidence_id===independent.evidence_id));
   const exported=await session.call('export_evidence_bundle',{path:bundle});assert.equal(exported.result.records,2);const checked=checkBundle(JSON.parse(await readFile(bundle,'utf8')));assert.equal(checked.records.length,2);assert.deepEqual(checked.records.find(row=>row.evidence_id===recovered.evidence_id),recovered);exportedRecords=checked.records;observed.export_records=checked.records.length;
   await session.expectError('inspect_native_dispatch_metadata',{max_records:1},'resource_constraint');assert.deepEqual((await session.call('get_evidence_bundle')).result.records,before.records);observed.capacity_rejected=true;
   const changed=Buffer.from(fixture.bytes);changed[fixture.ast.file_offset+16]^=1;await writeFile(selected,changed);
   try{const rejected=await session.expectError('inspect_native_dispatch_metadata',{});assert.match(rejected.message,/Selected artifact changed since open_binary/);assert.deepEqual((await session.call('get_evidence_bundle')).result.records,before.records);observed.source_mutation_rejected=true;observed.source_error_code=rejected.code;}finally{await writeFile(selected,fixture.bytes);}
   await session.call('close_binary',{});
  }finally{await session.close();}
 });
 await t.test('a fresh official SDK client imports exact compiler-derived evidence without selecting or executing the target',async()=>{
  const session=await ownedMcp(workspace);
  try{const imported=await session.call('import_evidence_bundle',{path:bundle});assert.equal(imported.result.imported,2);const retained=(await session.call('get_evidence_bundle')).result;checkBundle(retained);assert.deepEqual(retained.records,exportedRecords);assert.equal((await session.call('binary_session',{})).result.open,false);observed.fresh_import_records=retained.records.length;}finally{await session.close();}
 });
 await t.test('actual Reclaimer CLI decodes the selected wrapped compiler bytes with the same public declaration facts',async()=>{
  verifySwift(await ownedCli(workspace,'inspect-native-dispatch-metadata',selected),fixture);await sourceBytes(selected,fixture.bytes);await sourceBytes(fixture.object,fixture.bytes);await sourceBytes(fixture.moduleFile,fixture.moduleBytes);assert.equal(digest(await readFile(declarationSource)),sourceHash);observed.cli_recovery=true;
 });
 t.diagnostic(JSON.stringify({provider:'actual-configured-Swift-6.1.3',target_sha256:digest(fixture.bytes),module_sha256:digest(fixture.moduleBytes),target_execution:'not-performed',mac_runtime:'not-called',observed}));
});

function verifyIdentityType(evidence,fixture,name=fixture.qualified_name,address=fixture.method_table_address){
 assert.equal(validate('inspect_native_data_type','output',evidence).valid,true);assert.equal(evidence.subject.digest.sha256,digest(fixture.bytes));assert.equal(evidence.confidence,'derived');
 const type=evidence.normalized_result;assert.equal(type.status,'available');assert.equal(type.name,name);assert.equal(type.address,address);assert.equal(type.id,'nativeaot:mt:'+address);assert.equal(type.metadata_recovery.original_name,null);assert.equal(type.metadata_recovery.name_origin,'inferred');assert.equal(type.source,'analysis-database');
 const identity=evidence.raw_result.nativeaot_identity;assert.equal(evidence.raw_result.source_sha256,digest(fixture.bytes));assert.equal(identity.qualified_name,name);assert.equal(identity.method_table_address,address);assert.equal(identity.binding_status,'associated');assert.equal(identity.assembly.name,fixture.assembly_name);
 return identity;
}
function verifyIdentityInventory(evidence,fixture){
 assert.equal(evidence.subject.digest.sha256,digest(fixture.bytes));assert.equal(evidence.confidence,'derived');const raw=evidence.raw_result.nativeaot_identity_recovery;
 assert.equal(raw.source_sha256,digest(fixture.bytes));assert.equal(raw.modules.length,1);const module=raw.modules[0],binding=module.metadata_blob;
 assert.equal(binding.sha256,digest(fixture.bytes.subarray(binding.file_offset,binding.file_offset+binding.size_bytes)));assert.equal(binding.sha256,digest(fixture.metadata));
 assert.deepEqual(module.types.map(row=>row.qualified_name).sort(),['Owned.Widget','Owned.Leaf',fixture.metadata_only_name].sort());assert.ok(module.methods.some(row=>row.qualified_name==='Owned.Widget.Mix'));assert.ok(module.fields.some(row=>row.qualified_name==='Owned.Widget.Serial'));
 const unbound=module.types.find(row=>row.qualified_name===fixture.metadata_only_name);assert.equal(unbound.binding_status,'metadata-only');assert.equal(unbound.method_table_address,null);
 for(const row of [...module.types,...module.methods,...module.fields])for(const source of row.source_bindings){if(source.file_offset!==null){assert.ok(Number.isInteger(source.file_offset)&&source.file_offset>=0);assert.ok(source.file_offset+source.size_bytes<=fixture.bytes.length);assert.equal(source.sha256,digest(fixture.bytes.subarray(source.file_offset,source.file_offset+source.size_bytes)));}}
 return module;
}

test('owned NativeAOT identities cross real CLI/MCP boundaries without promoting unbound names or failed requests',{timeout:300000},async t=>{
 const workspace=await recoveryWorkspace(t,'native'),fixture=identityFixture(),selected=join(workspace.directory,'associated-identities.elf'),unrelated=join(workspace.directory,'unrelated-layout.elf'),bundle=join(workspace.directory,'native-identities.json');
 await writeFile(selected,fixture.bytes);await writeFile(unrelated,elfFixture());let exportedRecords;const observed={fresh_cli:false,mcp_association:false,derived_bindings_verified:0,source_mutation_rejected:false,imported_records:0,no_map_suppressed:false,conflict_suppressed:false,late_cancellation:false};
 await t.test('fresh CLI datatype lookup lazily recovers inferred identity and the legacy generated alias',async()=>{
  const direct=await ownedCli(workspace,'inspect-native-data-type',selected,['--address',fixture.method_table_address]);verifyIdentityType(direct,fixture);
  const alias=await ownedCli(workspace,'inspect-native-data-type',selected,['--type',fixture.generated_alias]);verifyIdentityType(alias,fixture);assert.equal(alias.normalized_result.id,direct.normalized_result.id);observed.fresh_cli=true;
 });
 await t.test('official MCP validates physical and derived bindings, then exports/imports unchanged identity evidence',async()=>{
  const session=await ownedMcp(workspace);
  try{
   const independent=await session.call('inspect_binary_layout',{path:unrelated});await session.call('open_binary',{path:selected});const load=await session.call('inspect_native_load_image',{}),module=verifyIdentityInventory(load,fixture);
   const rows=load.normalized_result.observations.metadata_recovery[0].types;assert.deepEqual(rows,[{address:fixture.method_table_address,type:fixture.qualified_name},{address:fixture.other_method_table_address,type:'Owned.Leaf'}]);
   const type=await session.call('inspect_native_data_type',{address:fixture.method_table_address}),identity=verifyIdentityType(type,fixture);
   for(const selector of [fixture.generated_alias,fixture.qualified_name,type.normalized_result.id]){const alias=await session.call('inspect_native_data_type',{type:selector});verifyIdentityType(alias,fixture);assert.equal(alias.normalized_result.id,type.normalized_result.id);}
   verifyIdentityType(await session.call('inspect_native_data_type',{address:fixture.other_method_table_address}),fixture,'Owned.Leaf',fixture.other_method_table_address);
   for(const source of identity.source_bindings.filter(source=>source.file_offset===null)){const bytes=await session.call('read_bytes',{address:source.address,length:source.size_bytes});assert.equal(bytes.normalized_result.complete,true);assert.equal(digest(Buffer.from(bytes.normalized_result.bytes_hex,'hex')),source.sha256);assert.equal(bytes.raw_result.derived_memory.sha256,source.derived_memory_sha256);observed.derived_bindings_verified++;}
   assert.equal(observed.derived_bindings_verified,2);assert.equal(module.types.filter(row=>row.binding_status==='associated').length,2);observed.mcp_association=true;
   const before=(await session.call('get_evidence_bundle')).result;assert.ok(before.records.some(row=>row.evidence_id===independent.evidence_id));const exported=await session.call('export_evidence_bundle',{path:bundle});assert.equal(exported.result.records,before.records.length);const persisted=checkBundle(JSON.parse(await readFile(bundle,'utf8')));assert.deepEqual(persisted.records,before.records);exportedRecords=persisted.records;
   const changed=Buffer.from(fixture.bytes);changed[fixture.metadata_file_offset+16]^=1;await writeFile(selected,changed);
   try{const error=await session.expectError('inspect_native_data_type',{type:fixture.generated_alias});assert.match(error.message,/Selected artifact changed since open_binary/);assert.deepEqual((await session.call('get_evidence_bundle')).result.records,before.records);observed.source_mutation_rejected=true;}finally{await writeFile(selected,fixture.bytes);}
   verifyIdentityType(await session.call('inspect_native_data_type',{type:fixture.generated_alias}),fixture);await session.call('close_binary',{});
  }finally{await session.close();}
  const fresh=await ownedMcp(workspace);
  try{const imported=await fresh.call('import_evidence_bundle',{path:bundle});assert.equal(imported.result.imported,exportedRecords.length);assert.deepEqual((await fresh.call('get_evidence_bundle')).result.records,exportedRecords);assert.equal((await fresh.call('binary_session',{})).result.open,false);observed.imported_records=exportedRecords.length;}finally{await fresh.close();}
 });
 await t.test('actual metadata-only and contradictory TypeMaps preserve generated names with no semantic promotion',async()=>{
  const session=await ownedMcp(workspace);
  try{for(const options of [{includeMap:false},{conflict:true}]){const control=identityFixture(options),file=join(workspace.directory,options.conflict?'conflicting-identities.elf':'metadata-only-identities.elf');await writeFile(file,control.bytes);await session.call('open_binary',{path:file});const load=await session.call('inspect_native_load_image',{}),module=verifyIdentityInventory(load,control);
    assert.ok(module.types.every(row=>row.binding_status==='metadata-only'&&row.method_table_address===null));assert.deepEqual(load.normalized_result.observations.metadata_recovery[0].types,[{address:control.method_table_address,type:control.generated_alias},{address:control.other_method_table_address,type:'NativeAOT_MT_403300'}]);
    const type=(await session.call('inspect_native_data_type',{address:control.method_table_address})).normalized_result;assert.equal(type.status,'available');assert.equal(type.name,control.generated_alias);assert.equal(type.metadata_recovery.name_origin,'generated');assert.equal(type.metadata_recovery.original_name,null);
    if(options.conflict){assert.equal(module.conflicts.length,1);assert.equal(module.conflicts[0].method_table_address,control.method_table_address);assert.equal(module.conflicts[0].identities.length,2);observed.conflict_suppressed=true;}else{assert.equal(module.conflicts.length,0);observed.no_map_suppressed=true;}await session.call('close_binary',{});await sourceBytes(file,control.bytes);
   }}finally{await session.close();}
 });
 await t.test('late cancellation of actual lazy recovery preserves unrelated evidence and publishes no identity annotations',async()=>{
  const controller=new AbortController(),ctx=await engine({signal:controller.signal,config:{temporaryDirectory:workspace.directory}});let original;
  try{
   await ctx.call('inspect_binary_layout',{path:unrelated});await ctx.call('open_binary',{path:selected});const prior=[...ctx.ledger],names=[...ctx.nativeSession.names],recovery=ctx.nativeSession.nativeRecovery;original=ctx.evidence.bind(ctx);
   ctx.evidence=async(...args)=>{const result=await original(...args);if(args[0]==='inspect_native_data_type')controller.abort(new Error('Owned late-native identity cancellation'));return result;};
   await assert.rejects(()=>ctx.call('inspect_native_data_type',{address:fixture.method_table_address}),/Owned late-native identity cancellation/);assert.deepEqual([...ctx.ledger],prior);assert.deepEqual([...ctx.nativeSession.names],names);assert.equal(ctx.nativeSession.nativeRecovery,recovery);observed.late_cancellation=true;
   ctx.signal=null;ctx.evidence=original;verifyIdentityType(await ctx.call('inspect_native_data_type',{address:fixture.method_table_address}),fixture);
  }finally{ctx.signal=null;if(original)ctx.evidence=original;if(ctx.target)await ctx.call('close_binary',{});}
 });
 await sourceBytes(selected,fixture.bytes);t.diagnostic(JSON.stringify({provider:'owned-self-describing-NativeAOT-ELF',target_sha256:digest(fixture.bytes),target_execution:'not-performed',runtime_type_execution:'not-observed',observed}));
});
