import test from 'node:test';
import assert from 'node:assert/strict';
import { digest } from '../lib/artifact-binary.mjs';
import { recoverNativeAotDetailed, projectNativeAotRecovery } from '../lib/native-aot.mjs';
import { recoverNativeAotIdentities, attachNativeAotIdentities } from '../lib/native-aot-identity.mjs';
import { NativeCursor, nativeHashtable, nativeFormatBudget, NATIVE_HANDLE } from '../lib/native-format.mjs';
import { NativeMetadata } from '../lib/native-format-metadata.mjs';
import { identityFixture, nativeUInt } from './native-aot-identity-fixtures.mjs';

const recover=(f,options={})=>recoverNativeAotDetailed(f.bytes,f.model,digest(f.bytes),f.architecture,options);
const pureBase=f=>recover(f,{recoverIdentities:false});
const identities=d=>d.identity_recovery.modules[0];
const snapshot=value=>JSON.stringify(value,(_key,part)=>typeof part==='bigint'?part.toString():part);
const encoded=(value,size)=>{if(size===5)return nativeUInt(value>>>0);const b=Buffer.alloc(size),bits=size*7,v=value<0?value+2**bits:value;b.writeUIntLE(v*2**size+2**(size-1)-1,0,size);return b;};

for(const size of [1,2,3,4,5])test(`NativeFormat independently authored ${size}-byte unsigned and signed packets`,()=>{
  const unsigned=size===5?0xfedcba98:2**(size*7)-1,signed=size===5?-123456789:-Math.floor(2**(size*7-1));
  const u=new NativeCursor(encoded(unsigned,size)),s=new NativeCursor(encoded(signed,size));assert.equal(u.u(),unsigned);assert.equal(u.offset,size);assert.equal(s.s(),signed);assert.equal(s.offset,size);
  if(size>1){const truncated=new NativeCursor(encoded(unsigned,size).subarray(0,size-1));assert.throws(()=>truncated.u(),/bounded blob/);assert.equal(truncated.offset,0);}
});

for(const width of [1,2,4])test(`NativeFormat hashtable fixed ${width}-byte bucket offsets preserve signed entry deltas`,()=>{
  const first=1+3*width+10,end=first+12,b=Buffer.alloc(end+10);b[0]=4+Math.log2(width);for(const [index,value]of [first-1,first+6-1,end-1].entries())b.writeUIntLE(value,1+index*width,width);
  for(const [bucket,target]of [[0,end],[1,1+3*width]]){const at=first+bucket*6;b[at]=31+bucket;b[at+1]=15;b.writeInt32LE(target-(at+1),at+2);}const table=nativeHashtable(b);assert.equal(table.bucket_count,2);assert.deepEqual(table.entries.map(e=>e.target),[end,1+3*width]);assert.deepEqual(table.entries.map(e=>e.bucket),[0,1]);
  const bad=Buffer.from(b);bad.writeUIntLE(b.length+1,1+2*width,width);assert.throws(()=>nativeHashtable(bad),/extents/);
});

test('NativeFormat malformed hash ordering, excessive dimensions, count and invalid UTF-8 reject bounded reads',()=>{
  assert.throws(()=>nativeHashtable(Buffer.from([255])),/dimensions/);const f=identityFixture(),bad=Buffer.from(f.bytes.subarray(f.type_map_file_offset,f.type_map_file_offset+61));bad[3]=255;assert.throws(()=>nativeHashtable(bad),/entry/);
  assert.throws(()=>new NativeCursor(Buffer.concat([nativeUInt(0xffffffff),Buffer.alloc(2)])).list(),/collection count/);
  assert.throws(()=>new NativeCursor(Buffer.concat([nativeUInt(2),Buffer.from([0xc0,0xaf])])).string(),/encoded data/);
  assert.throws(()=>new NativeCursor(Buffer.concat([nativeUInt(65537),Buffer.alloc(65537)])).string(),e=>e.code==='capacity');
});

for(const pointerSize of [4,8])for(const legacy of [false,true])test(`NativeAOT identities ${pointerSize*8}-bit ${legacy?'legacy':'current'} join nonempty names to actual fixed tables`,()=>{
  const f=identityFixture({pointerSize,legacy}),before=digest(f.bytes),d=recover(f),m=d.modules[0],i=identities(d),type=m.types.find(t=>t.address===f.method_table_address);assert.equal(type.identity.qualified_name,f.qualified_name);assert.equal(type.identity.assembly.name,f.assembly_name);assert.equal(type.name,f.generated_alias);assert.equal(type.name_origin,'generated');assert.equal(type.original_name,null);assert.equal(m.instances.length,2);
  assert.deepEqual(i.types.map(t=>t.binding_status),['associated','associated','metadata-only']);assert.deepEqual(i.methods.map(t=>t.qualified_name),['Owned.Widget.Mix']);assert.deepEqual(i.fields.map(t=>t.qualified_name),['Owned.Widget.Serial']);assert.equal(i.methods[0].target_address,null);assert.equal(i.fields[0].offset_bytes,null);
  for(const proof of type.identity.source_bindings){assert.ok(proof.size_bytes>0);if(proof.file_offset!==null)assert.equal(digest(f.bytes.subarray(proof.file_offset,proof.file_offset+proof.size_bytes)),proof.sha256);else assert.equal(proof.derived_memory_sha256,m.reconstruction.sha256);}
  assert.ok(type.identity.source_bindings.some(b=>b.role==='validated-fixed-method-table-layout'));assert.equal(d.records[0].method_tables,0);assert.equal(digest(f.bytes),before);
  const projected=projectNativeAotRecovery(d,{typeAddresses:m.types.map(t=>t.address),instanceAddresses:m.instances.map(t=>t.address)})[0];assert.match(projected.reason,/2 committed method tables have byte-associated/);assert.ok(!projected.limitations.some(l=>l.startsWith('Original type and method names')));assert.ok(projected.limitations.some(l=>l.includes('runtime facts remain unknown')));
});

test('NativeAOT TypeMap anchors valid tables without fabricating frozen instances or commitment',()=>{
  const f=identityFixture({noFrozen:true}),base=pureBase(f);assert.equal(base.modules[0].types.length,0);assert.equal(base.modules[0].instances.length,0);const before=snapshot(base),i=recoverNativeAotIdentities(f.bytes,f.model,base);assert.equal(i.modules[0].extra_types.length,2);assert.equal(snapshot(base),before);attachNativeAotIdentities(base,i);assert.equal(base.modules[0].types.length,2);assert.equal(base.modules[0].instances.length,0);assert.ok(base.modules[0].types.every(t=>t.anchors.some(a=>a.kind==='nativeformat-type-map')));assert.equal(base.records[0].method_tables,0);
});

test('NativeAOT high addresses and UTF-8 names preserve exact byte associations',()=>{
  const f=identityFixture({sourceBase:0x8000000000400000n,widgetName:'Widget_α🚀'}),d=recover(f);assert.equal(d.modules[0].types[0].identity.qualified_name,'Owned.Widget_α🚀');assert.equal(d.modules[0].types[0].address,'0x8000000000403180');assert.equal(d.modules[0].types[0].identity.method_table_address,'0x8000000000403180');
});

test('NativeAOT metadata-only and unbacked TypeMap witnesses never rename unrelated tables',()=>{
  const absent=recover(identityFixture({includeMap:false}));assert.ok(identities(absent).types.every(t=>t.binding_status==='metadata-only'));assert.ok(absent.modules[0].types.every(t=>!t.identity));
  const present=recover(identityFixture());const witness=identities(present).types.find(t=>t.qualified_name==='Owned.UnmappedWitness');assert.equal(witness.method_table_address,null);assert.equal(witness.binding_status,'metadata-only');assert.ok(!present.modules[0].types.some(t=>t.identity?.qualified_name===witness.qualified_name));
});

test('NativeAOT same-address distinct metadata identities preserve conflict proof and suppress both names',()=>{
  const f=identityFixture({conflict:true}),d=recover(f),i=identities(d);assert.equal(i.conflicts.length,1);assert.equal(i.conflicts[0].method_table_address,f.method_table_address);assert.deepEqual(i.conflicts[0].identities.map(t=>t.qualified_name),['Owned.Widget','Owned.Leaf']);assert.ok(d.modules[0].types.every(t=>!t.identity));assert.ok(i.types.every(t=>t.binding_status==='metadata-only'));
});

test('NativeAOT one metadata token mapped to multiple validated addresses is not assigned arbitrarily',()=>{
  const f=identityFixture();nativeUInt(0x3a000000+f.handles.type_widget.offset).copy(f.bytes,f.type_map_file_offset+36);const d=recover(f),i=identities(d);assert.ok(i.conflicts.some(c=>c.reason.startsWith('One metadata type token')));assert.ok(i.types.every(t=>t.binding_status==='metadata-only'));assert.ok(d.modules[0].types.every(t=>!t.identity));
});

for(const alternative of [{assemblyVersion:[2,0,0,0]},{assemblyKey:Buffer.from([1,2,3])}])test(`NativeAOT cross-module ${alternative.assemblyKey?'scope key':'assembly version'} ambiguity suppresses address annotations`,()=>{
  const f=identityFixture(),other=identityFixture(alternative),base=pureBase(f);other.metadata.copy(f.bytes,1024+0xc00);other.bytes.subarray(other.type_map_file_offset,other.type_map_file_offset+61).copy(f.bytes,1024+0x740);base.source_sha256=digest(f.bytes);const original=base.modules[0],second={...original,header_address:'0x400080',types:original.types.map(t=>({...t})),sections:original.sections.map(s=>s.id===313?{...s,address:0x400c00n,size:other.metadata.length}:s.id===301?{...s,address:0x400740n}:s)};base.modules.push(second);
  const i=recoverNativeAotIdentities(f.bytes,f.model,base);assert.ok(i.modules.every(m=>m.conflicts.some(c=>c.reason.startsWith('Cross-module'))));assert.ok(i.modules.every(m=>m.types.every(t=>t.binding_status==='metadata-only')));assert.ok(i.modules.every(m=>m.extra_types.length===0));if(alternative.assemblyKey){assert.deepEqual(i.modules[0].types[0].assembly,i.modules[1].types[0].assembly);assert.notEqual(i.modules[0].types[0].scope_identity.key_material_sha256,i.modules[1].types[0].scope_identity.key_material_sha256);}attachNativeAotIdentities(base,i);assert.ok(base.modules.every(m=>m.types.every(t=>!t.identity)));
});

test('NativeFormat composite qualified names are bounded in UTF-8 bytes before association',()=>{
  const f=identityFixture({widgetName:'α'.repeat(32766)});assert.throws(()=>new NativeMetadata(f.metadata).type(f.handles.type_widget.offset),e=>e.code==='capacity'&&e.message.includes('qualified type'));
});

test('NativeFormat repeated long namespace expansion fails while building inventory, before DTO retention',()=>{
  // Only the complete authored NativeFormat buffer is used here; the default
  // small ELF wrapper is deliberately outside this direct-reader capacity proof.
  const f=identityFixture({namespaceName:'P'.repeat(32768),extraTypeNames:Array.from({length:200},(_,i)=>'Small'+i)}),budget=nativeFormatBudget(),reader=new NativeMetadata(f.metadata,{budget});assert.ok(f.metadata.length<65536);assert.throws(()=>reader.inventory(),e=>e.code==='capacity'&&e.message.includes('expanded_name_bytes'));assert.ok(reader.typeCache.size<200);assert.equal(budget.used.output_bytes,0);assert.ok(budget.used.strings<65536);assert.ok(budget.used.expanded_name_bytes<=budget.limits.expanded_name_bytes);
});

test('NativeFormat nested types inherit empty namespace only within the same byte-backed scope',()=>{
  const f=identityFixture({nestedLeaf:true}),d=recover(f),leaf=d.modules[0].types.find(t=>t.address===f.other_method_table_address);assert.equal(leaf.identity.qualified_name,'Owned.Widget+Leaf');assert.equal(leaf.identity.namespace,'Owned');assert.equal(leaf.identity.assembly.name,f.assembly_name);
});

test('NativeFormat forged nested ownership across same display assembly but different scope key rejects promotion',()=>{
  const f=identityFixture({nestedLeaf:true,leafScopeKey:Buffer.from([9,8,7])}),reader=new NativeMetadata(f.metadata);assert.throws(()=>reader.type(f.handles.type_leaf.offset),/conflicting namespace\/scope ownership/);const d=recover(f);assert.ok(d.modules[0].types.every(t=>!t.identity));assert.ok(identities(d).diagnostics.some(d=>d.includes('conflicting namespace/scope')));
});

test('NativeFormat contradictory top-level membership and parent kind cannot promote names',()=>{
  const f=identityFixture();nativeUInt(f.handles.root.offset).copy(f.bytes,f.metadata_file_offset+f.handles.type_widget.offset+2*5);const d=recover(f);assert.ok(d.modules[0].types.every(t=>!t.identity));assert.ok(identities(d).diagnostics.some(d=>d.includes('top-level type has conflicting namespace')));
  const kind=identityFixture();nativeUInt(kind.handles.scope.offset*256+NATIVE_HANDLE.ScopeReference).copy(kind.bytes,kind.metadata_file_offset+kind.handles.root.offset);const rejected=recover(kind);assert.ok(rejected.modules[0].types.every(t=>!t.identity));assert.ok(identities(rejected).diagnostics.some(d=>d.includes('parent ownership')||d.includes('parent kind')));
});

test('NativeFormat contradictory nested-child and namespace-child membership cannot promote names',()=>{
  const f=identityFixture({nestedLeaf:true});nativeUInt(0).copy(f.bytes,f.metadata_file_offset+f.handles.type_leaf.offset+6*5);const d=recover(f);assert.ok(d.modules[0].types.every(t=>!t.identity));assert.ok(identities(d).diagnostics.some(d=>d.includes('nested type has conflicting enclosing')));
  const child=identityFixture();nativeUInt(child.handles.scope.offset*256+NATIVE_HANDLE.Scope).copy(child.bytes,child.metadata_file_offset+child.handles.namespace.offset);const rejected=recover(child);assert.ok(rejected.modules[0].types.every(t=>!t.identity));assert.ok(identities(rejected).diagnostics.some(d=>d.includes('listed namespace has conflicting parent')));
});

test('NativeAOT TypeMap token and CommonFixups mutations reject affected associations',()=>{
  for(const mutate of [f=>f.bytes.writeUInt32LE(0x28000000+f.handles.type_widget.offset,f.type_map_file_offset+27),f=>f.bytes.writeInt32LE(0x10000,f.reference_file_offset),f=>f.bytes.writeUInt32LE(0x33333333,f.rebuilt_file_offset+0x180+12+f.pointer_size)]){const f=identityFixture();mutate(f);const d=recover(f);assert.ok(!d.modules[0].types.find(t=>t.address===f.method_table_address)?.identity);assert.equal(identities(d).types.find(t=>t.qualified_name===f.qualified_name).binding_status,'metadata-only');}
});

test('NativeAOT malformed TypeMap-anchored fixed layouts and unsupported generic records are not adopted',()=>{
  for(const flags of [0,0x50080000,0x50030000]){const f=identityFixture({noFrozen:true});f.bytes.writeUInt32LE(flags,f.rebuilt_file_offset+0x180);const d=recover(f);assert.ok(!d.modules[0].types.some(t=>t.address===f.method_table_address));assert.equal(identities(d).types.find(t=>t.qualified_name===f.qualified_name).binding_status,'metadata-only');}
});

test('NativeAOT non-generic TypeDefinition never labels parameterized array, byref or pointer method tables',()=>{
  for(const flags of [0xe0020001,0xdc020004,0x64020000,0x68020000]){const f=identityFixture();f.bytes.writeUInt32LE(flags,f.rebuilt_file_offset+0x200);f.bytes.writeUInt32LE(flags===0xdc020004?40:flags===0xe0020001?24:0,f.rebuilt_file_offset+0x204);f.bytes.writeUInt32LE(0x11111111,f.rebuilt_file_offset+0x200+12+f.pointer_size);f.bytes.writeInt32LE(Number(0x403200n-(0x400700n)),f.reference_file_offset);const d=recover(f);assert.ok(!d.modules[0].types.some(t=>t.identity?.qualified_name===f.qualified_name));assert.equal(identities(d).types.find(t=>t.qualified_name===f.qualified_name).binding_status,'metadata-only');assert.ok(identities(d).diagnostics.some(d=>d.includes('parameterized array/byref/pointer')));}
});

test('NativeFormat malformed signature and enclosing/namespace cycles cannot promote identities',()=>{
  const f=identityFixture(),bad=Buffer.from(f.metadata);bad[0]=0;assert.throws(()=>new NativeMetadata(bad),/signature/);
  const cycle=Buffer.from(f.metadata);nativeUInt(f.handles.type_widget.offset).copy(cycle,f.handles.type_widget.offset+6*5);const reader=new NativeMetadata(cycle);assert.throws(()=>reader.type(f.handles.type_widget.offset),/cycle/);
  const ns=Buffer.from(f.metadata);nativeUInt(f.handles.namespace.offset*256+NATIVE_HANDLE.Namespace).copy(ns,f.handles.namespace.offset);assert.throws(()=>new NativeMetadata(ns).namespace({kind:NATIVE_HANDLE.Namespace,offset:f.handles.namespace.offset}),/cycle/);
});

test('NativeFormat recorded ushort version and packing overflow reject semantic identities',()=>{
  for(const [record,field]of [['scope',3],['type_widget',5]]){const f=identityFixture();nativeUInt(65536).copy(f.bytes,f.metadata_file_offset+f.handles[record].offset+field*5);const d=recover(f);assert.ok(d.modules[0].types.every(t=>!t.identity));assert.ok(identities(d).diagnostics.some(d=>d.includes('ushort field')));}
});

test('NativeAOT malformed association payload retains raw inventory but no semantic annotations',()=>{
  const f=identityFixture();f.bytes[f.type_map_file_offset+13]=255;f.bytes.writeInt32LE(0x7fffffff,f.type_map_file_offset+15);const d=recover(f),i=identities(d);assert.equal(i.types.length,3);assert.ok(i.types.every(t=>t.binding_status==='metadata-only'));assert.ok(d.modules[0].types.every(t=>!t.identity));assert.ok(i.limitations.some(l=>l.includes('incomplete')));
});

test('NativeAOT identity request capacities cover raw members, diagnostics, captures and output before attachment',()=>{
  const f=identityFixture({conflict:true}),base=pureBase(f),before=snapshot(base);
  for(const bound of [{maxMetadataBytes:20},{maxNodes:2},{maxCollectionItems:2},{maxStringBytes:3},{maxExpandedNameBytes:10},{maxBindings:2},{maxHashEntries:2},{maxCaptureBytes:20},{maxOutputBytes:2000}])assert.throws(()=>recoverNativeAotIdentities(f.bytes,f.model,base,bound),e=>e.code==='capacity');assert.equal(snapshot(base),before);
  const metadataOnly=identityFixture({includeMap:false}),plain=pureBase(metadataOnly);assert.throws(()=>recoverNativeAotIdentities(metadataOnly.bytes,metadataOnly.model,plain,{maxOutputBytes:1000}),e=>e.code==='capacity');
  const extra=identityFixture({noFrozen:true}),empty=pureBase(extra);assert.throws(()=>recoverNativeAotIdentities(extra.bytes,extra.model,empty,{maxTotalTypes:1}),e=>e.code==='capacity');assert.throws(()=>recoverNativeAotIdentities(extra.bytes,extra.model,empty,{maxTypes:1}),e=>e.code==='capacity');assert.throws(()=>recoverNativeAotIdentities(extra.bytes,extra.model,empty,{maxTotalFields:10}),e=>e.code==='capacity');assert.equal(empty.modules[0].types.length,0);
});

test('NativeAOT identity cancelled reads and late attachment failure are atomic',()=>{
  const f=identityFixture({noFrozen:true}),base=pureBase(f),before=snapshot(base),controller=new AbortController();controller.abort();assert.throws(()=>recoverNativeAotIdentities(f.bytes,f.model,base,{signal:controller.signal}),e=>e.name==='AbortError');
  let checks=0;assert.throws(()=>recoverNativeAotIdentities(f.bytes,f.model,base,{signal:{throwIfAborted(){if(++checks===80)throw Object.assign(new Error('Owned late cancel'),{name:'AbortError'});}}}),e=>e.name==='AbortError');assert.equal(snapshot(base),before);
  const i=recoverNativeAotIdentities(f.bytes,f.model,base);assert.throws(()=>attachNativeAotIdentities(base,i,{signal:controller.signal}),e=>e.name==='AbortError');const malformed={...i,modules:i.modules.map(m=>({...m,extra_types:[]}))};assert.throws(()=>attachNativeAotIdentities(base,malformed),/validated method table/);assert.equal(snapshot(base),before);
});

test('NativeAOT identity selected-source and derived-memory mismatches do not attach',()=>{
  const f=identityFixture(),base=pureBase(f),before=snapshot(base),changed=Buffer.from(f.bytes);changed[7000]^=1;assert.throws(()=>recoverNativeAotIdentities(changed,f.model,base),/selected-source SHA256/);
  const i=recoverNativeAotIdentities(f.bytes,f.model,base);assert.throws(()=>attachNativeAotIdentities(base,{...i,source_sha256:'0'.repeat(64)}),/source SHA256/);assert.equal(snapshot(base),before);
  base.modules[0].reconstruction.bytes[500]^=1;const result=recoverNativeAotIdentities(f.bytes,f.model,base);assert.ok(result.modules[0].diagnostics.some(d=>d.includes('reconstructed-memory SHA256')));assert.ok(result.modules[0].types.every(t=>t.binding_status==='metadata-only'));
});

test('NativeAOT identity budgets aggregate repeated modules and reject duplicate headers',()=>{
  const f=identityFixture(),base=pureBase(f),m=base.modules[0],multi={...base,modules:[m,{...m,header_address:'0x400080'}]},single=recoverNativeAotIdentities(f.bytes,f.model,base);assert.throws(()=>recoverNativeAotIdentities(f.bytes,f.model,multi,{maxMetadataBytes:single.resource_usage.metadata_bytes+1}),e=>e.code==='capacity');assert.throws(()=>recoverNativeAotIdentities(f.bytes,f.model,multi,{maxCaptureBytes:single.resource_usage.capture_bytes+1}),e=>e.code==='capacity');assert.throws(()=>recoverNativeAotIdentities(f.bytes,f.model,multi,{maxExpandedNameBytes:single.resource_usage.expanded_name_bytes+1}),e=>e.code==='capacity');assert.throws(()=>recoverNativeAotIdentities(f.bytes,f.model,multi,{maxOutputBytes:single.resource_usage.output_bytes+1}),e=>e.code==='capacity');assert.throws(()=>recoverNativeAotIdentities(f.bytes,f.model,{...base,modules:[m,m]}),/not unique/);assert.throws(()=>recoverNativeAotIdentities(f.bytes,f.model,{...base,modules:Array.from({length:65},(_,i)=>({...m,header_address:'0x'+i.toString(16)}))}),e=>e.code==='capacity');
});
