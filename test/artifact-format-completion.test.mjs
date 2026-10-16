import test from 'node:test';
import assert from 'node:assert/strict';
import * as android from '../lib/artifact-android.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Context} from '../lib/core.mjs';
import {engine} from '../lib/engine.mjs';
import {cpioEntries,packagePayloadEntries} from '../lib/artifact-installer.mjs';
import {gzipSync} from 'node:zlib';
import {hfsEntries} from '../lib/artifact-diskimage.mjs';
import {decodeJvmCode} from '../lib/artifact-jvm-code.mjs';
import {decodeModifiedUtf8} from '../lib/artifact-mutf8.mjs';
import {zipFixture} from './artifact-fixtures.mjs';
import {dex041ContainerFixture,jvmClassFixture,binaryCpioFixture,hfsOverflowFixture} from './artifact-format-completion-fixtures.mjs';

async function owned(t){const base=path.dirname(fileURLToPath(import.meta.url)),root=await fs.mkdtemp(path.join(base,'artifact-format-owned-'));t.after(async()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(base));assert.ok(path.basename(root).startsWith('artifact-format-owned-'));await fs.rm(root,{recursive:true,force:true});});const ctx=new Context({config:{}});ctx.handlers=android.androidHandlers;return {root,ctx};}

test('DEX041 container retains two logical headers and shared later physical string data',()=>{
 const {bytes}=dex041ContainerFixture(),before=Buffer.from(bytes);
 assert.equal(android.parseDex(bytes).classes[0].name,'Owned.First');
 assert.equal(typeof android.parseDexContainer,'function');
 const files=android.parseDexContainer(bytes);
 assert.equal(files.length,2);assert.deepEqual(files.map(file=>file.classes[0].name),['Owned.First','Owned.Second']);
 assert.deepEqual(files.map(file=>file.header_offset),[0,512]);assert.ok(files.every(file=>file.version==='041'&&file.container_size===1024));
 assert.equal(files[0].strings[3],files[1].strings[3]);assert.deepEqual(bytes,before);
});

test('DEX041 refuses inconsistent container headers earlier data invalid extents and cancellation',()=>{
 assert.equal(typeof android.parseDexContainer,'function');
 for(const mutate of [b=>b.writeUInt32LE(112,36),b=>b.writeUInt32LE(900,112),b=>b.writeUInt32LE(1,512+116),b=>b.writeUInt32LE(0,32),b=>b.writeUInt32LE(2048,512+60),b=>b.writeUInt32LE(200,512+120)]){
  const {bytes}=dex041ContainerFixture();mutate(bytes);assert.throws(()=>android.parseDexContainer(bytes));
 }
 const controller=new AbortController();controller.abort(new Error('Owned format cancellation'));assert.throws(()=>android.parseDexContainer(dex041ContainerFixture().bytes,{signal:controller.signal}),/Owned format cancellation/);
});

test('JVM class inventory preserves descriptors constants Code references and exact byte locations',async()=>{
 const {parseJvmClass}=await import('../lib/artifact-jvm.mjs'),f=jvmClassFixture(),before=Buffer.from(f.bytes),parsed=parseJvmClass(f.bytes);
 assert.equal(parsed.name,'owned.Specimen');assert.equal(parsed.super_class,'java.lang.Object');assert.equal(parsed.version.major,61);
 assert.deepEqual(parsed.methods.map(method=>method.name),['<init>','run','get']);assert.equal(parsed.methods[1].descriptor,'(I)I');assert.deepEqual(parsed.methods[1].code.instructions.map(row=>row.opcode),['iload_0','iconst_1','iadd','ireturn']);
 assert.equal(parsed.methods[0].code.references[0].target.class_name,'java.lang.Object');assert.equal(parsed.methods[2].code.references[0].target.name,'value');
 assert.equal(parsed.fields[1].constant_value.value,'owned\0text');assert.equal(parsed.fields[2].constant_value.value,'9007199254740993');assert.equal(parsed.source_file,'OwnedSpecimen.java');
 assert.equal(parsed.methods[1].code.line_numbers[0].line,7);assert.ok(parsed.methods[1].code.file_offset>0);assert.deepEqual(f.bytes,before);
});

test('JVM tableswitch targets and malformed CP versions extents budgets and cancellation stay explicit',async()=>{
 const {parseJvmClass}=await import('../lib/artifact-jvm.mjs'),f=jvmClassFixture({switchCode:true}),parsed=parseJvmClass(f.bytes),instruction=parsed.methods[1].code.instructions[1];
 assert.equal(instruction.opcode,'tableswitch');assert.deepEqual(instruction.operands.cases,[{key:0,target:24},{key:1,target:26}]);
 for(const mutate of [b=>b.writeUInt16BE(70,6),b=>b.writeUInt16BE(65535,f.class_header_offset+2),b=>b.writeUInt16BE(0,8),b=>b.fill(0,b.length-2)]){const bytes=Buffer.from(f.bytes);mutate(bytes);assert.throws(()=>parseJvmClass(bytes));}
 assert.throws(()=>parseJvmClass(f.bytes.subarray(0,-1)));assert.throws(()=>parseJvmClass(f.bytes,{limits:{records:1}}),error=>error.code==='capacity');
 const controller=new AbortController();controller.abort(new Error('Owned JVM cancellation'));assert.throws(()=>parseJvmClass(f.bytes,{signal:controller.signal}),/Owned JVM cancellation/);
});

test('public DEX041 routes enumerate both logical classes and decode the second code item',async t=>{
 const {root,ctx}=await owned(t),file=path.join(root,'owned.dex'),{bytes}=dex041ContainerFixture();await fs.writeFile(file,bytes);
 const found=await ctx.call('search_android_classes',{path:file,query:'Owned.'});assert.deepEqual(found.normalized_result.matches,['Owned.First','Owned.Second']);
 const method=await ctx.call('inspect_android_method',{path:file,class_name:'Owned.Second',method_name:'run'});assert.equal(method.normalized_result.representation,'smali');assert.match(method.normalized_result.source.text,/return-void/);assert.deepEqual(await fs.readFile(file),bytes);
});

test('public JVM JAR routes retain raw bytecode without inventing Java source or DEX offsets',async t=>{
 const {root,ctx}=await owned(t),file=path.join(root,'owned.jar'),f=jvmClassFixture(),bytes=await zipFixture({'owned/Specimen.class':f.bytes,'META-INF/MANIFEST.MF':'Manifest-Version: 1.0\r\n\r\n'});await fs.writeFile(file,bytes);
 const classes=await ctx.call('search_android_classes',{path:file,query:'Specimen'});assert.deepEqual(classes.normalized_result.matches,['owned.Specimen']);assert.equal(classes.normalized_result.engine.name,'independent-jvm-classfile');
 const klass=await ctx.call('inspect_android_class',{path:file,class_name:'owned.Specimen'});assert.equal(klass.raw_result.jvm_class.version.major,61);assert.equal(klass.normalized_result.fields.find(field=>field.name==='wide').reported_type,'long');
 const method=await ctx.call('inspect_android_method',{path:file,class_name:'owned.Specimen',method_name:'run'});assert.equal(method.normalized_result.body_status,'not_available');assert.equal(method.normalized_result.source.text,'');assert.equal(method.raw_result.jvm_method.code.instructions.length,4);assert.ok(method.normalized_result.markers.includes('java-source-not-reconstructed'));
 const refs=await ctx.call('trace_android_references',{path:file,class_name:'owned.Specimen',method_name:'value'});assert.equal(refs.normalized_result.total,1);assert.equal(refs.normalized_result.references[0].kind,'field-reference');assert.equal(refs.normalized_result.references[0].source_line,null);assert.equal(refs.raw_result.jvm_references[0].source_line,7);assert.equal(refs.normalized_result.references[0].dex_offset,null);assert.equal(refs.raw_result.jvm_references[0].bytecode_offset,1);assert.deepEqual(await fs.readFile(file),bytes);
});

test('JAR multi-release duplicate identities stay ambiguous and malformed classes publish no evidence',async t=>{
 const {root,ctx}=await owned(t),file=path.join(root,'owned.jar'),f=jvmClassFixture();await fs.writeFile(file,await zipFixture({'owned/Specimen.class':f.bytes,'META-INF/versions/17/owned/Specimen.class':f.bytes}));
 await assert.rejects(ctx.call('inspect_android_class',{path:file,class_name:'owned.Specimen'}),/ambiguous/);assert.equal(ctx.ledger.size,0);
 const corrupt=Buffer.from(f.bytes);corrupt.writeUInt16BE(65535,f.class_header_offset+2);await fs.writeFile(file,await zipFixture({'owned/Specimen.class':corrupt}));await assert.rejects(ctx.call('search_android_classes',{path:file,query:'Specimen'}));assert.equal(ctx.ledger.size,0);
});

test('generic selected JAR inventory retains observed JVM class metadata through the public artifact route',async t=>{
 const {root}=await owned(t),file=path.join(root,'generic.jar'),f=jvmClassFixture(),bytes=await zipFixture({'owned/Specimen.class':f.bytes,'META-INF/MANIFEST.MF':'Manifest-Version: 1.0\r\n\r\n'});await fs.writeFile(file,bytes);
 const ctx=await engine({config:{temporaryRoot:root}});try{await ctx.call('open_binary',{path:file});const envelope=await ctx.call('inspect_artifact',{}),result=envelope.normalized_result,observation=envelope.raw_result.jvm_classes[0];assert.ok(observation);assert.equal(observation.logical_path,'owned/Specimen.class');assert.equal(observation.model.name,'owned.Specimen');assert.equal(observation.model.methods.length,3);assert.equal(result.subject.root_format,'zip');assert.equal(result.substeps[0].evidence.normalized_result.entries.find(row=>row.name==='owned/Specimen.class').format,'java-class');assert.deepEqual(await fs.readFile(file),bytes);}finally{if(ctx.target)await ctx.call('close_binary',{});}
});

test('managed auxiliary locals property generic instantiation and standalone call signatures retain actual types',async()=>{
 const mod=await import('../lib/artifact-managed-values.mjs');assert.equal(typeof mod.decodeManagedAuxSignature,'function');const decode=(kind,data)=>mod.decodeManagedAuxSignature(Buffer.from(data),{kind});
 const locals=decode('standalone',[7,3,8,0x45,0x10,0x12,5,0x1d,0x1e,0]);assert.equal(locals.parse_status,'decoded');assert.equal(locals.kind,'locals');assert.deepEqual(locals.local_types,['int32','class 0x01000001& pinned','!!0[]']);
 const property=decode('property',[0x28,1,14,8]);assert.equal(property.property_type,'string');assert.deepEqual(property.parameter_types,['int32']);
 const instance=decode('method-spec',[10,2,8,0x15,0x12,5,1,14]);assert.deepEqual(instance.generic_arguments,['int32','class 0x01000001<string>']);
 const call=decode('standalone',[5,2,1,8,0x41,14]);assert.equal(call.calling_convention,'0x5');assert.deepEqual(call.parameter_types,['int32','sentinel string']);
 assert.equal(decode('type-spec',[0x14,8,2,1,3,2,0x7f,2]).type,'int32[rank=2;sizes=[3];lower=[-1,1]]');
 for(const [kind,data]of [['standalone',[7,1,1]],['property',[8,0,1]],['method-spec',[10,1,8,8]],['method-spec',[9,1,8]],['standalone',[7,1,0x41]],['type-spec',[0x15,0x12,5,255]]])assert.notEqual(decode(kind,data).parse_status,'decoded');
 const controller=new AbortController();controller.abort(new Error('Owned signature cancellation'));assert.throws(()=>mod.decodeManagedAuxSignature(Buffer.from([7,1,8]),{kind:'standalone',signal:controller.signal}),/Owned signature cancellation/);
});

test('public managed members retain standalone locals and MethodSpec argument evidence without changing normalized contracts',async t=>{
 const {managedGenericFixture}=await import('./artifact-gaps-fixtures.mjs'),{root}=await owned(t),file=path.join(root,'owned.dll'),{bytes}=managedGenericFixture();await fs.writeFile(file,bytes);const ctx=await engine({config:{temporaryRoot:root}}),envelope=await ctx.call('inspect_managed_members',{path:file});assert.deepEqual(envelope.raw_result.auxiliary_signatures.find(row=>row.table==='StandAloneSig').decoded.local_types,['int32']);assert.deepEqual(envelope.raw_result.auxiliary_signatures.find(row=>row.table==='MethodSpec').decoded.generic_arguments,['int32']);assert.equal(envelope.normalized_result.methods[0].body.local_var_sig_token,'0x11000001');assert.deepEqual(await fs.readFile(file),bytes);
});

test('generic malformed JVM JAR inspection preserves the existing evidence bundle',async t=>{
 const {root}=await owned(t),file=path.join(root,'malformed.jar'),f=jvmClassFixture(),corrupt=Buffer.from(f.bytes);corrupt.writeUInt16BE(65535,f.class_header_offset+2);const bytes=await zipFixture({'owned/Specimen.class':corrupt});await fs.writeFile(file,bytes);
 const ctx=await engine({config:{temporaryRoot:root}});try{await ctx.call('open_binary',{path:file});const prior=[...ctx.ledger.entries()];await assert.rejects(ctx.call('inspect_artifact',{}));assert.deepEqual([...ctx.ledger.entries()],prior);assert.deepEqual(await fs.readFile(file),bytes);}finally{if(ctx.target)await ctx.call('close_binary',{});}
});

test('binary CPIO both word byte orders retain exact regular-file bytes including high size words',()=>{
 for(const little of [true,false]){const large=Buffer.alloc(65539,0x41),f=binaryCpioFixture({'odd.txt':'abc','next.bin':large},{little}),before=Buffer.from(f.bytes),entries=cpioEntries(f.bytes);assert.deepEqual(entries.map(row=>row.name),['odd.txt','next.bin']);assert.deepEqual(entries[1].data,large);assert.equal(entries[0].data.toString(),'abc');assert.deepEqual(packagePayloadEntries(gzipSync(f.bytes)).map(row=>row.sha256),entries.map(row=>row.sha256));assert.deepEqual(f.bytes,before);}
});

test('binary CPIO rejects escaped names links truncation nonzero padding bounds and cancellation',()=>{
 const f=binaryCpioFixture({'ab':'odd'});for(const mutate of [b=>b.writeUInt16LE(65535,20),b=>b.writeUInt16LE(65535,22),b=>b.writeUInt16LE(0xa1a4,6),b=>b.writeUInt16LE(2,12),b=>{b[f.records[0].data_at-1]=1;},b=>{b[f.records[0].data_at+3]=1;}]){const bytes=Buffer.from(f.bytes);mutate(bytes);assert.throws(()=>cpioEntries(bytes));}assert.throws(()=>cpioEntries(binaryCpioFixture({'../outside':'held'}).bytes),/Unsafe/);assert.throws(()=>cpioEntries(f.bytes.subarray(0,-1)));assert.throws(()=>cpioEntries(f.bytes,{maxEntries:0}));assert.throws(()=>cpioEntries(f.bytes,{maxBytes:1}));const controller=new AbortController();controller.abort(new Error('Owned CPIO cancellation'));assert.throws(()=>cpioEntries(f.bytes,{signal:controller.signal}),/Owned CPIO cancellation/);
});

test('HFS+/HFSX catalog and regular-file overflow extents preserve exact fragmented bytes',()=>{
 for(const caseSensitive of [false,true]){const f=hfsOverflowFixture({caseSensitive}),before=Buffer.from(f.disk),entries=hfsEntries(f.disk);assert.deepEqual(entries.find(row=>row.name==='alpha.txt').data,f.files['alpha.txt']);assert.deepEqual(entries.find(row=>row.name==='Docs/café.txt').data,f.files['Docs/café.txt']);assert.deepEqual(f.disk,before);}
});

test('HFS overflow keys allocation overlaps leaf cycles and missing chains fail without guessed bytes',()=>{
 const f=hfsOverflowFixture();for(const mutate of [b=>b.writeUInt32BE(9,f.recordOffsets[1]+8),b=>b.writeUInt32BE(4,f.recordOffsets[1]+4),b=>b.writeUInt32BE(34,f.recordOffsets[1]+12),b=>b.writeUInt32BE(1,f.treeAt+1024),b=>b.writeUInt32BE(100,f.recordOffsets[1]+12),b=>b.writeUInt16BE(11,f.recordOffsets[1]),b=>b.writeUInt32BE(0,f.recordOffsets[1]+16)]){const bytes=Buffer.from(f.disk);mutate(bytes);assert.throws(()=>hfsEntries(bytes));}assert.throws(()=>hfsEntries(f.disk,{maxEntries:1}));assert.throws(()=>hfsEntries(f.disk,{maxBytes:1024}));const controller=new AbortController();controller.abort(new Error('Owned HFS overflow cancellation'));assert.throws(()=>hfsEntries(f.disk,{signal:controller.signal}),/Owned HFS overflow cancellation/);
});

test('JVM wide locals interface slot counts reserved opcodes and modified UTF8 retain strict boundaries',()=>{
 const resolve=(_index,kind)=>kind==='interface-method'?{signature:{parameter_slots:2}}:{kind:'class',class_name:'owned.Specimen',descriptor:'Lowned/Specimen;'};
 assert.equal(decodeJvmCode(Buffer.from([0xc4,0x84,1,0,0xff,0xff,0xb1]),{resolve,maxLocals:257}).instructions[0].operands.increment,-1);assert.throws(()=>decodeJvmCode(Buffer.from([0xc4,0x16,1,0]),{resolve,maxLocals:257}),/max_locals/);assert.throws(()=>decodeJvmCode(Buffer.from([0x1e]),{resolve,maxLocals:1}),/max_locals/);assert.throws(()=>decodeJvmCode(Buffer.from([0xb9,0,1,2,0]),{resolve}),/descriptor slots/);assert.equal(decodeJvmCode(Buffer.from([0xb9,0,1,3,0,0xb1]),{resolve}).status,'decoded');assert.equal(decodeJvmCode(Buffer.from([0xca]),{resolve}).status,'partial');assert.equal(decodeJvmCode(Buffer.from([0x12,1,0xb1]),{resolve}).references[0].kind,'type-reference');
 assert.equal(decodeModifiedUtf8(Buffer.from([0x41,0xc0,0x80,0xed,0xa0,0xbd,0xed,0xb8,0x80])),'A\0😀');for(const value of [[0],[0xc1,0x81],[0xe0,0x80,0x81],[0xf0,0x9f,0x98,0x80],[0xe2,0x80]])assert.throws(()=>decodeModifiedUtf8(Buffer.from(value)));assert.throws(()=>decodeModifiedUtf8(Buffer.from([65]),{expectedUnits:2}));
});

test('public UDIF extraction consumes owned catalog and data-fork overflow chains',async t=>{
 const {dmgFixture}=await import('./artifact-parity-fixtures.mjs'),{root}=await owned(t),f=hfsOverflowFixture(),container=dmgFixture().bytes;f.disk.copy(container);const file=path.join(root,'overflow.dmg');await fs.writeFile(file,container);const ctx=await engine({config:{temporaryRoot:root}});try{await ctx.call('open_binary',{path:file});const result=await ctx.call('extract_artifact',{});assert.deepEqual(await fs.readFile(path.join(result.normalized_result.output_root,'alpha.txt')),f.files['alpha.txt']);assert.deepEqual(await fs.readFile(file),container);}finally{if(ctx.target)await ctx.call('close_binary',{});}
});
