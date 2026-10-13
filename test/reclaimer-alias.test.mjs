import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {api} from '../lib/contracts.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),execute=promisify(execFile);

test('Reclaimer executable preserves legacy CLI schemas and frozen contract bytes',async()=>{
  const catalogs=[];
  for(const entry of ['real','reclaimer'])catalogs.push(JSON.parse((await execute(process.execPath,[`scripts/${entry}.mjs`,'--llms-full','--format','json'],{cwd:root,shell:false,maxBuffer:16*1024*1024})).stdout));
  assert.equal(catalogs[0].commands.length,95);assert.equal(catalogs[1].commands.length,95);
  assert.deepEqual(catalogs[1].commands.map(c=>({name:c.name,schema:c.schema})),catalogs[0].commands.map(c=>({name:c.name,schema:c.schema})));
  for(const [file,expected]of [['api-contracts.json','66f7c612d12b0771095b3717c193669b86eed3f242f6bdfe4594384c5fc89f29'],['cli-contracts.json','ca942e7ad48933c827a2f6b1f07cc4e23fc531c366c41a1535f8a5642dec1909']])assert.equal(createHash('sha256').update(await readFile(new URL('../lib/'+file,import.meta.url))).digest('hex'),expected);
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));assert.equal(pkg.name,'reclaimer');assert.equal(pkg.bin.real,'scripts/real.mjs');assert.equal(pkg.bin.reclaimer,'scripts/reclaimer.mjs');assert.equal(pkg.repository.url,'https://github.com/navarro1331/Reclaimer.git');
});

test('Reclaimer MCP alias negotiates unchanged tools, prompts and legacy wire identity',async()=>{
  const client=new Client({name:'owned-reclaimer-alias-proof',version:'1'}),transport=new StdioClientTransport({command:process.execPath,args:['scripts/reclaimer.mjs','mcp'],cwd:root,stderr:'pipe'});
  try{
    await client.connect(transport);assert.equal(client.getServerVersion().name,'real');
    const catalog=await client.listTools();assert.equal(catalog.tools.length,139);
    for(const tool of catalog.tools){const expected=api.tools.find(t=>t.name===tool.name);assert.ok(expected);assert.deepEqual(tool.inputSchema,expected.inputSchema);assert.deepEqual(tool.outputSchema,expected.outputSchema);}
    assert.equal((await client.listPrompts()).prompts.length,6);
    const result=await client.callTool({name:'binary_session',arguments:{}});assert.equal(result.structuredContent.result.open,false);
    const failed=await client.callTool({name:'open_binary',arguments:{path:'Z:\\missing-owned-reclaimer-artifact.exe'}});assert.equal(failed.isError,true);assert.equal(failed.structuredContent.error.code,'target_unavailable');
  }finally{await client.close();await transport.close();}
});
