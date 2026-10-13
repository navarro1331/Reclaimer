import test from 'node:test';
import assert from 'node:assert/strict';
import { digest, hex } from '../lib/artifact-binary.mjs';
import { rehydrateAot, recoverNativeAot, recoverNativeAotDetailed, projectNativeAotRecovery } from '../lib/native-aot.mjs';
import { aotRecoveryFixture } from './native-aot-recovery-fixtures.mjs';

const recover=f=>recoverNativeAotDetailed(f.bytes,f.model,digest(f.bytes),f.architecture);
const replace=(f,edit)=>{edit(f.rebuilt);f.rebuilt.copy(f.bytes,0x500+(f.legacy?4:8)+3);return f;};
for(const pointerSize of [4,8])for(const legacy of [false,true])test(`NativeAOT ${pointerSize*8}-bit ${legacy?'end-pointer':'byte-length'} directory recovers nonempty anchored layouts and frozen records`,()=>{
  const f=aotRecoveryFixture({pointerSize,legacy}),before=digest(f.bytes),detail=recover(f),module=detail.modules[0];
  assert.equal(module.header_address,hex(f.source));assert.equal(module.discovery,'symbol');assert.deepEqual(module.reconstruction.bytes,f.rebuilt);assert.equal(module.instances.length,3);assert.equal(module.types.length,6);
  assert.deepEqual(module.instances.map(i=>i.kind),['string','array','object']);assert.equal(module.instances[0].string_value,f.text);assert.equal(module.instances[0].component_count,Buffer.from(f.text,'utf16le').length/2);
  const array=module.instances[1],data=Number(BigInt(array.data_address)-f.destination);assert.deepEqual(module.reconstruction.bytes.subarray(data,data+array.data_size_bytes),Buffer.from([1,2,3,5,8]));
  assert.deepEqual(module.instances.map(i=>i.address),f.instances);assert.ok(module.instances.every(i=>i.allocation_size_bytes===i.size_bytes+pointerSize&&i.type_id!==i.method_table_type_id&&i.source.file_offset===null));
  const string=module.types.find(t=>t.address===hex(f.mt.string));assert.equal(string.base_size_bytes,pointerSize*2+6);assert.equal(string.virtual_slots[0].target_address,'0x402010');assert.equal(string.virtual_slots[0].procedure_name,'owned_virtual_slot');assert.equal(string.interfaces[0].address,hex(f.mt.interface));assert.equal(string.layout.fields[2].offset_bytes,8);assert.equal(string.original_name,null);assert.equal(string.name_origin,'generated');
  assert.ok(module.structural_candidates.some(c=>c.address===hex(f.mt.unanchored)));assert.ok(!module.types.some(t=>t.address===hex(f.mt.unanchored)));assert.equal(detail.records[0].method_tables,0);assert.deepEqual(detail.records[0].types,[]);
  const projected=projectNativeAotRecovery(detail,{typeAddresses:module.types.map(t=>t.address),instanceAddresses:module.instances.map(i=>i.address)})[0];assert.equal(projected.method_tables,6);assert.equal(projected.coverage.frozen_objects_annotated,3);assert.equal(projected.coverage.frozen_object_candidates,3);assert.equal(projected.status,'partial');assert.equal(digest(f.bytes),before);
});

test('NativeAOT 32-bit absolute and signed relative lookup/inline relocations retain exact provenance',()=>{
  const b=Buffer.alloc(27);b.writeInt32LE(0x1000);b.writeUInt32LE(23,4);b[8]=3;b[9]=2;b[10]=13;b.writeInt32LE(0x1500,11);b[15]=12;b.writeInt32LE(-0x100,16);b[20]=25;b[21]=17;b[22]=17;b.writeInt32LE(0x2000,23);
  const result=rehydrateAot(b,0x1000n,4);assert.equal(result.address,0x2000n);assert.equal(result.bytes.readUInt32LE(0),0x3017);assert.equal(result.bytes.readInt32LE(4),0x1013);assert.equal(result.bytes.readUInt32LE(8),0x250b);assert.equal(result.bytes.readInt32LE(12),-0x10fc);assert.equal(result.bytes.length,23);
  assert.deepEqual(result.provenance.map(p=>p.kind),['lookup-relocation','lookup-relocation','inline-relocation','inline-relocation','zero-fill','zero-fill','zero-fill']);assert.equal(result.provenance[0].source_address,'0x1017');assert.equal(result.provenance[0].target_address,'0x3017');assert.equal(result.provenance.at(-1).source_address,null);
});

test('NativeAOT extended literal lengths and pointer-width overflow are rejected without source writes',()=>{
  const f=aotRecoveryFixture(),before=digest(f.bytes);assert.equal(rehydrateAot(f.stream,f.streamAddress,8).bytes.length,1024);assert.equal(rehydrateAot(f.stream,f.streamAddress,8).provenance[0].source_address,hex(f.streamAddress+11n));
  const bad=Buffer.alloc(9);bad.writeInt32LE(0);bad.writeUInt32LE(9,4);bad[8]=31<<3;assert.throws(()=>rehydrateAot(bad,0x1000n,4),/extended command/);assert.throws(()=>rehydrateAot(Buffer.alloc(8),0xfffffffcn,4),/range/);assert.equal(digest(f.bytes),before);
});

test('NativeAOT malformed/duplicate directory entries and impossible legacy extent stay unrecognized',()=>{
  const duplicate=aotRecoveryFixture();duplicate.bytes.writeUInt32LE(204,0x410+16);assert.deepEqual(recover(duplicate).records,[]);
  const legacy=aotRecoveryFixture({legacy:true});legacy.bytes.writeBigUInt64LE(0x3fffffn,0x410+16);assert.deepEqual(recover(legacy).records,[]);
  const flags=aotRecoveryFixture({legacy:true});flags.bytes.writeUInt32LE(2,0x414);assert.deepEqual(recover(flags).records,[]);
  const unsupported=aotRecoveryFixture();assert.deepEqual(recoverNativeAot(unsupported.bytes,unsupported.model,digest(unsupported.bytes),'riscv'),[]);
});

test('NativeAOT malformed method table and forged large frozen count do not promote structural headers',()=>{
  const bad=replace(aotRecoveryFixture(),b=>b.writeUInt32LE(1,0x104)),report=recover(bad).modules[0];assert.equal(report.instances.length,0);assert.equal(report.types.length,0);assert.ok(report.diagnostics.some(d=>d.includes('no validated instance')));
  const huge=replace(aotRecoveryFixture(),b=>b.writeUInt32LE(0xffffffff,16)),large=recover(huge).modules[0];assert.equal(large.instances.length,0);assert.equal(large.types.length,0);assert.ok(large.diagnostics.some(d=>d.includes('object-size bound')));
});

test('NativeAOT malformed later object retains only actual contiguous prefix, never guessed resynchronization',()=>{
  const f=aotRecoveryFixture(),valid=recover(f).modules[0],array=valid.instances[1];replace(f,b=>b.writeUInt32LE(0xffffffff,Number(BigInt(array.address)-f.destination)+8));const m=recover(f).modules[0];assert.equal(m.instances.length,1);assert.equal(m.instances[0].string_value,f.text);assert.ok(m.limitations.some(l=>l.includes('validated contiguous prefix')));assert.ok(!m.types.some(t=>t.address===hex(f.mt.array)));
});

test('NativeAOT source overlaps, duplicate file maps and unmapped reconstruction keep uncertainty explicit',()=>{
  const overlap=aotRecoveryFixture();overlap.model.segments.push({start:hex(overlap.destination),end:hex(overlap.destination+1024n),file_offset:0,file_size:1024});let m=recover(overlap).modules[0];assert.ok(m.reconstruction.bytes.length);assert.equal(m.instances.length,0);assert.ok(m.limitations.some(l=>l.includes('not wholly inside')));
  const duplicate=aotRecoveryFixture();duplicate.model.segments.push({...duplicate.model.segments[0]});assert.deepEqual(recover(duplicate).records,[]);
  const unmapped=aotRecoveryFixture();unmapped.model.segments.pop();m=recover(unmapped).modules[0];assert.equal(m.instances.length,0);assert.ok(m.reconstruction.bytes.length);
});

test('NativeAOT related-type cycles terminate, interface references remain exact when unavailable',()=>{
  const f=replace(aotRecoveryFixture(),b=>{b.writeBigUInt64LE(fixed(0x403100),0x188);b.writeBigUInt64LE(0x999998n,0x120);});function fixed(n){return BigInt(n);}
  const m=recover(f).modules[0];assert.equal(m.instances.length,3);assert.equal(m.types.length,5);const string=m.types.find(t=>t.address===hex(f.mt.string));assert.equal(string.interfaces[0].address,'0x999998');assert.equal(string.interfaces[0].type,null);assert.ok(string.metadata_recovery.limitations.some(l=>l.includes('not a validated')));
});

test('NativeAOT null and non-executable virtual slots preserve pointers without inventing procedures',()=>{
  const f=replace(aotRecoveryFixture(),b=>b.writeBigUInt64LE(0x777778n,0x118)),m=recover(f).modules[0],string=m.types.find(t=>t.address===hex(f.mt.string)),iface=m.types.find(t=>t.address===hex(f.mt.interface));assert.equal(string.virtual_slots[0].target_address,'0x777778');assert.equal(string.virtual_slots[0].procedure_name,null);assert.ok(string.metadata_recovery.limitations.some(l=>l.includes('not uniquely mapped executable')));assert.equal(iface.virtual_slots[0].target_address,null);
});

test('NativeAOT resource and cancellation bounds reject complete recovery before publication',()=>{
  const f=aotRecoveryFixture();for(const bound of [{maxBytes:512},{maxObjects:2},{maxTypes:1}])assert.throws(()=>recoverNativeAotDetailed(f.bytes,f.model,digest(f.bytes),f.architecture,bound),e=>e.code==='capacity');
  const controller=new AbortController();controller.abort();assert.throws(()=>recoverNativeAotDetailed(f.bytes,f.model,digest(f.bytes),f.architecture,{signal:controller.signal}),e=>e.name==='AbortError');
  let checks=0;const signal={throwIfAborted(){if(++checks===5)throw Object.assign(new Error('Owned cancellation'),{name:'AbortError'});}};assert.throws(()=>recoverNativeAotDetailed(f.bytes,f.model,digest(f.bytes),f.architecture,{signal}),e=>e.name==='AbortError');assert.ok(checks>=5);
  const commands=Buffer.from(f.stream);assert.throws(()=>rehydrateAot(commands,f.streamAddress,8,{maxCommands:0}),/bound/);
});

test('NativeAOT selected-source hash mismatch and invalid commit receipts never fabricate adoption',()=>{
  const f=aotRecoveryFixture(),before=digest(f.bytes);assert.throws(()=>recoverNativeAotDetailed(f.bytes,f.model,'0'.repeat(64),f.architecture),/SHA256/);const d=recover(f),m=d.modules[0];assert.throws(()=>projectNativeAotRecovery(d,{typeAddresses:[hex(f.mt.unanchored)]}),/unvalidated/);assert.throws(()=>projectNativeAotRecovery(d,{instanceAddresses:[m.instances[0].address]}),/committed method table/);
  const none=projectNativeAotRecovery(d)[0];assert.equal(none.method_tables,0);assert.equal(none.coverage.frozen_objects_annotated,0);const selected=projectNativeAotRecovery(d,{typeAddresses:[m.instances[0].method_table_address],instanceAddresses:[m.instances[0].address]})[0];assert.equal(selected.method_tables,1);assert.equal(selected.coverage.frozen_objects_annotated,1);assert.equal(selected.types[0].type,m.types.find(t=>t.address===m.instances[0].method_table_address).name);assert.equal(d.records[0].method_tables,0);assert.equal(digest(f.bytes),before);
});

test('NativeAOT high 64-bit method table, object and slot addresses preserve exact identities',()=>{
  const f=aotRecoveryFixture({sourceBase:0x8000000000400000n}),d=recover(f),m=d.modules[0];assert.equal(m.header_address,'0x8000000000400000');assert.equal(m.types.find(t=>t.address===hex(f.mt.string)).virtual_slots[0].target_address,'0x8000000000402010');assert.equal(m.instances[0].address,'0x8000000000403008');assert.equal(m.instances[0].method_table_address,'0x8000000000403100');assert.equal(m.instances[0].string_value,f.text);assert.equal(m.types.length,6);
});

test('NativeAOT multidimensional array base extent locates component bytes without inventing rank bounds',()=>{
  const f=aotRecoveryFixture();replace(f,b=>{
    // Replace all frozen instances with one array whose larger base reserves
    // opaque rank/bounds storage between its count and component data.
    b.fill(0,0,96);b.writeBigUInt64LE(f.mt.array,8);b.writeUInt32LE(2,16);b.writeInt32LE(1,24);b.writeInt32LE(0,28);b.writeInt32LE(2,32);b.writeInt32LE(0,36);b.writeInt32LE(144,40);b.writeInt32LE(233,44);b.writeUInt32LE(0xdc020004,0x200);b.writeUInt32LE(40,0x204);b.writeBigUInt64LE(f.mt.boxed,0x208);
  });f.bytes.writeUInt32LE(48,0x410+16+4);const m=recover(f).modules[0],array=m.instances[0];assert.equal(m.instances.length,1);assert.equal(array.kind,'array');assert.equal(array.component_count,2);assert.equal(array.data_address,'0x403028');assert.equal(array.data_size_bytes,8);assert.equal(m.reconstruction.bytes.readInt32LE(40),144);assert.equal(m.reconstruction.bytes.readInt32LE(44),233);assert.ok(array.limitations.some(l=>l.includes('rank-specific bounds')));
});

test('NativeAOT unsupported generic-definition and dynamic instance tables remain candidates only',()=>{
  for(const flags of [0x50030000,0x50080000,0x60000000,0x64000000]){const f=replace(aotRecoveryFixture(),b=>b.writeUInt32LE(flags,0x100)),m=recover(f).modules[0];assert.equal(m.instances.length,0);assert.equal(m.types.length,0);assert.ok(m.diagnostics.some(d=>d.includes('no validated instance')));}
});

test('NativeAOT nonzero object header and null interface preserve contradictory recorded facts',()=>{
  const f=replace(aotRecoveryFixture(),b=>{b.writeUInt32LE(0x20000000,4);b.writeBigUInt64LE(0n,0x120);}),m=recover(f).modules[0];assert.equal(m.instances.length,3);assert.ok(m.instances[0].limitations.some(l=>l.includes('Nonzero recorded')));const string=m.types.find(t=>t.address===hex(f.mt.string));assert.equal(string.interfaces[0].address,'0x0');assert.ok(string.metadata_recovery.limitations.some(l=>l.includes('Interface pointer 0 is zero')));
});

test('NativeAOT bad UTF-16 terminator stops at the owned region boundary',()=>{
  const f=aotRecoveryFixture();replace(f,b=>b.writeUInt16LE(1,20+Buffer.from(f.text,'utf16le').length));const m=recover(f).modules[0];assert.equal(m.instances.length,0);assert.equal(m.types.length,0);assert.ok(m.diagnostics.some(d=>d.includes('UTF-16 terminator')));
});

test('NativeAOT direct source-backed frozen records do not fabricate derived-memory datatype metadata',()=>{
  const f=aotRecoveryFixture();f.bytes.writeUInt16LE(2,0x40c);f.rebuilt.copy(f.bytes,7168);f.model.segments[2]={...f.model.segments[2],file_offset:7168,file_size:1024};const detail=recover(f),m=detail.modules[0];assert.equal(m.reconstruction,null);assert.equal(detail.records[0].derived_memory,null);assert.equal(m.types.length,6);assert.equal(m.instances.length,3);assert.equal(m.instances[0].string_value,f.text);assert.ok(m.types.every(t=>!Object.hasOwn(t,'metadata_recovery')&&t.source.source==='source-file'));assert.ok(m.instances.every(i=>i.source.source==='source-file'&&i.source.file_offset!==null));assert.ok(m.limitations.some(l=>l.includes('directly source-file-backed')));
});

test('NativeAOT aggregate bytes, commands, types, objects and layout fields bound multiple modules',()=>{
  const f=aotRecoveryFixture();f.bytes.copy(f.bytes,0xe00,0x400,0x440);const digestBefore=digest(f.bytes),normal=recover(f);assert.equal(normal.modules.length,2);assert.equal(normal.modules.reduce((n,m)=>n+m.types.length,0),12);assert.equal(normal.modules.reduce((n,m)=>n+m.instances.length,0),6);
  for(const bound of [{maxTotalBytes:1500},{maxTotalCommands:1},{maxTotalTypes:10},{maxTotalObjects:5},{maxTotalFields:70}])assert.throws(()=>recoverNativeAotDetailed(f.bytes,f.model,digestBefore,f.architecture,bound),e=>e.code==='capacity'&&e.message.includes('aggregate'));
  assert.equal(digest(f.bytes),digestBefore);assert.equal(recover(f).records.every(r=>r.method_tables===0),true);
});

test('NativeAOT malformed-module reconstruction work also counts against the aggregate budget',()=>{
  const f=aotRecoveryFixture();f.bytes.copy(f.bytes,0xe00,0x400,0x440);f.bytes.writeBigUInt64LE(f.source+0xc00n,0xe00+16+2*16+8);const bad=Buffer.alloc(12);bad.writeInt32LE(0);bad.writeUInt32LE(12,4);bad[8]=9;bad[9]=9;bad[10]=9;bad[11]=6;bad.copy(f.bytes,0x1000);f.bytes.writeUInt32LE(12,0xe00+16+2*16+4);
  assert.throws(()=>recoverNativeAotDetailed(f.bytes,f.model,digest(f.bytes),f.architecture,{maxTotalCommands:3}),e=>e.code==='capacity'&&e.message.includes('aggregate commands'));
});
