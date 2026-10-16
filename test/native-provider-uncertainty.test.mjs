import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {engine} from '../lib/engine.mjs';
import {elfFixture} from './artifact-fixtures.mjs';
const value=out=>out.normalized_result??out.result;
test('owned Hopper model preserves unknown classification while retaining observed call membership',async t=>{
 const root=await fs.mkdtemp(path.join(fileURLToPath(new URL('.',import.meta.url)),'hopper-uncertainty-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const file=path.join(root,'owned.elf');await fs.writeFile(file,elfFixture());const c=await engine({config:{}});await c.call('open_binary',{path:file,provider_id:'hopper'});t.after(()=>c.call('close_binary',{}));
 const fn=(address,name)=>({address,name,ranges:[{start:address,end:'0x'+(BigInt(address)+16n).toString(16)}],total_bytes:16,classification_available:false,signature:null,locals:[],basic_blocks:[],pseudocode:null});
 c.nativeSession.model={protocol:'real-native-model-v1',provider:'hopper',provider_version:'owned-fake-provider',functions:[fn('0x100','main'),fn('0x200','helper')],segments:[{name:'owned',start:'0x100',end:'0x210',read:true,write:false,execute:true}],symbols:[],instructions:[],strings:[],references:[{source:'0x101',target:'0x200',call:true,type:'hopper-call:owned'}],image_base:null,limitations:['Owned public provider fixture; Hopper was not launched']};
 const info=value(await c.call('procedure_info',{procedure:'main'}));assert.equal(info.classification,null);
 const refs=value(await c.call('procedure_references',{procedure:'main',direction:'outgoing'}));assert.equal(refs.reference_kinds_available,false);assert.equal(refs.references[0].kind.available,false);assert.match(refs.references[0].kind.reason,/full flow/);
 assert.deepEqual(value(await c.call('procedure_callees',{procedure:'main'})),['0x200']);await assert.rejects(c.call('list_segments',{}),/did not report an image base/);assert.equal((await c.call('binary_overview',{})).normalized_result.segment_count,1);
});
