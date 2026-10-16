import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {digest} from '../lib/core.mjs';
import {recoverSwiftDeclarations} from '../lib/swift-declarations.mjs';
import {declarationBudget} from '../lib/swift-declaration-budget.mjs';
import {chargeJsonBytes} from '../lib/bounded-json.mjs';
import {swiftDeclarationImage} from './swift-declaration-packets.mjs';
import {engine} from '../lib/engine.mjs';

// Independently authored packets exercise exact 0.903 field boundaries. These
// are deliberately small byte streams, not rewrites of a compiler's output.
function packet({types=[{code:4,values:[1,0]}],selected=1,version=903,signatures=[],parameter=null,callable=false}={}) {
 const bits=[],frames=[],declOffsets=[],typeOffsets=[],signatureOffsets=[];let width=2;
 const fixed=(value,n)=>{value=BigInt(value);for(let i=0;i<n;i++)bits.push(Number(value>>BigInt(i)&1n));};
 const vbr=(value,n)=>{value=BigInt(value);const mask=(1n<<BigInt(n-1))-1n;do{const part=value&mask;value>>=BigInt(n-1);fixed(part|(value?1n<<BigInt(n-1):0n),n);}while(value);};
 const align=()=>{while(bits.length%32)bits.push(0);};
 function enter(id){fixed(1,width);vbr(id,8);vbr(3,4);align();const at=bits.length;fixed(0,32);frames.push({width,at,start:bits.length,abbreviations:0,block:id});width=3;}
 function end(){fixed(0,width);align();const f=frames.pop(),words=(bits.length-f.start)/32;for(let i=0;i<32;i++)bits[f.at+i]=words>>>i&1;width=f.width;}
 function record(code,values=[]){
  if(version===871&&frames.length===2&&frames.at(-1).block===11){if(code===51)values=[values[0],values[1],0,0,0,values[2]];if(code===2)values=[values[0]===1?1:0,values[1]?values[4]:values[2],values[1]?0:values[3]+1];if(code===8)values=[...values.slice(0,10),0,values[10]];code=code>=5&&code<=37?code+1:code>=50&&code<=75?code-10:code;}
  if(version===944&&frames.at(-1).block===11){if(code===8)values=[...values.slice(0,10),0,values[10],0];if(code===56)values=[...values.slice(0,10),0,values[10],0,...values.slice(11)];if(code>=21&&code<=39)code++;}
  const at=bits.length;fixed(3,width);vbr(code,6);vbr(values.length,6);for(const value of values)vbr(value,6);return at;
 }
 function blob(code,bytes,values=[]){const f=frames.at(-1),id=4+f.abbreviations++;fixed(2,width);vbr(2+values.length,5);fixed(1,1);vbr(code,8);for(const value of values){fixed(0,1);fixed(2,3);vbr(6,5);}fixed(0,1);fixed(5,3);fixed(id,width);for(const value of values)vbr(value,6);vbr(bytes.length,6);align();for(const value of bytes)fixed(value,8);align();}
 const identifiers=['Token','Source','Item','Element','shape','argument','local'],pieces=[Buffer.from([0])],offsets=[];let cursor=1;
 for(const text of identifiers){offsets.push(cursor);const bytes=Buffer.from(text+'\0');pieces.push(bytes);cursor+=bytes.length;}
 fixed(0x0ea89ce2,32);enter(8);enter(9);blob(1,Buffer.alloc(0),[0,version,0,0,0,0,0,0]);blob(2,Buffer.from('OwnedCompletion'));blob(3,Buffer.from('x86_64-apple-macosx10.15'));end();
 enter(10);blob(1,Buffer.from('../never-read/owned.swift'));end();enter(11);
 declOffsets.push(record(53,[6,0,0,0,0,4,0,0]));
 declOffsets.push(record(60,[7,0,0,0,0,0,0,4]));
 declOffsets.push(record(52,[8,2,0,0]));
 declOffsets.push(record(51,[9,0,0,0]));
 if(callable){declOffsets.push(record(57,[0,0,0,0,0,0,0,0,0,0,signatures.length?1:0,selected,0,0,0,0,2,4,0,0,0,0,0,10,11]));record(100,parameter?[6]:[]);if(parameter)declOffsets.push(record(56,parameter));}
 else {const values=Array(24).fill(0);values[0]=10;values[16]=selected;values[19]=4;declOffsets.push(record(55,values));}
 for(const type of types){typeOffsets.push(record(type.code,type.values));for(const tail of type.trailing??[])record(tail.code,tail.values);}
 for(const signature of signatures)signatureOffsets.push(record(121,signature));end();
 enter(12);blob(1,Buffer.concat(pieces));end();enter(13);record(1,typeOffsets);record(2,declOffsets);record(3,offsets);record(12,[]);record(15,signatureOffsets);record(17,[]);record(18,[]);end();end();
 const bytes=Buffer.alloc(bits.length/8);bits.forEach((value,i)=>{if(value)bytes[i>>>3]|=1<<(i&7);});return bytes;
}
const nominal={code:4,values:[1,0]},generic={code:2,values:[0,1,0,0,4,0]},param=(type=1,overrides={})=>({code:8,values:Object.assign([0,0,type,0,0,0,0,0,0,0,0],overrides)});
const raw=(options)=>recoverSwiftDeclarations(packet(options)).modules[0].decoded_declarations.find(d=>d.name==='shape'||d.name==='shape(argument:)');

test('owned 0.903 function type recovers flags, parameter labels, ownership and nested results',()=>{
 const row=raw({types:[nominal,{code:7,values:[1,0,0,0,1,1,1,0,0,0,1],trailing:[param(1,{0:11,1:12,6:1,10:1})]}],selected:2});
 assert.equal(row.interface_type_reason,null);const f=row.interface_type;
 assert.equal(f.kind,'function');assert.equal(f.is_async,true);assert.equal(f.is_throwing,true);assert.equal(f.is_sendable,true);assert.equal(f.sending_result,true);
 assert.equal(f.parameters[0].label,'argument');assert.equal(f.parameters[0].internal_label,'local');assert.equal(f.parameters[0].specifier,'inout');assert.equal(f.parameters[0].is_sending,true);
 assert.equal(f.result.expression,'OwnedCompletion.Token');assert.match(f.expression,/async throws/);
});

test('owned generic function type resolves its signature index and dependent associated type',()=>{
 const row=raw({types:[nominal,generic,{code:3,values:[2,3]},{code:19,values:[3,0,0,0,0,0,0,0,0,1],trailing:[param(2)]}],signatures:[[0,2]],selected:4});
 assert.equal(row.interface_type_reason,null);const f=row.interface_type;
 assert.equal(f.kind,'generic_function');assert.equal(f.generic_signature.id,1);assert.equal(f.generic_signature.parameters[0].expression,'Element');
 assert.equal(f.result.kind,'dependent_member');assert.equal(f.result.expression,'Element.Item');assert.equal(f.result.associated_type_decl_id,3);
});

test('generic signature conformance requirements remain explicit and bad extents reject',()=>{
 const types=[nominal,generic,{code:4,values:[2,0]},{code:19,values:[1,0,0,0,0,0,0,0,0,1]}];
 for(const version of [871,903,944]){const row=raw({version,types,signatures:[[1,1,2,3,2]],selected:4});assert.equal(row.interface_type_reason,null);const req=row.interface_type.generic_signature.requirements[0];assert.equal(req.kind,'conformance');assert.equal(req.first.expression,'Element');assert.equal(req.second.expression,'OwnedCompletion.Source');}
 for(const values of [[1],[1,4,0],[1,4,99,2,0,0,2],[0,2,2]])assert.throws(()=>raw({types,signatures:[values],selected:4}),error=>error.code==='swift_module_invalid');
});

test('owned metatypes preserve representation, and dynamic Self is not flattened to its nominal',()=>{
 for(const [code,suffix,kind]of [[9,'.Type','metatype'],[28,'.Protocol','existential_metatype']]){
  const row=raw({types:[nominal,{code,values:[1,2]}],selected:2});assert.equal(row.interface_type_reason,null);assert.equal(row.interface_type.kind,kind);assert.equal(row.interface_type.representation,'thick');assert.equal(row.interface_type.expression,'OwnedCompletion.Token'+suffix);
 }
 const row=raw({types:[nominal,{code:27,values:[1]}],selected:2});assert.equal(row.interface_type.kind,'dynamic_self');assert.equal(row.interface_type.expression,'Self');assert.equal(row.interface_type.self_type.expression,'OwnedCompletion.Token');
});

test('owned source-level array and dictionary type sugar keeps nested function precedence',()=>{
 for(const version of [871,903,944]){const row=raw({version,types:[nominal,{code:7,values:[1,0,0,0,0,0,0,0,0,0,0],trailing:[param()]},{code:20,values:[2]},{code:21,values:[1,3]}],selected:4});
  assert.equal(row.interface_type_reason,null);assert.equal(row.interface_type.kind,'dictionary');assert.equal(row.interface_type.value.kind,'array');assert.equal(row.interface_type.value.element.kind,'function');}
});

test('owned callable parameters and default argument facts recover from indexed parameter records',()=>{
 const parameter=[11,12,5,1,1,0,0,0,0,0,0,1,1,0,0];
 const row=raw({callable:true,parameter});assert.equal(row.callable_signature_reason,null);assert.equal(row.callable_signature.parameters.length,1);
 const p=row.callable_signature.parameters[0];assert.equal(p.label,'argument');assert.equal(p.name,'local');assert.equal(p.specifier,'inout');assert.equal(p.type.expression,'OwnedCompletion.Token');assert.equal(p.default_argument.kind,'normal');
});

test('malformed known function type packets reject instead of disguising corrupt bytes as unsupported grammar',()=>{
 const mutations=[
  {code:7,values:[1,0,0,2,0,0,0,0,0,0,0]},
  {code:7,values:[0,0,0,0,0,0,0,0,0,0,0]},
  {code:7,values:[1,9,0,0,0,0,0,0,0,0,0]},
  {code:7,values:[1,0,0,0,0,0,0,0,0,0]},
  {code:7,values:[1,0,0,0,0,0,0,0,0,0,0],trailing:[param(0)]},
  {code:7,values:[1,0,0,0,0,0,0,0,0,0,0],trailing:[param(1,{6:7})]},
  {code:9,values:[1,4]},
  {code:3,values:[1,1]},
  {code:19,values:[1,0,0,0,0,0,0,0,0,99]}
 ];
 for(const type of mutations)assert.throws(()=>raw({types:[nominal,type],selected:2}),error=>error.code==='swift_module_invalid');
});

test('new type recursion and callable parameter ownership stay bounded',()=>{
 assert.throws(()=>raw({types:[{code:7,values:[1,0,0,0,0,0,0,0,0,0,0]}]}),/cycle\/depth/);
 assert.throws(()=>raw({callable:true,parameter:[11,12,1,0,1,0,0,0,0,0,0,0,0,0,0]}),/parameter.*(owner|context)/i);
 assert.throws(()=>raw({types:[nominal,generic,{code:19,values:[1,0,0,0,0,0,0,0,0,1]}],selected:3,signatures:[[0,1]]}),/generic.*parameter/i);
});

test('only qualified serialized minors accept their own finite record dialects',()=>{
 for(const version of [871,903,944]){
  const row=raw({version,types:[nominal,generic,{code:3,values:[2,3]},{code:7,values:[3,0,0,0,0,0,0,0,0,0,0],trailing:[param(2)]}],selected:4});
  assert.equal(row.interface_type_reason,null);assert.equal(row.interface_type.kind,'function');assert.equal(row.interface_type.result.expression,'Element.Item');assert.equal(row.record_code,version===871?45:55);
 }
});

test('unsupported versions and grammars remain explicit without projection or invented signatures',()=>{
 for(const version of [870,872,902,904,943,945]){const result=recoverSwiftDeclarations(packet({version}));assert.deepEqual(result.declarations,[]);assert.deepEqual(result.modules[0].version,{major:0,minor:version});assert.match(result.modules[0].issues[0].reason,/Unsupported/);}
 const row=raw({types:[{code:26,values:[0]}]});assert.equal(row.interface_type,null);assert.match(row.interface_type_reason,/unsupported/);
 const lifetime=raw({types:[nominal,{code:7,values:[1,0,0,0,0,0,0,0,0,0,0],trailing:[{code:158,values:[0,1,0,0]}]}],selected:2});assert.equal(lifetime.interface_type,null);assert.match(lifetime.interface_type_reason,/lifetime/i);
});

test('complex declaration expansion charges output and honors cancellation within traversal',()=>{
 const bytes=packet({types:[nominal,{code:7,values:[1,0,0,0,0,0,0,0,0,0,0],trailing:Array.from({length:32},()=>param())}],selected:2});
 const budget=declarationBudget();budget.limits.output=1000;assert.throws(()=>recoverSwiftDeclarations(bytes,{budget}),error=>error.code==='capacity');
 const controller=new AbortController(),bound=declarationBudget({signal:controller.signal});const work=bound.work.bind(bound);let visits=0;bound.work=()=>{if(++visits===30)controller.abort(new Error('owned mid-type cancellation'));work();};
 assert.throws(()=>recoverSwiftDeclarations(bytes,{signal:controller.signal,budget:bound}),/owned mid-type cancellation/);assert.equal(visits,30);
});

test('bounded output sizing preserves JSON escaping, omitted keys, sparse arrays and primitive semantics',()=>{
 const shared={quote:'"\\\b\f\n\r\t\u0000',unicode:'é雪😀\ud800\udfff'},values=[null,true,false,0,-0,1e30,NaN,Infinity,'𝄞\u2028\ud800',{['é"\\']:shared,missing:undefined,fn(){},symbol:Symbol('owned'),repeated:shared},[undefined,,Symbol('owned'),function(){},shared],new Number(5),new String('owned'),new Boolean(false),new Date('2026-10-16T00:00:00.000Z'),{toJSON(key){return {key,value:'owned'};}}];
 for(const value of values){const budget=declarationBudget();budget.output(value);assert.equal(budget.used.output,Buffer.byteLength(JSON.stringify(value),'utf8'));}
 for(const value of [undefined,1n,Object(1n)])assert.throws(()=>declarationBudget().output(value),TypeError);
 const cycle={};cycle.self=cycle;assert.throws(()=>declarationBudget().output(cycle),TypeError);
 const controller=new AbortController();let visits=0;assert.throws(()=>chargeJsonBytes({['é'.repeat(5000)]:'😀'},()=>{},()=>{if(++visits===8)controller.abort(new Error('owned JSON sizing cancellation'));controller.signal.throwIfAborted();}),/owned JSON sizing cancellation/);assert.equal(visits,8);
});

test('tiny acyclic generic signature DAG rejects at the output limit before exponential JSON expansion',()=>{
 const types=[generic,nominal],signatures=[];for(let i=0;i<18;i++){types.push({code:19,values:[2,0,0,0,0,0,0,0,0,i+1]});const previous=i+2;signatures.push([2,2,1,previous,2,1,previous,1]);}
 const bytes=packet({types,signatures,selected:types.length}),budget=declarationBudget();budget.limits.output=16384;assert.ok(bytes.length<1024);
 assert.throws(()=>recoverSwiftDeclarations(bytes,{budget}),error=>error.code==='capacity'&&error.details.dimension==='output');assert.ok(budget.used.output<=budget.limits.output+6);assert.ok(budget.used.work<100000);
});

test('corrupt complex types fail the selected-artifact operation without publishing evidence',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'reclaimer-completion-invalid-'));
 t.after(async()=>{assert.ok(path.basename(root).startsWith('reclaimer-completion-invalid-'));await fs.rm(root,{recursive:true,force:true});});
 const bytes=swiftDeclarationImage([packet({types:[{code:7,values:[0,0,0,0,0,0,0,0,0,0,0]}]})]),file=path.join(root,'invalid-function.o');await fs.writeFile(file,bytes,{flag:'wx'});
 const ctx=await engine();await ctx.call('open_binary',{path:file});try{const prior={ledger:ctx.ledger.size,history:ctx.history.length};await assert.rejects(()=>ctx.call('inspect_native_dispatch_metadata',{}),error=>error.code==='swift_module_invalid');assert.deepEqual({ledger:ctx.ledger.size,history:ctx.history.length},prior);assert.equal(digest(await fs.readFile(file)),digest(bytes));}finally{await ctx.call('close_binary',{});}
});

