import {identityFixture,nativeUInt} from './native-aot-identity-fixtures.mjs';
import {NativeCursor,nativeFormatBudget} from '../lib/native-format.mjs';
import {NativeMetadata} from '../lib/native-format-metadata.mjs';
const sequence=(...values)=>Buffer.concat(values.map(value=>Buffer.isBuffer(value)?value:nativeUInt(value))),list=values=>sequence(values.length,...values);
function oneBucket(values){const bytes=Buffer.alloc(9);bytes[0]=0;bytes[1]=2;bytes[2]=8;bytes[3]=0x33;nativeUInt(5).copy(bytes,4);return Buffer.concat([bytes,sequence(...values)]);}

// This selected-byte packet demonstrates the bounded internal layout profile.
// It is not a loader-valid PE and is never supplied to an execution provider.
export function aotExtensionFixture({unknownArgument=false,taggedComposition=false,unmappedComposition=false,readonly=true,contradictReadonly=false}={}){
 const f=identityFixture({noFrozen:true}),reader=new NativeMetadata(f.metadata,{budget:nativeFormatBudget()}),fields=reader.type(f.handles.type_widget.offset).record.fields;
 const nameT=f.metadata.length,t=sequence(1,Buffer.from('T')),nameU=nameT+t.length,u=sequence(1,Buffer.from('U')),parameterT=nameU+u.length,p0=sequence(0,0,0,nameT,list([]),list([])),parameterU=parameterT+p0.length,p1=sequence(1,0,0,nameU,list([]),list([])),typeOffset=parameterU+p1.length;
 const type=sequence(fields.flags,0,fields.namespace,fields.name,0,0,0,list([]),list(fields.methods),list(fields.fields),list([]),list([]),list([parameterT,parameterU]),list([]),list([])),metadata=Buffer.concat([f.metadata,t,u,p0,p1,type]);
 nativeUInt(readonly&&!contradictReadonly?0x26:6).copy(metadata,f.handles.field_serial.offset);
 const namespace=new NativeCursor(metadata,f.handles.namespace.offset);namespace.u();namespace.u();namespace.u();nativeUInt(typeOffset).copy(metadata,namespace.offset);metadata.copy(f.bytes,f.metadata_file_offset);nativeUInt(0x3a000000+typeOffset).copy(f.bytes,f.type_map_file_offset+26);
 const source=BigInt(f.model.segments[0].start),destination=BigInt(f.method_table_address)-0x180n,definition=f.rebuilt_file_offset+0x180,constructed=destination+0x380n,at=f.rebuilt_file_offset+0x380,composition=destination+0x3b0n;
 f.bytes.writeUInt32LE(0xd0030002,definition);f.bytes.fill(0,definition+4,definition+20);
 f.bytes.fill(0,at,at+40);f.bytes.writeUInt32LE(0x52000000,at);f.bytes.writeUInt32LE(24,at+4);f.bytes.writeUInt32LE(0x33333333,at+20);f.bytes.writeInt32LE(Number(BigInt(f.method_table_address)-constructed-32n),at+32);f.bytes.writeInt32LE(Number((unmappedComposition?source+0x9000n:composition)-constructed-36n),at+36);
 for(let index=0;index<2;index++){const field=composition+BigInt(index*4),target=index&&unknownArgument?destination+0x2c0n:BigInt(f.other_method_table_address);f.bytes.writeInt32LE(Number(target-field)+(index&&taggedComposition?1:0),f.rebuilt_file_offset+0x3b0+index*4);}
 const refs=source+0x700n,code=BigInt(f.model.functions[0].address);f.bytes.writeInt32LE(Number(constructed-refs-12n),f.reference_file_offset+12);f.bytes.writeInt32LE(Number(code-refs-16n),f.reference_file_offset+16);
 const invoke=oneBucket([0x24,f.handles.method_mix.offset,3,4]),fieldMap=oneBucket([readonly?0xa8:0x28,3,f.handles.field_serial.offset,8]);invoke.copy(f.bytes,1024+0x5b0);fieldMap.copy(f.bytes,1024+0x620);
 const old=[];for(let index=0;index<f.bytes.readUInt16LE(0x40c);index++){const at=0x410+index*16,id=f.bytes.readUInt32LE(at);old.push({id,size:id===308?20:id===313?metadata.length:f.bytes.readUInt32LE(at+4),address:f.bytes.readBigUInt64LE(at+8)});}old.push({id:306,size:invoke.length,address:source+0x5b0n},{id:309,size:fieldMap.length,address:source+0x620n});old.sort((a,b)=>a.id-b.id);f.bytes.writeUInt16LE(old.length,0x40c);old.forEach((section,index)=>{const at=0x410+index*16;f.bytes.writeUInt32LE(section.id,at);f.bytes.writeUInt32LE(section.size,at+4);f.bytes.writeBigUInt64LE(section.address,at+8);});
 f.bytes.writeUInt16LE(0x5a4d,0);f.bytes.writeUInt32LE(0x80,60);f.bytes.writeUInt32LE(0x4550,0x80);f.bytes.writeUInt16LE(0x8664,0x84);f.bytes.writeUInt16LE(0x20b,0x98);f.bytes.writeUInt16LE(9,0x404);f.bytes.writeUInt16LE(1,0x406);
 return {...f,constructed_address:'0x'+constructed.toString(16),constructed_name:'Owned.Widget<Owned.Leaf,Owned.Leaf>',composition_address:'0x'+composition.toString(16),code:'0x'+code.toString(16)};
}
