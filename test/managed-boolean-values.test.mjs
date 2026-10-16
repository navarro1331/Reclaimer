import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {Context,digest} from '../lib/core.mjs';
import {handlers} from '../lib/artifacts.mjs';
import {managedBooleanFixture,i32,serString,named} from './managed-boolean-fixtures.mjs';

const project=fileURLToPath(new URL('../',import.meta.url)),script=fileURLToPath(new URL('../scripts/real.mjs',import.meta.url));
async function prepare(t,fixture){
 const base=await realpath(tmpdir()),root=await mkdtemp(join(base,'reclaimer-owned-boolean-')),file=join(root,'owned.dll');
 t.after(async()=>{assert.equal(dirname(root),base);assert.ok(basename(root).startsWith('reclaimer-owned-boolean-'));await rm(root,{recursive:true,force:true});await assert.rejects(realpath(root),{code:'ENOENT'});});
 await writeFile(file,fixture.bytes,{flag:'wx'});const ctx=new Context();ctx.handlers={...handlers};return {root,file,ctx};
}
async function inspect(t,options){
 const fixture=managedBooleanFixture(options),state=await prepare(t,fixture),envelope=await state.ctx.call('inspect_managed_artifact',{path:state.file});
 assert.equal(envelope.subject.digest.sha256,digest(fixture.bytes));assert.equal(envelope.normalized_result.artifact.sha256,digest(fixture.bytes));assert.equal(envelope.normalized_result.attributes[0].value_sha256,digest(fixture.attribute));
 assert.equal(envelope.normalized_result.attributes[0].type_name,'Owned.BooleanAttribute');assert.equal(state.ctx.ledger.size,1);assert.deepEqual(state.ctx.ledger.get(envelope.evidence_id),envelope);assert.deepEqual(await readFile(state.file),fixture.bytes);
 const detail=envelope.raw_result.decoded_custom_attribute_values[0];assert.equal(detail.value_hex,fixture.attribute.toString('hex'));return {...state,fixture,envelope,detail};
}

test('managed fixed Boolean attribute values retain false and true JSON primitives',async t=>{
 const {detail}=await inspect(t);assert.equal(detail.issue,null);assert.deepEqual(detail.decoded.fixed,[false,true]);assert.deepEqual(JSON.parse(JSON.stringify(detail.decoded)).fixed,[false,true]);
});
test('managed named Boolean fields and properties retain both primitive values',async t=>{
 const entries=[named(0x53,[2],'Disabled',[0]),named(0x54,[2],'Enabled',[1])],{detail}=await inspect(t,{types:[],fixed:[],named:entries});
 assert.equal(detail.issue,null);assert.deepEqual(detail.decoded.named,[{kind:'field',type:'bool',name:'Disabled',value:false},{kind:'property',type:'bool',name:'Enabled',value:true}]);
});
test('managed boxed Boolean fixed and named values retain their type and value',async t=>{
 const {detail}=await inspect(t,{types:[[28],[28]],fixed:[2,0,2,1],named:[named(0x54,[0x51],'BoxedFalse',[2,0]),named(0x53,[0x51],'BoxedTrue',[2,1])]});
 assert.equal(detail.issue,null);assert.deepEqual(detail.decoded.fixed,[{type:'bool',value:false},{type:'bool',value:true}]);assert.deepEqual(detail.decoded.named.map(row=>row.value),[{type:'bool',value:false},{type:'bool',value:true}]);
});
test('managed Boolean vectors preserve element values and distinguish empty and null arrays',async t=>{
 const vector=Buffer.concat([i32(2),Buffer.from([0,1])]),{detail}=await inspect(t,{types:[[29,2],[29,2],[29,2],[28]],fixed:Buffer.concat([vector,i32(0),i32(-1),Buffer.from([29,2]),vector]),named:[named(0x54,[29,2],'Flags',vector)]});
 assert.equal(detail.issue,null);assert.deepEqual(detail.decoded.fixed,[[false,true],[],null,{type:{kind:'array',element:'bool'},value:[false,true]}]);assert.deepEqual(detail.decoded.named[0].value,[false,true]);
});
test('managed invalid Boolean bytes remain explicit issues across fixed named boxed and vector values',async t=>{
 for(const bad of [2,255])for(const options of [{types:[[2]],fixed:[bad]},{types:[],fixed:[],named:[named(0x53,[2],'Invalid',[bad])]},{types:[[28]],fixed:[2,bad]},{types:[[29,2]],fixed:Buffer.concat([i32(2),Buffer.from([0,bad])])}]){
  const {detail,envelope}=await inspect(t,options);assert.equal(detail.decoded,null);assert.equal(detail.issue,'Invalid serialized attribute bool');assert.equal(envelope.normalized_result.coverage.state,'partial');assert.equal(envelope.normalized_result.coverage.issues[0].code,'invalid-blob');
 }
});
test('managed scalar controls keep finite numbers strings signed zero bigint and nonfinite encodings',async t=>{
 const long=Buffer.alloc(8),ulong=Buffer.alloc(8),float=Buffer.alloc(4),negativeZero=Buffer.alloc(8),infinity=Buffer.alloc(4),negativeInfinity=Buffer.alloc(8),nan=Buffer.alloc(8);long.writeBigInt64LE(-9007199254740993n);ulong.writeBigUInt64LE(18446744073709551615n);float.writeFloatLE(1.5);negativeZero.writeDoubleLE(-0);infinity.writeFloatLE(Infinity);negativeInfinity.writeDoubleLE(-Infinity);nan.writeDoubleLE(NaN);
 const types=[[8],[10],[11],[12],[13],[12],[13],[13],[14]],fixed=Buffer.concat([i32(-123),long,ulong,float,negativeZero,infinity,negativeInfinity,nan,serString('false')]),{detail}=await inspect(t,{types,fixed});
 assert.equal(detail.issue,null);assert.deepEqual(detail.decoded.fixed,[-123,'-9007199254740993','18446744073709551615',1.5,-0,'Infinity','-Infinity','NaN','false']);assert.ok(Object.is(detail.decoded.fixed[4],-0));
});
test('stock CLI serializes owned Boolean attribute values as JSON booleans', {timeout:45000},async t=>{
 const fixture=managedBooleanFixture(),{root,file}=await prepare(t,fixture),config=join(root,'config.json');await writeFile(config,'{}',{flag:'wx'});const env={...process.env,REAL_CONFIG:config};delete env.NODE_OPTIONS;
 const {stdout,stderr}=await promisify(execFile)(process.execPath,[script,'inspect-managed-artifact',file,'--format','json'],{cwd:project,env,shell:false,windowsHide:true,timeout:30000,maxBuffer:4*1024*1024});assert.equal(stderr,'');const envelope=JSON.parse(stdout);assert.deepEqual(envelope.raw_result.decoded_custom_attribute_values[0].decoded.fixed,[false,true]);assert.equal(envelope.subject.digest.sha256,digest(fixture.bytes));assert.deepEqual(await readFile(file),fixture.bytes);
});
test('official MCP stdio transport retains owned Boolean JSON types without SDK notices',{timeout:45000},async t=>{
 const fixture=managedBooleanFixture(),{root,file}=await prepare(t,fixture),config=join(root,'config.json');await writeFile(config,'{}',{flag:'wx'});const env={...process.env,REAL_CONFIG:config};delete env.NODE_OPTIONS;
 const client=new Client({name:'owned-managed-boolean',version:'1'}),transport=new StdioClientTransport({command:process.execPath,args:[script,'mcp'],cwd:project,env,stderr:'pipe'}),notices=[];let stderr='';client.onerror=error=>notices.push(error.message);transport.stderr?.on('data',bytes=>{stderr+=bytes.toString();});
 try{await client.connect(transport,{timeout:15000});const response=await client.callTool({name:'inspect_managed_artifact',arguments:{path:file}},{timeout:15000});assert.notEqual(response.isError,true);const envelope=response.structuredContent;assert.deepEqual(envelope.raw_result.decoded_custom_attribute_values[0].decoded.fixed,[false,true]);assert.deepEqual(JSON.parse(response.content.find(row=>row.type==='text').text),envelope);assert.equal(envelope.subject.digest.sha256,digest(fixture.bytes));assert.deepEqual(await readFile(file),fixture.bytes);}
 finally{await client.close();await transport.close();}assert.equal(stderr,'');assert.deepEqual(notices,[]);
});
