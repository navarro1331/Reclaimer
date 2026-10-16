import { hex } from './artifact-binary.mjs';
import { AOT_LIMIT, checkAotSignal, aotBound } from './native-aot-memory.mjs';

const ELEMENTS = { 2:'boolean',3:'char',4:'sbyte',5:'byte',6:'int16',7:'uint16',8:'int32',9:'uint32',10:'int64',11:'uint64',12:'intptr',13:'uintptr',14:'single',15:'double',16:'value-type',18:'nullable',20:'class',21:'interface',22:'system-array',23:'array',24:'szarray',25:'byref',26:'pointer',27:'function-pointer' };
const pointer = (buffer, at, size) => size === 8 ? buffer.readBigUInt64LE(at) : BigInt(buffer.readUInt32LE(at));
const align = (value, alignment) => Math.ceil(value / alignment) * alignment;

export function decodeAotMethodTable(memory, address, pointerSize, model, module, options = {}) {
  checkAotSignal(options.signal);
  const head = 16 + pointerSize, first = memory.read(address, head);
  if (!first || address % BigInt(pointerSize)) return null;
  const flags = first.readUInt32LE(0), kind = (flags >>> 16) & 3, element = (flags >>> 26) & 31, base = first.readUInt32LE(4);
  const genericDefinition=kind===3,arity=genericDefinition?flags&0xffff:null,component=!genericDefinition&&flags&0x80000000?flags&0xffff:0;
  const slots = first.readUInt16LE(8 + pointerSize), interfaces = first.readUInt16LE(10 + pointerSize);
  // A generic definition has the same fixed header, but its low ushort is
  // arity rather than element size. It never supplies an instance layout.
  if (!ELEMENTS[element] || ![0,2,3].includes(kind) || flags & 0x00080000 || slots > 1024 || interfaces > 1024 || base > AOT_LIMIT) return null;
  if(genericDefinition&&(!(flags&0x80000000)||flags&0x02000000||arity<1||arity>1024||![16,18,20,21].includes(element)||base||slots||interfaces||pointer(first,8,pointerSize)))return null;
  if(kind===0&&element>=23)return null;
  if (kind === 0 && element === 21 ? base !== 0 : kind === 0 && base < pointerSize * 2) return null;
  if (kind === 2 && ![23,24,25,26].includes(element)) return null;
  if (kind === 2 && [23,24].includes(element) && (base < pointerSize * 2 + (pointerSize === 8 ? 8 : 4) || !component)) return null;
  if (kind === 2 && [25,26].includes(element) && base > 1) return null;
  if (component && !(kind === 0 && element === 20 && component === 2 || kind === 2 && [23,24].includes(element))) return null;
  const size = head + (slots + interfaces) * pointerSize, raw = memory.read(address, size);
  if (!raw) return null;
  options.aggregateBudget?.take('types');options.aggregateBudget?.take('fields',6+slots+interfaces);
  const relatedAddress = pointer(raw, 8, pointerSize), related = relatedAddress ? { address: hex(relatedAddress), type: null } : null;
  const fields = [
    {name:'flags',offset_bytes:0,size_bytes:4,type:'uint32'},
    {name:'base_size',offset_bytes:4,size_bytes:4,type:'uint32'},
    {name:'related_type',offset_bytes:8,size_bytes:pointerSize,type:'pointer'},
    {name:'virtual_slot_count',offset_bytes:8+pointerSize,size_bytes:2,type:'uint16'},
    {name:'interface_count',offset_bytes:10+pointerSize,size_bytes:2,type:'uint16'},
    {name:'hash_code',offset_bytes:12+pointerSize,size_bytes:4,type:'uint32'},
  ];
  const limitations = ['Generated method-table name is an address label; original metadata identity is unknown.','Only the fixed method-table header, virtual slots and interface pointers are defined. Optional fields, GC descriptors, generic composition and interface dispatch maps remain undecoded.'];
  if(genericDefinition)limitations.push('This header identifies an uninstantiated generic definition and its arity. No constructed arguments, instance size, allocation or original field layout are inferred.');
  const virtual = Array.from({length:slots}, (_, slot) => {
    const at = head + slot * pointerSize, target = pointer(raw, at, pointerSize), exact = (model.functions ?? []).find(f => f.address === hex(target));
    fields.push({name:`virtual_slot_${slot}`,offset_bytes:at,size_bytes:pointerSize,type:'pointer'});
    if (target && !memory.executable(target)) limitations.push(`Virtual slot ${slot} target ${hex(target)} is not uniquely mapped executable memory; dispatch remains unverified.`);
    return {slot,slot_address:hex(address+BigInt(at)),target_address:target?hex(target):null,procedure_name:exact?.name??null,basis:'method-table-pointer'};
  });
  const interfaceTypes = Array.from({length:interfaces}, (_, index) => {
    const at = head + (slots + index) * pointerSize, target = pointer(raw, at, pointerSize);
    fields.push({name:`interface_${index}`,offset_bytes:at,size_bytes:pointerSize,type:'pointer'});
    if(!target)limitations.push(`Interface pointer ${index} is zero; a concrete implemented interface is not inferred.`);
    return {address:hex(target),type:null};
  });
  const name = `NativeAOT_MT_${address.toString(16)}`, derived = module.reconstruction ? {address:hex(module.reconstruction.address),size_bytes:module.reconstruction.bytes.length,sha256:module.reconstruction.sha256,file_offset:null} : null;
  const diagnostics=[`Decoded fixed header, ${slots} virtual slots and ${interfaces} interface pointers from ${memory.describe(address,size)?.source}.`];
  if(!derived)limitations.push('This method table is directly source-file-backed; a rehydrated-memory metadata block is not fabricated.');
  return {
    address:hex(address),id:`nativeaot:mt:${hex(address)}`,name,name_origin:'generated',original_name:null,
    kind:genericDefinition?'generic-definition':kind===0?'canonical':'parameterized',...(genericDefinition?{generic_parameter_count:arity}:{}),element_type:ELEMENTS[element],flags:hex(flags),base_size_bytes:base,component_size_bytes:component,related_type:related,interfaces:interfaceTypes,virtual_slots:virtual,
    layout:{size_bytes:size,alignment_bytes:pointerSize,fields,complete:false},anchors:[],source:memory.describe(address,size),diagnostics,limitations,
    ...(derived?{metadata_recovery:{format:'dotnet-nativeaot',status:'partial',header_address:module.header_address,format_major:module.format_major,format_minor:module.format_minor,method_table_address:hex(address),name_origin:'generated',original_name:null,base_size_bytes:base,related_type:related,interfaces:interfaceTypes,virtual_slots:virtual,derived_memory:derived,diagnostics,limitations}}:{}),
  };
}

export function recoverAotObjects(memory, region, pointerSize, model, module, options = {}) {
  const maximumTypes=aotBound(options.maxTypes,10000,10000,'type'), maximumObjects=aotBound(options.maxObjects,10000,10000,'frozen object');
  const types = new Map(), rejected = new Map(), instances = [], diagnostics = [], candidates = [], end = region.address + BigInt(region.size);
  const decode = address => {
    const key=hex(address);if(types.has(key))return types.get(key);if(rejected.has(key))return null;
    if(types.size>=maximumTypes)throw Object.assign(new Error('NativeAOT type budget exceeded'),{code:'capacity'});
    const type=decodeAotMethodTable(memory,address,pointerSize,model,module,options);if(!type){rejected.set(key,true);return null;}return type;
  };
  let cursor=region.address;
  while(cursor<end) {
    checkAotSignal(options.signal);
    if(instances.length>=maximumObjects)throw Object.assign(new Error('NativeAOT frozen object budget exceeded'),{code:'capacity'});
    const prefix=memory.read(cursor,pointerSize*2);
    if(!prefix){diagnostics.push(`Frozen region object header at ${hex(cursor)} is not uniquely backed; decoding stopped without resynchronization.`);break;}
    const address=cursor+BigInt(pointerSize), table=pointer(prefix,pointerSize,pointerSize), type=table?decode(table):null;
    if(!type || !['canonical','parameterized'].includes(type.kind) || !['class','array','szarray','value-type','nullable',...Object.values(ELEMENTS).slice(0,14)].includes(type.element_type) || type.kind==='parameterized'&&!['array','szarray'].includes(type.element_type)) {
      if(table)candidates.push({address:hex(table),reason:`Frozen object pointer at ${hex(address)} has an unsupported or malformed method-table layout.`});
      diagnostics.push(`Frozen region object at ${hex(address)} has no validated instance method table; decoding stopped without resynchronization.`);break;
    }
    const component=type.component_size_bytes, countBytes=component?memory.read(address+BigInt(pointerSize),4):null;
    if(component&&!countBytes){diagnostics.push(`Frozen component count at ${hex(address)} is unavailable.`);break;}
    const count=countBytes?countBytes.readUInt32LE(0):null, unaligned=type.base_size_bytes+(count??0)*component, size=align(Math.max(pointerSize*3,unaligned),pointerSize);
    if(!Number.isSafeInteger(size)||size>AOT_LIMIT||size<pointerSize*2||cursor+BigInt(size)>end||!memory.read(cursor,size)){diagnostics.push(`Frozen object at ${hex(address)} exceeds its declared region or object-size bound.`);break;}
    const string=component===2&&type.kind==='canonical'&&type.element_type==='class';
    const kind=string?'string':component?'array':'object', dataAddress=component?address+BigInt(string?pointerSize+4:type.base_size_bytes-pointerSize):null, dataSize=(count??0)*component;
    const limitations=['Instance extent and method table are static format observations; no runtime allocation or execution was observed.'];
    let text=null;
    if(string){const data=memory.read(dataAddress,dataSize+2);if(!data||dataAddress+BigInt(dataSize+2)>cursor+BigInt(size)||data.readUInt16LE(dataSize)!==0){diagnostics.push(`Frozen string at ${hex(address)} has no bounded UTF-16 terminator.`);break;}text=data.subarray(0,dataSize).toString('utf16le');}
    if(component && dataAddress+BigInt(dataSize)>cursor+BigInt(size)){diagnostics.push(`Frozen component data at ${hex(address)} exceeds its instance extent.`);break;}
    if(prefix.subarray(0,pointerSize).some(byte=>byte!==0))limitations.push('Nonzero recorded sync-block/header bytes are retained; their runtime interpretation is unknown.');
    if(component&&!string)limitations.push('Array component bytes are retained without inferring element names, nested references or rank-specific bounds.');
    type.anchors.push({kind:'frozen-object-method-table',address:hex(address)});types.set(type.address,type);
    const instanceSize=size-pointerSize,instanceFields=[{name:'method_table',offset_bytes:0,size_bytes:pointerSize,type:'pointer'}];
    options.aggregateBudget?.take('instances');options.aggregateBudget?.take('fields',1+Number(!!component)+Number(!!component&&dataSize>0)+Number(string)+Number(!component&&instanceSize>pointerSize));
    if(component)instanceFields.push({name:'component_count',offset_bytes:pointerSize,size_bytes:4,type:'uint32'});
    if(component&&dataSize)instanceFields.push({name:string?'utf16_data':'component_data',offset_bytes:Number(dataAddress-address),size_bytes:dataSize,type:'bytes'});
    if(string)instanceFields.push({name:'utf16_terminator',offset_bytes:Number(dataAddress-address)+dataSize,size_bytes:2,type:'uint16'});
    if(!component&&instanceSize>pointerSize)instanceFields.push({name:'opaque_instance_data',offset_bytes:pointerSize,size_bytes:instanceSize-pointerSize,type:'bytes'});
    instances.push({address:hex(address),header_address:hex(cursor),method_table_address:hex(table),method_table_type_id:type.id,type_id:`nativeaot:instance:${hex(address)}`,name:`NativeAOT_Instance_${address.toString(16)}`,size_bytes:instanceSize,allocation_size_bytes:size,component_count:count,kind,string_value:text,data_address:dataAddress?hex(dataAddress):null,data_size_bytes:component?dataSize:null,layout:{size_bytes:instanceSize,alignment_bytes:pointerSize,fields:instanceFields,complete:false},source:memory.describe(address,instanceSize),limitations});
    cursor+=BigInt(size);
  }
  // Only relationships reached from an actual frozen instance become defined
  // types. A plausible header elsewhere in reconstructed memory stays uncommitted.
  const queue=[...types.values()];for(let index=0;index<queue.length;index++) {
    checkAotSignal(options.signal);const parent=queue[index];
    for(const [kind,reference] of [['related-type',parent.related_type],...parent.interfaces.map(i=>['interface-map',i])]) {
      if(!reference||reference.address==='0x0')continue;
      const type=decode(BigInt(reference.address));if(!type){parent.limitations.push(`Referenced ${kind} ${reference.address} is not a validated fixed method table.`);continue;}
      type.anchors.push({kind,address:parent.address});if(!types.has(type.address)){types.set(type.address,type);queue.push(type);}
    }
  }
  return {types:[...types.values()],instances,structural_candidates:candidates,diagnostics,consumed_bytes:Number(cursor-region.address),complete:cursor===end};
}
