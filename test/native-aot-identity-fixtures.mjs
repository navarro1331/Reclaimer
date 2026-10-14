import { aotRecoveryFixture, asAotElf } from './native-aot-recovery-fixtures.mjs';
import { hex } from '../lib/artifact-binary.mjs';

// Fixed-width legal Native Format integer packets make every forward reference
// explicit and patchable; real compiler probes separately exercise compact forms.
export const nativeUInt=value=>{const b=Buffer.alloc(5);b[0]=15;b.writeUInt32LE(value,1);return b;};
const sequence=(...values)=>Buffer.concat(values.map(value=>Buffer.isBuffer(value)?value:nativeUInt(value)));
const list=values=>sequence(values.length,...values);

export function identityFixture({conflict=false,includeMap=true,pointerSize=8,legacy=false,sourceBase=0x400000n,noFrozen=false,widgetName='Widget',assemblyKey=Buffer.alloc(0),assemblyVersion=[1,0,0,0],nestedLeaf=false,leafScopeKey=null,namespaceName='Owned',extraTypeNames=[]}={}) {
  const f=aotRecoveryFixture({pointerSize,legacy,sourceBase}),records=[],byName=new Map(),ptr=(buffer,offset,value)=>pointerSize===8?buffer.writeBigUInt64LE(value,offset):buffer.writeUInt32LE(Number(value),offset);
  const add=(name,kind,make)=>{const record={name,kind,make,offset:0};records.push(record);byName.set(name,record);};
  const at=name=>byName.get(name)?.offset??0,generic=name=>at(name)*256+byName.get(name).kind;
  for(const [name,value]of Object.entries({assembly:'Reclaimer.Owned.Identity',empty:'',ns:namespaceName,widget:widgetName,leaf:'Leaf',unbound:'UnmappedWitness',mix:'Mix',serial:'Serial',module:'Owned.Identity.dll',...Object.fromEntries(extraTypeNames.map((name,index)=>['extra_name_'+index,name]))}))add(name,26,()=>sequence(Buffer.byteLength(value),Buffer.from(value)));
  add('scope',56,()=>sequence(assemblyKey.length?1:0,at('assembly'),0,...assemblyVersion,sequence(assemblyKey.length,assemblyKey),at('empty'),at('root'),0,0,list([]),at('module'),list([]),list([])));
  add('root',47,()=>sequence(generic('scope'),at('empty'),list([]),list([]),list([at('namespace')])));
  add('namespace',47,()=>sequence(generic('root'),at('ns'),list([at('type_widget'),...(!nestedLeaf?[at('type_leaf')]:[]),at('type_unbound'),...extraTypeNames.map((_name,index)=>at('extra_type_'+index))]),list([]),list([])));
  if(leafScopeKey){add('scope_leaf',56,()=>sequence(1,at('assembly'),0,...assemblyVersion,sequence(leafScopeKey.length,leafScopeKey),at('empty'),at('root_leaf'),0,0,list([]),at('module'),list([]),list([])));add('root_leaf',47,()=>sequence(generic('scope_leaf'),at('empty'),list([]),list([]),list([])));}
  const type=(name,method,field,enclosing=null)=>sequence(1,0,at(enclosing?leafScopeKey?'root_leaf':'root':'namespace'),at(name),0,0,enclosing?at(enclosing):0,list(nestedLeaf&&name==='widget'?[at('type_leaf')]:[]),list(method?[at(method)]:[]),list(field?[at(field)]:[]),list([]),list([]),list([]),list([]),list([]));
  add('type_widget',58,()=>type('widget','method_mix','field_serial'));add('type_leaf',58,()=>type('leaf',null,null,nestedLeaf?'type_widget':null));add('type_unbound',58,()=>type('unbound'));
  extraTypeNames.forEach((_name,index)=>add('extra_type_'+index,58,()=>type('extra_name_'+index)));
  add('method_mix',40,()=>sequence(6,0,at('mix'),at('method_signature'),list([]),list([]),list([])));
  add('method_signature',43,()=>sequence(32,0,generic('type_widget'),list([]),list([])));
  add('field_serial',35,()=>sequence(6,at('serial'),at('field_signature'),0,0,list([])));
  add('field_signature',36,()=>sequence(generic('type_widget')));
  let size=leafScopeKey?19:14;for(const record of records){record.offset=size;size+=record.make().length;}
  const metadata=Buffer.concat([Buffer.from([0xfd,0xdf,0xad,0xde]),list([at('scope'),...(leafScopeKey?[at('scope_leaf')]:[])]),...records.map(record=>record.make())]);
  // Two actual frozen instance records anchor independent canonical class MTs.
  f.rebuilt.fill(0,0,96);ptr(f.rebuilt,pointerSize,f.mt.object);f.rebuilt.writeInt32LE(73,pointerSize*2);ptr(f.rebuilt,pointerSize*4,f.mt.unanchored);f.rebuilt.writeInt32LE(11,pointerSize*5);f.rebuilt.writeUInt32LE(0x11111111,0x180+12+pointerSize);f.rebuilt.writeUInt32LE(conflict?0x11111111:0x22222222,0x300+12+pointerSize);const rebuiltFileOffset=0x500+(legacy?4:8)+3;f.rebuilt.copy(f.bytes,rebuiltFileOffset);f.frozenSize=noFrozen?0:pointerSize*6;
  const references=Buffer.alloc(12),referencesAddress=f.source+0x700n;for(const [index,target]of [f.mt.object,conflict?f.mt.object:f.mt.unanchored,f.source+0x9000n].entries())references.writeInt32LE(Number(target-referencesAddress-BigInt(index*4)),index*4);
  const payloads=Buffer.concat([sequence(0,0x3a000000+at('type_widget')),sequence(1,0x3a000000+at('type_leaf')),sequence(2,0x3a000000+at('type_unbound'))]);
  // One bucket, sorted low hash bytes, fixed-width signed relative entry links.
  const map=Buffer.alloc(31+payloads.length);map[0]=0;map[1]=2;map[2]=20;const hashes=[0x11,conflict?0x11:0x22,0],ordered=[2,0,1];
  for(let index=0;index<3;index++){const original=ordered[index],entry=3+index*6,target=21+original*10;map[entry]=hashes[original];map[entry+1]=15;map.writeInt32LE(target-(entry+1),entry+2);}payloads.copy(map,21);const typeMapAddress=f.source+0x680n,metadataAddress=f.source+0x800n;
  map.copy(f.bytes,1024+0x680);references.copy(f.bytes,1024+0x700);metadata.copy(f.bytes,1024+0x800);
  const sections=[[204,f.source+0xf00n,pointerSize],[206,f.destination,f.frozenSize],[207,f.streamAddress,f.stream.length],...(includeMap?[[301,typeMapAddress,map.length],[308,referencesAddress,references.length]]:[]),[313,metadataAddress,metadata.length]],entrySize=legacy?8+2*pointerSize:8+pointerSize;
  f.bytes.writeUInt16LE(sections.length,0x40c);for(const [index,[id,address,length]]of sections.entries()){const offset=0x410+index*entrySize;f.bytes.writeUInt32LE(id,offset);f.bytes.writeUInt32LE(legacy?1:length,offset+4);ptr(f.bytes,offset+8,address);if(legacy)ptr(f.bytes,offset+8+pointerSize,address+BigInt(length));}
  return {bytes:asAotElf(f),model:f.model,architecture:f.architecture,pointer_size:pointerSize,method_table_address:hex(f.mt.object),other_method_table_address:hex(f.mt.unanchored),qualified_name:'Owned.'+widgetName,assembly_name:'Reclaimer.Owned.Identity',generated_alias:'NativeAOT_MT_'+f.mt.object.toString(16),metadata_only_name:'Owned.UnmappedWitness',metadata,rebuilt_file_offset:rebuiltFileOffset,metadata_file_offset:1024+0x800,type_map_file_offset:1024+0x680,reference_file_offset:1024+0x700,handles:Object.fromEntries(records.map(record=>[record.name,{kind:record.kind,offset:record.offset}]))};
}
