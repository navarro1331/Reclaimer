import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { api } from '../lib/contracts.mjs';
import cliContracts from '../lib/cli-contracts.json' with {type:'json'};
const root=fileURLToPath(new URL('../',import.meta.url));
test('official MCP client negotiates the protocol, catalogs, prompt arguments, and errors',async()=>{
 const client=new Client({name:'independent-compatibility-test',version:'1'});
 const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../scripts/real.mjs',import.meta.url)),'mcp'],cwd:root,stderr:'pipe'});
 try{
  await client.connect(transport);
  const catalog=await client.listTools();assert.equal(catalog.tools.length,139);
  assert.deepEqual(catalog.tools.map(t=>t.name),api.tools.map(t=>t.name));
  for(const tool of catalog.tools){const expected=api.tools.find(t=>t.name===tool.name);assert.deepEqual(tool.inputSchema,expected.inputSchema);assert.deepEqual(tool.outputSchema,expected.outputSchema);}
  assert.equal((await client.listPrompts()).prompts.length,6);
  const prompt=api.prompts[0],args=Object.fromEntries(prompt.arguments.filter(a=>a.required).map(a=>[a.name,'Synthetic requirement']));
  assert.match((await client.getPrompt({name:prompt.name,arguments:args})).messages[0].content.text,/Synthetic requirement/);
  const session=await client.callTool({name:'binary_session',arguments:{}});assert.equal(session.structuredContent.result.open,false);
  const failure=await client.callTool({name:'open_binary',arguments:{path:'Z:\\missing-synthetic-file.exe'}});assert.equal(failure.isError,true);
  assert.equal(failure.structuredContent.error.code,'target_unavailable');assert.equal(failure.structuredContent.error.category,'unavailable');assert.equal(typeof failure.structuredContent.error.remediation.action,'string');
 }finally{await client.close();await transport.close();}
});
test('CLI discovery retains command names and emits machine-readable JSON',async()=>{
 const execute=promisify(execFile),script=fileURLToPath(new URL('../scripts/real.mjs',import.meta.url));
 const manifest=JSON.parse((await execute(process.execPath,[script,'--llms-full','--format','json'],{cwd:root,shell:false,maxBuffer:16*1024*1024})).stdout);
 assert.equal(manifest.commands.length,95);
 for(const expected of cliContracts.commands){const current=manifest.commands.find(c=>c.name===expected.name);assert.ok(current);for(const field of ['args','options'])assert.deepEqual(Object.keys(current.schema?.[field]?.properties??{}).sort(),Object.keys(expected.schema?.[field]?.properties??{}).sort());}
 const version=(await execute(process.execPath,[script,'--version'],{cwd:root,shell:false})).stdout.trim();assert.equal(version,'0.2.0');
 const doctor=JSON.parse((await execute(process.execPath,[script,'doctor','--format','json'],{cwd:root,shell:false})).stdout);assert.equal(doctor.checks[0].status,'pass');
});
