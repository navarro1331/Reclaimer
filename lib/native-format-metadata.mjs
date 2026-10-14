import { NativeCursor, NATIVE_HANDLE } from './native-format.mjs';
import { checkAotSignal } from './native-aot-memory.mjs';
import { digest } from './artifact-binary.mjs';

export function nativeHandle(value) {return value?{kind:value%256,offset:Math.floor(value/256)}:null;}

// Field order and handle kinds come from official record declarations. This is
// an independently authored reader, not a translated vendor deserializer.
export class NativeMetadata {
  constructor(bytes,{signal,budget}={}) {this.bytes=bytes;this.signal=signal;this.budget=budget;this.records=new Map();this.stringCache=new Map();this.namespaceCache=new Map();this.typeCache=new Map();if(bytes.length<5||bytes.readUInt32LE(0)!==0xdeaddffd)throw new Error('NativeFormat metadata signature is absent');const c=new NativeCursor(bytes,4,{signal,budget});this.scopes=c.list();this.header_size=c.offset;}
  record(kind,offset) {
    checkAotSignal(this.signal);if(!Number.isSafeInteger(offset)||offset<this.header_size||offset>=this.bytes.length)throw new Error('NativeFormat record handle is outside metadata records');const key=kind+':'+offset;if(this.records.has(key))return this.records.get(key);
    this.budget?.take('nodes');const c=new NativeCursor(this.bytes,offset,{signal:this.signal,budget:this.budget}),u=()=>c.u(),u16=()=>{const value=u();if(value>65535)throw new Error('NativeFormat ushort field exceeds its declared range');return value;},list=()=>c.list(),generic=()=>nativeHandle(u());let fields;
    if(kind===NATIVE_HANDLE.String)fields={value:c.string()};
    else if(kind===NATIVE_HANDLE.Scope)fields={flags:u(),name:u(),hash_algorithm:u(),version:[u16(),u16(),u16(),u16()],public_key:c.bytesArray(),culture:u(),root_namespace:u(),entry_point:u(),global_module_type:u(),custom_attributes:list(),module_name:u(),mvid:c.bytesArray(),module_custom_attributes:list()};
    else if(kind===NATIVE_HANDLE.ScopeReference)fields={flags:u(),name:u(),version:[u16(),u16(),u16(),u16()],public_key_or_token:c.bytesArray(),culture:u()};
    else if(kind===NATIVE_HANDLE.Namespace)fields={parent:generic(),name:u(),types:list(),forwarders:list(),namespaces:list()};
    else if(kind===NATIVE_HANDLE.NamespaceReference)fields={parent:generic(),name:u()};
    else if(kind===NATIVE_HANDLE.Type)fields={flags:u(),base_type:generic(),namespace:u(),name:u(),size_hint:u(),packing_size_hint:u16(),enclosing_type:u(),nested_types:list(),methods:list(),fields:list(),properties:list(),events:list(),generic_parameters:list(),interfaces:list(),custom_attributes:list()};
    else if(kind===NATIVE_HANDLE.TypeReference)fields={parent:generic(),name:u()};
    else if(kind===NATIVE_HANDLE.Method)fields={flags:u(),implementation_flags:u(),name:u(),signature:u(),parameters:list(),generic_parameters:list(),custom_attributes:list()};
    else if(kind===NATIVE_HANDLE.Field)fields={flags:u(),name:u(),signature:u(),default_value:generic(),metadata_offset:u(),custom_attributes:list()};
    else if(kind===NATIVE_HANDLE.MethodSignature)fields={calling_convention:u(),generic_parameter_count:c.s(),return_type:generic(),parameters:list(),vararg_parameters:list()};
    else if(kind===NATIVE_HANDLE.FieldSignature)fields={type:generic()};
    else throw new Error('NativeFormat record kind is not supported by the bounded identity reader');
    const record={kind,offset,size:c.offset-offset,fields};this.records.set(key,record);return record;
  }
  string(offset){if(!offset)return null;if(this.stringCache.has(offset))return this.stringCache.get(offset);const value=this.record(NATIVE_HANDLE.String,offset).fields.value;this.stringCache.set(offset,value);return value;}
  namespace(handle,ancestors=new Set()) {
    checkAotSignal(this.signal);if(!handle||![NATIVE_HANDLE.Namespace,NATIVE_HANDLE.NamespaceReference].includes(handle.kind))throw new Error('NativeFormat namespace handle has an invalid kind');const key=handle.kind+':'+handle.offset;if(ancestors.has(key)||ancestors.size>=64)throw new Error('NativeFormat namespace cycle or depth limit');if(this.namespaceCache.has(key))return this.namespaceCache.get(key);const seen=new Set(ancestors).add(key),r=this.record(handle.kind,handle.offset),name=this.string(r.fields.name)??'',parent=r.fields.parent;
    if(!parent)throw new Error('NativeFormat namespace has no owning scope');
    if(!(handle.kind===NATIVE_HANDLE.Namespace?[NATIVE_HANDLE.Namespace,NATIVE_HANDLE.Scope]:[NATIVE_HANDLE.NamespaceReference,NATIVE_HANDLE.ScopeReference]).includes(parent.kind))throw new Error('NativeFormat namespace parent kind contradicts its declared record kind');
    if([NATIVE_HANDLE.Scope,NATIVE_HANDLE.ScopeReference].includes(parent.kind)){const scope=this.record(parent.kind,parent.offset),assemblyName=this.string(scope.fields.name),culture=this.string(scope.fields.culture),material=scope.fields.public_key??scope.fields.public_key_or_token;if(!assemblyName)throw new Error('NativeFormat scope identity has no nonempty assembly name');this.budget?.take('expanded_name_bytes',Buffer.byteLength(name)+Buffer.byteLength(assemblyName)+Buffer.byteLength(culture??'')+24);const value={namespace:name,assembly:{name:assemblyName,version:scope.fields.version.join('.'),culture},scope_identity:{record_kind:parent.kind===NATIVE_HANDLE.Scope?'ScopeDefinition':'ScopeReference',flags:scope.fields.flags,key_material_bytes:material.length,key_material_sha256:digest(material)},records:[r,scope]};this.namespaceCache.set(key,value);return value;}
    const above=this.namespace(parent,seen),size=Buffer.byteLength(above.namespace)+Buffer.byteLength(name)+Number(!!above.namespace&&!!name);if(size>65536)throw Object.assign(new Error('NativeFormat qualified namespace exceeds 64 KiB'),{code:'capacity'});this.budget?.take('expanded_name_bytes',size);const value={...above,namespace:[above.namespace,name].filter(Boolean).join('.'),records:[r,...above.records]};this.namespaceCache.set(key,value);return value;
  }
  type(offset,ancestors=new Set()) {
    checkAotSignal(this.signal);if(ancestors.has(offset)||ancestors.size>=64)throw new Error('NativeFormat enclosing-type cycle or depth limit');if(this.typeCache.has(offset))return this.typeCache.get(offset);const seen=new Set(ancestors).add(offset),record=this.record(NATIVE_HANDLE.Type,offset),f=record.fields,name=this.string(f.name);if(!name)throw new Error('NativeFormat type identity has no nonempty name');const ns=this.namespace({kind:NATIVE_HANDLE.Namespace,offset:f.namespace});let qualified,records=[record,...ns.records];
    let namespace=ns.namespace;
    if(f.enclosing_type){const parent=this.type(f.enclosing_type,seen);if(JSON.stringify([parent.assembly,parent.scope_identity])!==JSON.stringify([ns.assembly,ns.scope_identity])||ns.namespace&&parent.namespace!==ns.namespace)throw new Error('NativeFormat nested type has conflicting namespace/scope ownership');const size=Buffer.byteLength(parent.qualified_name)+Buffer.byteLength(name)+1;if(size>65536)throw Object.assign(new Error('NativeFormat nested qualified type exceeds 64 KiB'),{code:'capacity'});this.budget?.take('expanded_name_bytes',size);qualified=parent.qualified_name+'+'+name;namespace=parent.namespace;records.push(...parent.records);}
    else{const size=Buffer.byteLength(ns.namespace)+Buffer.byteLength(name)+Number(!!ns.namespace);if(size>65536)throw Object.assign(new Error('NativeFormat qualified type exceeds 64 KiB'),{code:'capacity'});this.budget?.take('expanded_name_bytes',size);qualified=[ns.namespace,name].filter(Boolean).join('.');}
    const value={handle:{kind:'TypeDefinition',offset},name,namespace,qualified_name:qualified,assembly:ns.assembly,scope_identity:ns.scope_identity,generic_parameter_count:f.generic_parameters.length,record,records};this.typeCache.set(offset,value);return value;
  }
  inventory() {
    const scopes=[],types=new Map(),pending=[],visited=new Set();
    for(const offset of this.scopes){const scope=this.record(NATIVE_HANDLE.Scope,offset);scopes.push(scope);pending.push({kind:NATIVE_HANDLE.Namespace,offset:scope.fields.root_namespace,owner:{kind:NATIVE_HANDLE.Scope,offset}});if(scope.fields.global_module_type){const type=this.type(scope.fields.global_module_type);if(type.record.fields.enclosing_type||type.record.fields.namespace!==scope.fields.root_namespace)throw new Error('NativeFormat global module type has conflicting scope/root namespace ownership');types.set(scope.fields.global_module_type,type);}}
    while(pending.length){checkAotSignal(this.signal);const handle=pending.pop(),key=handle.kind+':'+handle.offset,namespace=this.record(handle.kind,handle.offset);if(namespace.fields.parent?.kind!==handle.owner.kind||namespace.fields.parent.offset!==handle.owner.offset)throw new Error('NativeFormat listed namespace has conflicting parent ownership');if(visited.has(key))continue;visited.add(key);this.namespace(handle);for(const offset of namespace.fields.types){const type=this.type(offset);if(type.record.fields.namespace!==handle.offset||type.record.fields.enclosing_type)throw new Error('NativeFormat listed top-level type has conflicting namespace ownership');if(!types.has(offset))types.set(offset,type);}pending.push(...namespace.fields.namespaces.map(offset=>({kind:NATIVE_HANDLE.Namespace,offset,owner:{kind:NATIVE_HANDLE.Namespace,offset:handle.offset}})));}
    const queue=[...types.values()];for(let at=0;at<queue.length;at++){checkAotSignal(this.signal);for(const nested of queue[at].record.fields.nested_types){const type=this.type(nested);if(type.record.fields.enclosing_type!==queue[at].handle.offset)throw new Error('NativeFormat listed nested type has conflicting enclosing ownership');if(!types.has(nested)){types.set(nested,type);queue.push(type);}}}
    return {scopes,types:[...types.values()]};
  }
}
