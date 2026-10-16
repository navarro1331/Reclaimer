import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { digest } from '../lib/artifact-binary.mjs';
import { recoverNativeAotDetailed } from '../lib/native-aot.mjs';
import { NativeCursor, nativeFormatBudget } from '../lib/native-format.mjs';
import { NativeMetadata } from '../lib/native-format-metadata.mjs';
import { identityFixture, nativeUInt } from './native-aot-identity-fixtures.mjs';
import { AotNativeSignatures, aotSignatureProvenanceBudget } from '../lib/native-aot-signatures.mjs';
import { Context } from '../lib/core.mjs';
import { handlers } from '../lib/native.mjs';
import { recoverNativeAotIdentities } from '../lib/native-aot-identity.mjs';

const packet=(...items)=>Buffer.concat(items.map(item=>Buffer.isBuffer(item)?item:nativeUInt(item)));
const list=items=>packet(items.length,...items);

function genericDefinitionFixture({pointerSize=8,arity=1,malformedBase=false}={}) {
  const f=identityFixture({pointerSize,noFrozen:true});
  const reader=new NativeMetadata(f.metadata,{budget:nativeFormatBudget()}),old=reader.type(f.handles.type_widget.offset),fields=old.record.fields;
  const nameOffset=f.metadata.length,name=packet(1,Buffer.from('T'));
  const parameterOffset=nameOffset+name.length,parameter=packet(0,0,0,nameOffset,list([]),list([]));
  const typeOffset=parameterOffset+parameter.length;
  const type=packet(fields.flags,0,fields.namespace,fields.name,0,0,0,list([]),list(fields.methods),list(fields.fields),list([]),list([]),list([parameterOffset]),list([]),list([]));
  const metadata=Buffer.concat([f.metadata,name,parameter,type]);
  // Replace the recorded namespace membership, rather than creating an unlisted type.
  const namespace=new NativeCursor(metadata,f.handles.namespace.offset);namespace.u();namespace.u();namespace.u();
  nativeUInt(typeOffset).copy(metadata,namespace.offset);
  metadata.copy(f.bytes,f.metadata_file_offset);
  for(let at=0x410;at<0x470;at+=8+pointerSize)if(f.bytes.readUInt32LE(at)===313)f.bytes.writeUInt32LE(metadata.length,at+4);
  nativeUInt(0x3a000000+typeOffset).copy(f.bytes,f.type_map_file_offset+26);
  const rebuiltAt=f.rebuilt_file_offset+0x180;
  f.bytes.writeUInt32LE(0xd0030000+arity,rebuiltAt);
  f.bytes.writeUInt32LE(malformedBase?24:0,rebuiltAt+4);
  f.bytes.fill(0,rebuiltAt+8,rebuiltAt+12+pointerSize);
  return {...f,metadata,typeOffset,parameterOffset};
}

test('NativeAOT TypeMap associates an owned generic definition only with its matching fixed header',()=>{
  for(const pointerSize of [4,8]){
    const f=genericDefinitionFixture({pointerSize}),r=recoverNativeAotDetailed(f.bytes,f.model,digest(f.bytes),f.architecture);
    const type=r.modules[0].types.find(type=>type.address===f.method_table_address);
    assert.ok(type,'the TypeMap generic-definition anchor must produce a fixed-header record');
    assert.equal(type.kind,'generic-definition');
    assert.equal(type.generic_parameter_count,1);
    assert.equal(type.component_size_bytes,0);
    assert.equal(type.base_size_bytes,0);
    assert.equal(type.identity.qualified_name,'Owned.Widget');
    assert.equal(type.identity.generic_parameter_count,1);
    assert.equal(type.name,f.generated_alias);
    assert.equal(r.modules[0].instances.length,0);
  }
});

test('NativeAOT generic metadata arity or malformed header cannot label a method table',()=>{
  for(const options of [{arity:2},{malformedBase:true}]){
    const f=genericDefinitionFixture(options),r=recoverNativeAotDetailed(f.bytes,f.model,digest(f.bytes),f.architecture);
    assert.ok(!r.modules[0].types.some(type=>type.address===f.method_table_address));
    assert.equal(r.identity_recovery.modules[0].types.find(type=>type.qualified_name==='Owned.Widget').binding_status,'metadata-only');
  }
});

function signatureFixture({cycle=false,badVariable=false,wrongRank=false,duplicateParameters=false,argumentKey=null,assemblyName='Reclaimer.Owned.Completion',namespaceName='Owned',repeatedParameters=0,genericParameterRepeat=0,constraintRepeat=0,provenanceWidth=0,provenanceDepth=20,provenanceRepeat=1024,provenanceConstraints=false}={}) {
  const records=[],byName=new Map(),add=(name,kind,make)=>{const value={name,kind,make,offset:0};records.push(value);byName.set(name,value);};
  const at=name=>byName.get(name)?.offset??0,handle=name=>at(name)*256+byName.get(name).kind;
  for(const [name,value] of Object.entries({assembly:assemblyName,core:'System.Private.CoreLib',empty:'',namespace:namespaceName,system:'System',box:'Box`1',packed:'PackedLedger',atom:'Atom',int32:'Int32',comparable:'IComparable`1',echo:'Echo',serial:'Serial',content:'Content',t:'T',u:'U',module:'Completion.dll'})){
    add(name,26,()=>packet(Buffer.byteLength(value),Buffer.from(value)));
  }
  add('scope',56,()=>packet(0,at('assembly'),0,1,0,0,0,list([]),at('empty'),at('root'),0,0,list([]),at('module'),list([]),list([])));
  add('scope_ref',57,()=>packet(0,at('core'),8,0,0,0,list([]),at('empty')));
  add('root',47,()=>packet(handle('scope'),at('empty'),list([]),list([]),list([at('namespace_record')])));
  add('namespace_record',47,()=>packet(handle('root'),at('namespace'),list([at('box_type'),at('packed_type'),at('atom_type')]),list([]),list([])));
  add('namespace_ref',48,()=>packet(handle('scope_ref'),at('system')));
  add('int32_ref',61,()=>packet(handle('namespace_ref'),at('int32')));
  add('comparable_ref',61,()=>packet(handle('namespace_ref'),at('comparable')));
  const type=(name,flags,size,packing,methods,fields,generics)=>packet(flags,0,at('namespace_record'),at(name),size,packing,0,list([]),list(methods.map(at)),list(fields.map(at)),list([]),list([]),list(generics.map(at)),list([]),list([]));
  add('box_type',58,()=>type('box',1,0,0,['echo_method'],['content_field'],genericParameterRepeat?Array.from({length:genericParameterRepeat},(_,index)=>'repeated_parameter_'+index):duplicateParameters?['parameter_t','parameter_t']:['parameter_t']));
  add('packed_type',58,()=>type('packed',0x11,32,4,[],['serial_field'],[]));
  add('atom_type',58,()=>type('atom',1,0,0,[],[],[]));
  add('parameter_t',38,()=>packet(0,0,0,at('t'),list(provenanceWidth&&provenanceConstraints?Array(provenanceRepeat).fill(handle('provenance_instantiation')):[handle('constraint_spec')]),list([])));
  add('parameter_u',38,()=>packet(0,0,1,at('u'),list([]),list([])));
  add('type_variable',63,()=>packet(badVariable?1:0));
  add('method_variable',44,()=>packet(0));
  add('constraint_instantiation',60,()=>packet(handle('comparable_ref'),list([handle('type_variable')])));
  add('constraint_spec',62,()=>packet(handle('constraint_instantiation')));
  add('box_instantiation',60,()=>packet(handle('box_type'),list([handle('type_variable')])));
  add('box_spec',62,()=>packet(handle(cycle?'box_spec':'box_instantiation')));
  add('type_byref',2,()=>packet(handle('type_variable')));
  add('method_array',55,()=>packet(handle('method_variable')));
  add('pointer',50,()=>packet(handle('int32_ref')));
  add('multidimensional',1,()=>packet(handle('int32_ref'),wrongRank?0:2,list([3,4]),packet(2,nativeUInt(0xffffffff),0)));
  add('modified',45,()=>packet(0,handle('atom_type'),handle('pointer')));
  add('function_method',43,()=>packet(0,0,handle('int32_ref'),list([handle('pointer')]),list([])));
  add('function_pointer',37,()=>packet(at('function_method')));
  add('echo_method',40,()=>packet(6,0,at('echo'),at('echo_signature'),list([]),list([at('parameter_u')]),list([])));
  add('echo_signature',43,()=>packet(0x20,1,handle('box_spec'),list(provenanceWidth&&!provenanceConstraints?Array(provenanceRepeat).fill(handle('provenance_instantiation')):repeatedParameters?Array(repeatedParameters).fill(handle('atom_type')):[handle('type_byref'),handle('method_array')]),list([])));
  add('content_field',35,()=>packet(6,at('content'),at('content_signature'),0,0,list([])));
  add('content_signature',36,()=>packet(handle('type_variable')));
  add('serial_field',35,()=>packet(6,at('serial'),at('serial_signature'),0,8,list([])));
  add('serial_signature',36,()=>packet(handle('int32_ref')));
  for(let index=0;index<genericParameterRepeat;index++)add('repeated_parameter_'+index,38,()=>packet(index,0,0,at('t'),list(Array(constraintRepeat).fill(handle('atom_type'))),list([])));
  for(let index=0;index<provenanceWidth;index++)for(let depth=0;depth<provenanceDepth;depth++)add('provenance_'+index+'_'+depth,62,()=>packet(handle(depth?'provenance_'+index+'_'+(depth-1):'atom_type')));
  if(provenanceWidth)add('provenance_instantiation',60,()=>packet(handle('comparable_ref'),list(Array.from({length:provenanceWidth},(_,index)=>handle('provenance_'+index+'_'+(provenanceDepth-1))))));
  if(argumentKey){
    add('argument_scope',56,()=>packet(1,at('core'),0,8,0,0,0,packet(argumentKey.length,argumentKey),at('empty'),at('argument_root'),0,0,list([]),at('module'),list([]),list([])));
    add('argument_root',47,()=>packet(handle('argument_scope'),at('system'),list([at('argument_type')]),list([]),list([])));
    add('argument_type',58,()=>packet(1,0,at('argument_root'),at('int32'),0,0,0,list([]),list([]),list([]),list([]),list([]),list([]),list([]),list([])));
  }
  let offset=argumentKey?19:14;for(const record of records){record.offset=offset;offset+=record.make().length;}
  const metadata=Buffer.concat([Buffer.from([0xfd,0xdf,0xad,0xde]),list([at('scope'),...(argumentKey?[at('argument_scope')]:[])]),...records.map(record=>record.make())]);
  return {metadata,at,handle:name=>({kind:byName.get(name).kind,offset:at(name)})};
}

test('NativeAOT metadata expands generic parameters, constraints and method return/parameter signatures',()=>{
  const f=signatureFixture(),reader=new NativeMetadata(f.metadata,{budget:nativeFormatBudget()}),signatures=new AotNativeSignatures(reader);
  assert.equal(reader.inventory().types.length,3);
  const generic=signatures.genericParameters([f.at('parameter_t')],0,{typeArity:1});
  assert.equal(generic.value[0].name,'T');
  assert.equal(generic.value[0].constraints[0].display_name,'System.IComparable`1<!0>');
  const method=signatures.method(f.at('echo_signature'),{typeArity:1,methodArity:1});
  assert.equal(method.value.return_type.display_name,'Owned.Box`1<!0>');
  assert.deepEqual(method.value.parameters.map(parameter=>parameter.display_name),['!0&','!!0[]']);
  assert.equal(method.value.return_type.signature.arguments[0].kind,'type-variable');
  assert.ok(method.records.some(record=>record.offset===f.at('box_instantiation')));
  assert.ok(method.records.some(record=>record.offset===f.at('type_byref')));
  assert.equal(signatures.genericParameters([f.at('parameter_u')],1,{typeArity:1,methodArity:1}).value[0].kind,'method');
});

test('NativeAOT metadata preserves pointer, multidimensional bounds, required modifier and function-pointer signatures',()=>{
  const f=signatureFixture(),reader=new NativeMetadata(f.metadata,{budget:nativeFormatBudget()}),signatures=new AotNativeSignatures(reader);
  const array=signatures.signature(f.handle('multidimensional')).value;
  assert.equal(array.display_name,'System.Int32[,]');
  assert.deepEqual(array.sizes,[3,4]);assert.deepEqual(array.lower_bounds,[-1,0]);
  const modifier=signatures.signature(f.handle('modified')).value;
  assert.equal(modifier.display_name,'modreq(Owned.Atom) System.Int32*');assert.equal(modifier.optional,false);
  assert.equal(signatures.signature(f.handle('function_pointer')).value.display_name,'methodptr(System.Int32(System.Int32*))');
  assert.equal(signatures.field(f.at('serial_signature')).value.display_name,'System.Int32');
});

test('NativeAOT signatures reject cycles, variable/shape contradictions, duplicate generic ordinals and resource/cancel failures',()=>{
  for(const [options,name,context] of [[{cycle:true},'box_spec',{typeArity:1}],[{badVariable:true},'type_variable',{typeArity:1}],[{wrongRank:true},'multidimensional',{}]]){
    const f=signatureFixture(options),reader=new NativeMetadata(f.metadata,{budget:nativeFormatBudget()});
    assert.throws(()=>new AotNativeSignatures(reader).signature(f.handle(name),context),/cycle|arity|shape/);
  }
  const f=signatureFixture(),reader=new NativeMetadata(f.metadata,{budget:nativeFormatBudget()}),signatures=new AotNativeSignatures(reader);
  assert.throws(()=>signatures.genericParameters([f.at('parameter_t'),f.at('parameter_t')],0,{typeArity:2}),/duplicated/);
  assert.throws(()=>signatures.genericParameters([f.at('parameter_u')],0,{typeArity:1}),/owner kind/);
  assert.throws(()=>signatures.method(f.at('echo_signature'),{typeArity:1,methodArity:0}),/contradicts/);
  const limited=new NativeMetadata(f.metadata,{budget:nativeFormatBudget({maxExpandedNameBytes:8})});
  assert.throws(()=>new AotNativeSignatures(limited).signature(f.handle('multidimensional')),error=>error.code==='capacity');
  const abort=new AbortController(),cancelled=new NativeMetadata(f.metadata,{signal:abort.signal,budget:nativeFormatBudget()});abort.abort();
  assert.throws(()=>new AotNativeSignatures(cancelled).signature(f.handle('pointer')),error=>error.name==='AbortError');
});

function memberFixture({pointerSize=8,conflict=false,badOwner=false,badCode=false,badOffset=false,badHash=false,unsupported=false,malformed=false,fixture=null}={}){
  const f=fixture??identityFixture({pointerSize,noFrozen:true}),source=BigInt(f.model.segments[0].start),code=BigInt(f.model.functions[0].address),refsAddress=source+0x700n;
  const refs=Buffer.alloc(20);f.bytes.copy(refs,0,f.reference_file_offset,f.reference_file_offset+12);
  refs.writeInt32LE(Number((badCode?source:code)-(refsAddress+12n)),12);
  refs.writeInt32LE(Number(code+8n-(refsAddress+16n)),16);refs.copy(f.bytes,f.reference_file_offset);
  f.bytes.set([0xb8,0x2a,0,0,0,0xc3],f.model.segments[1].file_offset+16);
  function map(payloads){
    const start=3+payloads.length*6,end=start+payloads.reduce((sum,payload)=>sum+payload.length,0),bytes=Buffer.alloc(end);bytes[0]=0;bytes[1]=2;bytes[2]=start-1;let target=start;
    for(const [index,payload]of payloads.entries()){const at=3+index*6;bytes[at]=badHash?0x12:0x11;bytes[at+1]=15;bytes.writeInt32LE(target-(at+1),at+2);payload.copy(bytes,target);target+=payload.length;}return bytes;
  }
  const invoke=map([packet(unsupported?0x26:0x24,f.handles.method_mix.offset,badOwner?1:0,3),...(conflict?[packet(0x24,f.handles.method_mix.offset,0,4)]:[])]);
  const access=map([packet(0x28,0,f.handles.field_serial.offset,badOffset?1024:pointerSize),...(conflict?[packet(0x28,0,f.handles.field_serial.offset,pointerSize+1)]:[])]);
  if(malformed)invoke[5]=0xff;
  invoke.copy(f.bytes,1024+0x5b0);access.copy(f.bytes,1024+0x620);
  const sections=[];
  for(let index=0;index<6;index++){
    const at=0x410+index*(8+pointerSize),id=f.bytes.readUInt32LE(at),size=id===308?refs.length:f.bytes.readUInt32LE(at+4),address=pointerSize===8?f.bytes.readBigUInt64LE(at+8):BigInt(f.bytes.readUInt32LE(at+8));sections.push([id,address,size]);
  }
  sections.push([306,source+0x5b0n,invoke.length],[309,source+0x620n,access.length]);sections.sort((a,b)=>a[0]-b[0]);
  f.bytes.writeUInt16LE(sections.length,0x40c);let sectionOffset=0x410;
  for(const [id,address,size]of sections){
    f.bytes.writeUInt32LE(id,sectionOffset);f.bytes.writeUInt32LE(size,sectionOffset+4);
    if(pointerSize===8)f.bytes.writeBigUInt64LE(address,sectionOffset+8);else f.bytes.writeUInt32LE(Number(address),sectionOffset+8);
    sectionOffset+=8+pointerSize;
  }
  return {...f,code:'0x'+code.toString(16)};
}

test('NativeAOT owned reflection maps bind a member to selected code and an instance offset, not declared metadata',()=>{
  for(const pointerSize of [4,8]){
    const f=memberFixture({pointerSize}),r=recoverNativeAotDetailed(f.bytes,f.model,digest(f.bytes),f.architecture),i=r.identity_recovery.modules[0];
    const method=i.methods.find(method=>method.qualified_name==='Owned.Widget.Mix'),field=i.fields.find(field=>field.qualified_name==='Owned.Widget.Serial');
    assert.equal(method.target_address,f.code);assert.equal(method.binding_status,'associated');
    assert.equal(method.declaring_method_table_address,f.method_table_address);
    assert.equal(method.entrypoint_kind,'recorded-reflection-entrypoint');
    assert.equal(field.offset_bytes,pointerSize);assert.equal(field.storage_class,'instance');
    assert.equal(field.declared_offset_bytes,null);assert.equal(field.metadata_offset_value,0);
    assert.equal(field.field_size_bytes,null);
    for(const member of [method,field]){
      assert.ok(member.source_bindings.some(proof=>proof.role==='validated-fixed-method-table-layout'));
      assert.ok(member.source_bindings.some(proof=>proof.role.includes('member-owner-')));
      for(const proof of member.source_bindings.filter(proof=>proof.file_offset!==null))assert.equal(digest(f.bytes.subarray(proof.file_offset,proof.file_offset+proof.size_bytes)),proof.sha256);
    }
    const codeProof=method.source_bindings.find(proof=>proof.role==='invoke-map-selected-executable-bytes');
    assert.deepEqual(f.bytes.subarray(codeProof.file_offset,codeProof.file_offset+6),Buffer.from([0xb8,0x2a,0,0,0,0xc3]));
  }
});

test('NativeAOT reflection-map contradictory targets/offsets preserve raw conflicts without promotion',()=>{
  const f=memberFixture({conflict:true}),r=recoverNativeAotDetailed(f.bytes,f.model,digest(f.bytes),f.architecture),i=r.identity_recovery.modules[0];
  assert.equal(i.methods[0].target_address,null);assert.equal(i.fields[0].offset_bytes,null);
  assert.ok(i.conflicts.some(conflict=>conflict.member_handle?.kind==='Method'));
  assert.ok(i.conflicts.some(conflict=>conflict.member_handle?.kind==='Field'));
  assert.equal(i.types.find(type=>type.qualified_name==='Owned.Widget').binding_status,'associated');
});

test('NativeAOT reflection maps reject foreign owners, non-code targets, impossible offsets, unsupported flags and hash contradictions',()=>{
  for(const [options,kind]of [[{badOwner:true},'method'],[{badCode:true},'method'],[{badOffset:true},'field'],[{unsupported:true},'method'],[{badHash:true},'both'],[{malformed:true},'method']]){
    const f=memberFixture(options),r=recoverNativeAotDetailed(f.bytes,f.model,digest(f.bytes),f.architecture),i=r.identity_recovery.modules[0];
    if(kind!=='field')assert.equal(i.methods[0].target_address,null,JSON.stringify(options));
    if(kind!=='method')assert.equal(i.fields[0].offset_bytes,null,JSON.stringify(options));
    assert.ok(i.diagnostics.length>1);
  }
});

test('NativeAOT raw inventory separates declared explicit layout from actual mapped instance offsets',()=>{
  const f=identityFixture({includeMap:false,noFrozen:true}),metadata=signatureFixture().metadata;
  assert.ok(f.metadata_file_offset+metadata.length<=f.model.segments[0].file_offset+f.model.segments[0].file_size);
  metadata.copy(f.bytes,f.metadata_file_offset);
  for(let index=0;index<4;index++){const at=0x410+index*16;if(f.bytes.readUInt32LE(at)===313)f.bytes.writeUInt32LE(metadata.length,at+4);}
  const r=recoverNativeAotDetailed(f.bytes,f.model,digest(f.bytes),f.architecture),i=r.identity_recovery.modules[0];
  const type=i.types.find(type=>type.qualified_name==='Owned.PackedLedger'),field=i.fields.find(field=>field.qualified_name==='Owned.PackedLedger.Serial');
  assert.deepEqual(type.declared_layout,{kind:'explicit',size_hint_bytes:32,packing_hint_bytes:4,basis:'declared-metadata-only'});
  assert.equal(field.declared_offset_bytes,8);assert.equal(field.offset_bytes,null);
  assert.equal(field.field_type.display_name,'System.Int32');assert.equal(field.binding_status,'metadata-only');
  assert.equal(r.modules[0].types.length,0);
});

async function openedCompletion(t,f,{signal=t.signal}={}){
  const base=await fs.realpath(os.tmpdir()),root=await fs.mkdtemp(path.join(base,'reclaimer-aot-packets-')),file=path.join(root,'owned.elf'),ctx=new Context({signal});ctx.handlers=handlers;
  await fs.writeFile(file,f.bytes);await ctx.call('open_binary',{path:file});
  t.after(async()=>{if(ctx.target)await handlers.close_binary({},ctx);const resolved=await fs.realpath(root);assert.equal(path.dirname(resolved),base);assert.ok(path.basename(resolved).startsWith('reclaimer-aot-packets-'));await fs.rm(resolved,{recursive:true,force:true});});
  return {ctx,file};
}

test('Context NativeAOT exposes derived generic definition identity without fabricated instance layout',async t=>{
  const f=genericDefinitionFixture(),{ctx,file}=await openedCompletion(t,f),load=await ctx.call('inspect_native_load_image',{});
  const datatype=await ctx.call('inspect_native_data_type',{address:f.method_table_address});
  assert.equal(datatype.normalized_result.name,'Owned.Widget');
  assert.equal(datatype.normalized_result.metadata_recovery.name_origin,'inferred');
  assert.equal(datatype.normalized_result.metadata_recovery.original_name,null);
  assert.equal(datatype.raw_result.nativeaot_identity.generic_parameter_count,1);
  assert.equal(datatype.raw_result.nativeaot_identity.generic_parameters[0].name,'T');
  assert.equal(load.normalized_result.observations.metadata_recovery[0].coverage.frozen_objects_annotated,0);
  assert.equal((await ctx.call('inspect_native_data_type',{type:f.generated_alias})).normalized_result.id,datatype.normalized_result.id);
  assert.equal(digest(await fs.readFile(file)),digest(f.bytes));
});

test('Context NativeAOT per-type member evidence is detached, byte-backed and absent for conflicting members',async t=>{
  const f=memberFixture(),{ctx}=await openedCompletion(t,f),load=await ctx.call('inspect_native_load_image',{});
  const first=await ctx.call('inspect_native_data_type',{address:f.method_table_address}),members=first.raw_result.nativeaot_members;
  assert.equal(first.normalized_result.name,'Owned.Widget');
  assert.equal(first.normalized_result.metadata_recovery.original_name,null);
  assert.ok(first.normalized_result.fields.some(field=>field.name==='hash_code'));
  assert.ok(!first.normalized_result.fields.some(field=>field.name==='Serial'));
  assert.equal(members.methods.length,1);assert.equal(members.fields.length,1);
  assert.equal(members.methods[0].target_address,f.code);assert.equal(members.fields[0].offset_bytes,8);
  assert.equal(members.methods[0].declaring_method_table_address,f.method_table_address);
  for(const member of [...members.methods,...members.fields])for(const proof of member.source_bindings.filter(proof=>proof.file_offset!==null))assert.equal(digest(f.bytes.subarray(proof.file_offset,proof.file_offset+proof.size_bytes)),proof.sha256);
  members.methods[0].target_address='0x1';members.fields[0].offset_bytes=1024;members.methods[0].source_bindings[0].sha256='0'.repeat(64);
  load.raw_result.nativeaot_identity_recovery.modules[0].methods[0].target_address='0x2';
  const second=await ctx.call('inspect_native_data_type',{type:f.generated_alias});
  assert.equal(second.raw_result.nativeaot_members.methods[0].target_address,f.code);
  assert.equal(second.raw_result.nativeaot_members.fields[0].offset_bytes,8);
  assert.notEqual(second.raw_result.nativeaot_members.methods[0].source_bindings[0].sha256,'0'.repeat(64));
  const conflicting=memberFixture({conflict:true}),opened=await openedCompletion(t,conflicting);
  await opened.ctx.call('inspect_native_load_image',{});
  const rejected=await opened.ctx.call('inspect_native_data_type',{address:conflicting.method_table_address});
  assert.equal(rejected.normalized_result.name,'Owned.Widget');
  assert.deepEqual(rejected.raw_result.nativeaot_members.methods,[]);
  assert.deepEqual(rejected.raw_result.nativeaot_members.fields,[]);
});

test('Context NativeAOT member-rich late cancellation, source changes and evidence rejection remain atomic',async t=>{
  for(const failure of ['cancel','source','evidence']){
    const controller=new AbortController(),f=memberFixture(),{ctx,file}=await openedCompletion(t,f,{signal:controller.signal}),original=ctx.evidence.bind(ctx);
    await ctx.call('inspect_native_load_image',{});const before=ctx.nativeSession.nativeRecovery,names=[...ctx.nativeSession.names],ledger=[...ctx.ledger];
    ctx.evidence=async(...args)=>{if(failure==='evidence')throw new Error('Owned completion evidence rejection');const result=await original(...args);if(failure==='cancel')controller.abort();else{const changed=Buffer.from(f.bytes);changed[f.model.segments[1].file_offset+16]^=1;await fs.writeFile(file,changed);}return result;};
    await assert.rejects(ctx.call('inspect_native_load_image',{}),error=>failure==='cancel'?error.name==='AbortError'||error.code==='cancelled':failure==='source'?/changed since open_binary/.test(error.message):/Owned completion evidence rejection/.test(error.message));
    assert.equal(ctx.nativeSession.nativeRecovery,before);assert.deepEqual([...ctx.nativeSession.names],names);assert.deepEqual([...ctx.ledger],ledger);
  }
  const f=memberFixture(),before=digest(f.bytes);
  assert.throws(()=>recoverNativeAotDetailed(f.bytes,f.model,before,f.architecture,{maxOutputBytes:1024}),error=>error.code==='capacity');
  assert.equal(digest(f.bytes),before);
});

function constructedFixture({unknownArgument=false,optional=false,badDefinition=false,tagged=false,badHash=false}={}){
  const f=memberFixture({fixture:genericDefinitionFixture()}),source=BigInt(f.model.segments[0].start),destination=BigInt(f.method_table_address)-0x180n,address=destination+0x380n,at=f.rebuilt_file_offset+0x380;
  // Selected-byte profile facts, not a claim that this authored image executes.
  f.bytes.writeUInt16LE(0x5a4d,0);f.bytes.writeUInt32LE(0x80,60);f.bytes.writeUInt32LE(0x4550,0x80);f.bytes.writeUInt16LE(0x8664,0x84);f.bytes.writeUInt16LE(0x20b,0x98);
  f.bytes.writeUInt16LE(9,0x404);f.bytes.writeUInt16LE(1,0x406);
  f.bytes.fill(0,at,at+40);f.bytes.writeUInt32LE(optional?0x53000000:0x52000000,at);f.bytes.writeUInt32LE(24,at+4);f.bytes.writeUInt32LE(0x33333333,at+20);
  const definition=BigInt(badDefinition?f.other_method_table_address:f.method_table_address),argument=unknownArgument?destination+0x2c0n:BigInt(f.other_method_table_address);
  f.bytes.writeInt32LE(Number(definition-address-32n),at+32);f.bytes.writeInt32LE(Number(argument-address-36n)+(tagged?1:0),at+36);
  const refsAddress=source+0x700n;f.bytes.writeInt32LE(Number(address-refsAddress-12n),f.reference_file_offset+12);f.bytes.writeInt32LE(Number(BigInt(f.code)-refsAddress-16n),f.reference_file_offset+16);
  nativeUInt(3).copy(f.bytes,1024+0x5b0+19);nativeUInt(4).copy(f.bytes,1024+0x5b0+24);f.bytes[1024+0x5b0+3]=badHash?0x34:0x33;
  nativeUInt(3).copy(f.bytes,1024+0x620+14);f.bytes[1024+0x620+3]=badHash?0x34:0x33;
  return {...f,constructed_address:'0x'+address.toString(16),constructed_name:'Owned.Widget<Owned.Leaf>'};
}

test('NativeAOT one-argument relative constructed identities preserve definition inventory and contextual members',()=>{
  const f=constructedFixture(),r=recoverNativeAotDetailed(f.bytes,f.model,digest(f.bytes),f.architecture),i=r.identity_recovery.modules[0];
  const definition=i.types.find(type=>type.qualified_name==='Owned.Widget'),constructed=i.types.find(type=>type.identity_kind==='constructed-generic');
  assert.equal(definition.method_table_address,f.method_table_address);assert.equal(definition.generic_parameter_count,1);
  assert.equal(constructed.qualified_name,f.constructed_name);assert.equal(constructed.method_table_address,f.constructed_address);
  assert.equal(constructed.generic_definition.method_table_address,f.method_table_address);
  assert.equal(constructed.generic_arguments[0].qualified_name,'Owned.Leaf');
  assert.equal(i.methods.find(method=>method.qualified_name==='Owned.Widget.Mix').target_address,null);
  const contextual=i.methods.find(method=>method.qualified_name===f.constructed_name+'.Mix');
  assert.equal(contextual.identity_kind,'constructed-context');assert.equal(contextual.target_address,f.code);
  assert.equal(contextual.declaring_method_table_address,f.constructed_address);
  assert.equal(i.fields.find(field=>field.qualified_name===f.constructed_name+'.Serial').offset_bytes,8);
  assert.ok(constructed.source_bindings.some(binding=>binding.role==='win-x64-dotnet8-single-argument-relative-tail'));
  assert.equal(r.modules[0].types.find(type=>type.address===f.constructed_address).name,'NativeAOT_MT_'+BigInt(f.constructed_address).toString(16));
});

test('NativeAOT constructed unknown/canonical arguments, optional tails, definition contradictions and tagged/hash pointers remain unpromoted',()=>{
  for(const options of [{unknownArgument:true},{optional:true},{badDefinition:true},{tagged:true},{badHash:true}]){
    const f=constructedFixture(options),r=recoverNativeAotDetailed(f.bytes,f.model,digest(f.bytes),f.architecture),i=r.identity_recovery.modules[0];
    assert.ok(!i.types.some(type=>type.identity_kind==='constructed-generic'),JSON.stringify(options));
    assert.ok(!r.modules[0].types.some(type=>type.identity?.qualified_name===f.constructed_name));
    assert.equal(i.methods.find(method=>method.qualified_name==='Owned.Widget.Mix').target_address,null);
    assert.ok(i.constructed_candidates.length>0);
  }
  const f=constructedFixture(),before=digest(f.bytes);
  assert.throws(()=>recoverNativeAotDetailed(f.bytes,f.model,before,f.architecture,{maxTotalTypes:2}),error=>error.code==='capacity');
  assert.equal(digest(f.bytes),before);
});

test('NativeAOT constructed argument scope-key ambiguity suppresses contextual types and members across modules',()=>{
  const f=constructedFixture(),one=signatureFixture({argumentKey:Buffer.from([1])}),two=signatureFixture({argumentKey:Buffer.from([2])});
  f.model.segments[0]={...f.model.segments[0],file_size:0x1c00,end:'0x401c00'};
  one.metadata.copy(f.bytes,f.metadata_file_offset);two.metadata.copy(f.bytes,1024+0x1200);
  for(let index=0;index<8;index++){const at=0x410+index*16;if(f.bytes.readUInt32LE(at)===313)f.bytes.writeUInt32LE(one.metadata.length,at+4);}
  nativeUInt(0x3a000000+one.at('box_type')).copy(f.bytes,f.type_map_file_offset+26);
  nativeUInt(0x3a000000+one.at('argument_type')).copy(f.bytes,f.type_map_file_offset+36);
  nativeUInt(0x36).copy(f.bytes,1024+0x5b0+9);nativeUInt(one.at('echo_method')).copy(f.bytes,1024+0x5b0+14);
  const base=recoverNativeAotDetailed(f.bytes,f.model,digest(f.bytes),f.architecture,{recoverIdentities:false}),first=base.modules[0];
  base.modules.push({...first,header_address:'0x400080',types:[],instances:[],sections:first.sections.map(section=>section.id===313?{...section,address:0x401200n,size:two.metadata.length}:section)});
  const identities=recoverNativeAotIdentities(f.bytes,f.model,base);
  for(const module of identities.modules){
    const contextual=module.types.find(type=>type.identity_kind==='constructed-generic');assert.ok(contextual);
    assert.equal(contextual.binding_status,'metadata-only');assert.equal(contextual.method_table_address,null);
    assert.ok(!module.methods.some(method=>method.identity_kind==='constructed-context'&&method.target_address));
    assert.ok(module.conflicts.some(conflict=>conflict.reason.includes('Cross-module')));
  }
  const [a,b]=identities.modules.map(module=>module.types.find(type=>type.identity_kind==='constructed-generic').generic_arguments[0]);
  assert.deepEqual(a.assembly,b.assembly);assert.notEqual(a.scope_identity.key_material_sha256,b.scope_identity.key_material_sha256);
});

function amplifiedSignatureFixture(metadata=signatureFixture({assemblyName:'A'.repeat(65536),namespaceName:'N'.repeat(65000),genericParameterRepeat:100,constraintRepeat:256}).metadata){
  const f=identityFixture({includeMap:false,noFrozen:true});
  const bytes=Buffer.alloc(f.metadata_file_offset+metadata.length);f.bytes.copy(bytes);metadata.copy(bytes,f.metadata_file_offset);
  for(let index=0;index<4;index++){const at=0x410+index*16;if(bytes.readUInt32LE(at)===313)bytes.writeUInt32LE(metadata.length,at+4);}
  const fileSize=bytes.length-f.model.segments[0].file_offset,model={...f.model,functions:[],segments:[{...f.model.segments[0],file_size:fileSize,end:'0x'+(BigInt(f.model.segments[0].start)+BigInt(fileSize)).toString(16)}]};
  // One actual ELF program header describes the enlarged selected file slice.
  bytes.writeUInt16LE(1,56);bytes.writeBigUInt64LE(BigInt(fileSize),96);bytes.writeBigUInt64LE(BigInt(fileSize),104);
  return {...f,bytes,model,metadata};
}

test('NativeAOT signature reference expansion rejects at output budget inside a 64 MiB child without JSON allocation',async t=>{
  const {bytes,model}=amplifiedSignatureFixture();
  const base=await fs.realpath(os.tmpdir()),root=await fs.mkdtemp(path.join(base,'reclaimer-aot-capacity-')),file=path.join(root,'owned.bin'),modelFile=path.join(root,'model.json');
  t.after(async()=>{const resolved=await fs.realpath(root);assert.equal(path.dirname(resolved),base);assert.ok(path.basename(resolved).startsWith('reclaimer-aot-capacity-'));await fs.rm(resolved,{recursive:true,force:true});});
  await fs.writeFile(file,bytes);await fs.writeFile(modelFile,JSON.stringify(model));
  const script=`import fs from 'node:fs/promises';import {recoverNativeAotDetailed} from ${JSON.stringify(pathToFileURL(path.resolve('lib/native-aot.mjs')).href)};import {digest} from ${JSON.stringify(pathToFileURL(path.resolve('lib/artifact-binary.mjs')).href)};const bytes=await fs.readFile(process.argv[1]),model=JSON.parse(await fs.readFile(process.argv[2],'utf8')),before=digest(bytes);try{recoverNativeAotDetailed(bytes,model,before,'x86_64');throw new Error('Capacity fixture was accepted');}catch(error){if(error.code!=='capacity')throw error;console.log(JSON.stringify({code:error.code,message:error.message,source_preserved:before===digest(bytes),input_bytes:bytes.length}));}`;
  const ctx=new Context({signal:t.signal}),result=await ctx.run([process.execPath,'--max-old-space-size=64','--input-type=module','--eval',script,file,modelFile],{cwd:root,timeout:15000,maxBytes:128*1024,env:{SystemRoot:process.env.SystemRoot??'',PATH:process.env.PATH??'',TEMP:root,TMP:root,USERPROFILE:root,APPDATA:root,LOCALAPPDATA:root}});
  const receipt=JSON.parse(result.stdout);assert.equal(receipt.code,'capacity');assert.equal(receipt.source_preserved,true);assert.ok(receipt.input_bytes<300000);assert.match(receipt.message,/output_bytes/);
});

test('Context amplified NativeAOT output failure publishes no evidence or annotations and leaves selected bytes usable',async t=>{
  const f=amplifiedSignatureFixture(),{ctx,file}=await openedCompletion(t,f);
  await ctx.call('set_address_name',{address:'0x400000',name:'owned-before-capacity'});
  const names=[...ctx.nativeSession.names],ledger=[...ctx.ledger],previous=ctx.nativeSession.nativeRecovery;
  await assert.rejects(ctx.call('inspect_native_load_image',{}),error=>error.code==='capacity'&&/output_bytes/.test(error.message));
  assert.equal(ctx.nativeSession.nativeRecovery,previous);assert.deepEqual([...ctx.nativeSession.names],names);assert.deepEqual([...ctx.ledger],ledger);
  assert.equal(digest(await fs.readFile(file)),digest(f.bytes));
  const read=await ctx.call('read_bytes',{address:'0x400000',length:4});assert.equal(read.normalized_result.bytes_hex,'52545200');
  const valid=memberFixture(),opened=await openedCompletion(t,valid);await opened.ctx.call('inspect_native_load_image',{});
  const datatype=await opened.ctx.call('inspect_native_data_type',{address:valid.method_table_address});
  assert.equal(datatype.normalized_result.name,'Owned.Widget');assert.equal(datatype.raw_result.nativeaot_members.methods[0].target_address,valid.code);
  const before=digest(valid.bytes);
  assert.throws(()=>recoverNativeAotDetailed(valid.bytes,valid.model,before,valid.architecture,{maxJsonWork:1}),error=>error.code==='capacity'&&/JSON sizing work/.test(error.message));
  assert.throws(()=>recoverNativeAotDetailed(valid.bytes,valid.model,before,valid.architecture,{maxJsonWork:8388609}),/JSON sizing work bound is invalid/);
  assert.equal(digest(valid.bytes),before);
});

test('NativeAOT repeated child provenance is rejected before flattening inside bounded method and constraint children',{timeout:45000},async t=>{
  const base=await fs.realpath(os.tmpdir()),root=await fs.mkdtemp(path.join(base,'reclaimer-aot-provenance-')),outcomes=[],ctx=new Context({signal:t.signal});
  t.after(async()=>{const resolved=await fs.realpath(root);assert.equal(path.dirname(resolved),base);assert.ok(path.basename(resolved).startsWith('reclaimer-aot-provenance-'));await fs.rm(resolved,{recursive:true,force:true});});
  for(const constraints of [false,true]){
    const f=signatureFixture({provenanceWidth:1024,provenanceDepth:20,provenanceRepeat:1024,provenanceConstraints:constraints}),file=path.join(root,constraints?'constraints.bin':'method.bin'),before=digest(f.metadata);await fs.writeFile(file,f.metadata);
    const script=`import fs from 'node:fs/promises';import {NativeMetadata} from ${JSON.stringify(pathToFileURL(path.resolve('lib/native-format-metadata.mjs')).href)};import {nativeFormatBudget} from ${JSON.stringify(pathToFileURL(path.resolve('lib/native-format.mjs')).href)};import {AotNativeSignatures} from ${JSON.stringify(pathToFileURL(path.resolve('lib/native-aot-signatures.mjs')).href)};const bytes=await fs.readFile(process.argv[1]),reader=new NativeMetadata(bytes,{budget:nativeFormatBudget()}),signatures=new AotNativeSignatures(reader);try{${constraints?`signatures.genericParameters([${f.at('parameter_t')}],0,{typeArity:1})`:`signatures.method(${f.at('echo_signature')},{typeArity:1,methodArity:1})`};throw new Error('Repeated provenance packet was accepted');}catch(error){if(error.code!=='capacity')throw error;console.log(JSON.stringify({code:error.code,message:error.message,input_bytes:bytes.length,source_sha256:${JSON.stringify(before)}}));}`;
    try{const result=await ctx.run([process.execPath,'--max-old-space-size=64','--input-type=module','--eval',script,file],{cwd:root,timeout:15000,maxBytes:128*1024,env:{SystemRoot:process.env.SystemRoot??'',PATH:process.env.PATH??'',TEMP:root,TMP:root,USERPROFILE:root,APPDATA:root,LOCALAPPDATA:root}});outcomes.push({profile:constraints?'constraints':'method',...JSON.parse(result.stdout)});}catch(error){outcomes.push({profile:constraints?'constraints':'method',error:{code:error.code,message:error.message,details:error.details}});}
    assert.equal(digest(await fs.readFile(file)),before);assert.ok(f.metadata.length<200000);
  }
  assert.equal(outcomes.filter(outcome=>outcome.error).length,0,JSON.stringify(outcomes));
  for(const outcome of outcomes){assert.equal(outcome.code,'capacity');assert.match(outcome.message,/provenance/);}
});

test('NativeAOT provenance work is shared, lowerable and cancellable with atomic Context rejection',async t=>{
  const f=signatureFixture(),firstReader=new NativeMetadata(f.metadata,{budget:nativeFormatBudget()}),first=new AotNativeSignatures(firstReader),expected=first.method(f.at('echo_signature'),{typeArity:1,methodArity:1}),used=first.provenanceBudget.used;
  assert.ok(used>1&&used<1000000);assert.equal(new Set(expected.records.map(record=>record.kind+':'+record.offset)).size,expected.records.length);
  const shared=aotSignatureProvenanceBudget({maxSignatureProvenanceWork:used*2-1});
  const decode=()=>new AotNativeSignatures(new NativeMetadata(f.metadata,{budget:nativeFormatBudget()}),{provenanceBudget:shared}).method(f.at('echo_signature'),{typeArity:1,methodArity:1});
  assert.equal(decode().value.parameters.length,2);assert.equal(shared.used,used);
  assert.throws(decode,error=>error.code==='capacity'&&/provenance/.test(error.message));
  assert.throws(()=>aotSignatureProvenanceBudget({maxSignatureProvenanceWork:1000001}),/provenance work bound is invalid/);
  const controller=new AbortController(),cancelled=new AotNativeSignatures(new NativeMetadata(f.metadata,{signal:controller.signal,budget:nativeFormatBudget()}));
  const group={*[Symbol.iterator](){yield expected.records[0];controller.abort();yield expected.records[1];}};
  assert.throws(()=>cancelled.provenance([group]),error=>error.name==='AbortError');assert.equal(cancelled.provenanceBudget.used,1);
  const adverse=amplifiedSignatureFixture(signatureFixture({provenanceWidth:1024,provenanceDepth:20,provenanceRepeat:1024}).metadata),{ctx,file}=await openedCompletion(t,adverse);
  await ctx.call('set_address_name',{address:'0x400000',name:'owned-before-provenance'});
  const names=[...ctx.nativeSession.names],ledger=[...ctx.ledger],before=ctx.nativeSession.nativeRecovery;
  await assert.rejects(ctx.call('inspect_native_load_image',{}),error=>error.code==='capacity'&&/provenance/.test(error.message));
  assert.equal(ctx.nativeSession.nativeRecovery,before);assert.deepEqual([...ctx.nativeSession.names],names);assert.deepEqual([...ctx.ledger],ledger);assert.equal(digest(await fs.readFile(file)),digest(adverse.bytes));
  assert.equal((await ctx.call('read_bytes',{address:'0x400000',length:4})).normalized_result.bytes_hex,'52545200');
});

