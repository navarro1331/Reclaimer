import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport,DEFAULT_INHERITED_ENV_VARS} from '@modelcontextprotocol/client/stdio';
import {validate} from '../lib/contracts.mjs';

export const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const execute=promisify(execFile);
function deadline(work,milliseconds,message){let timer;return Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),milliseconds);})]).finally(()=>clearTimeout(timer));}
export async function recoveryWorkspace(t,label){
 const base=await realpath(tmpdir()),directory=await mkdtemp(join(base,'reclaimer-identities-'+label+'-')),clients=new Set(),closedPids=[];
 const configuration=join(directory,'fixture-config.json');await writeFile(configuration,JSON.stringify({temporaryDirectory:directory}));
 const env=Object.fromEntries(DEFAULT_INHERITED_ENV_VARS.map(name=>[name,'']));
 Object.assign(env,{HOME:directory,USERPROFILE:directory,APPDATA:directory,LOCALAPPDATA:directory,TEMP:directory,TMP:directory,XDG_CONFIG_HOME:directory,XDG_CACHE_HOME:directory,PATH:'',REAL_CONFIG:configuration});
 if(process.platform==='win32'){env.SystemRoot=process.env.SystemRoot??'C:\\Windows';env.SYSTEMROOT=env.SystemRoot;env.WINDIR=env.SystemRoot;}
 const workspace={directory,env,clients,closedPids};
 t.after(async()=>{
  for(const client of clients)await client.close();
  const actual=await realpath(directory),rel=relative(base,actual);assert.ok(rel&&!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep));assert.ok(rel.startsWith('reclaimer-identities-'+label+'-'));
  assert.equal(clients.size,0,'Every owned MCP client must physically close before workspace cleanup');
  await rm(actual,{recursive:true,force:true});t.diagnostic(JSON.stringify({owned_workspace:label,mcp_children_closed:closedPids.length,cleanup:'completed',descendant_scope:'not-collected'}));
 });
 return workspace;
}
export async function ownedMcp(workspace){
 const client=new Client({name:'owned-recovery-identities',version:'1'}),transport=new StdioClientTransport({command:process.execPath,args:[join(projectRoot,'scripts','reclaimer.mjs'),'mcp'],cwd:workspace.directory,env:workspace.env,stderr:'pipe',maxBufferSize:4*1024*1024});
 let physicalExit,started=false,pid=null,closePromise,stderr='';const exited=new Promise(resolve=>{physicalExit=resolve;});
 const originalStart=transport.start.bind(transport);
 transport.start=async()=>{await originalStart();started=true;pid=transport.pid;const originalClose=transport.onclose;transport.onclose=()=>{physicalExit();originalClose?.();};transport.stderr?.on('data',chunk=>{stderr=(stderr+chunk).slice(-8192);});};
 const session={client,transport,get pid(){return pid;},call:async(name,args={})=>{
  const response=await client.callTool({name,arguments:args},{timeout:60000});assert.notEqual(response.isError,true,'Owned MCP operation failed: '+JSON.stringify(response.structuredContent));
  const output=response.structuredContent,checked=validate(name,'output',output);assert.equal(checked.valid,true,'Actual MCP output must satisfy '+name+': '+JSON.stringify(checked.errors));return output;
 },expectError:async(name,args,code)=>{
  const response=await client.callTool({name,arguments:args},{timeout:60000});assert.equal(response.isError,true,'Expected actual MCP failure for '+name);assert.equal(typeof response.structuredContent.error.code,'string');if(code!==undefined)assert.equal(response.structuredContent.error.code,code);return response.structuredContent.error;
 },close:()=>closePromise??=(async()=>{
  await deadline(client.close(),15000,'Owned MCP client close exceeded its fixture deadline');await deadline(transport.close(),15000,'Owned MCP transport close exceeded its fixture deadline');
  if(started)await deadline(exited,60000,'Owned MCP physical close was not confirmed; workspace retained');
  workspace.clients.delete(session);if(pid!==null)workspace.closedPids.push(pid);
 })()};
 workspace.clients.add(session);
 try{await deadline(client.connect(transport),60000,'Owned MCP startup exceeded its fixture deadline');assert.ok(Number.isInteger(pid)&&pid>0);return session;}
 catch(error){error.message+=' (bounded stderr bytes '+Buffer.byteLength(stderr)+')';await session.close();throw error;}
}
export async function ownedCli(workspace,command,path,options=[]){
 const result=await execute(process.execPath,[join(projectRoot,'scripts','reclaimer.mjs'),command,path,...options,'--format','json'],{cwd:workspace.directory,env:workspace.env,shell:false,windowsHide:true,timeout:90000,maxBuffer:4*1024*1024});
 assert.equal(result.stderr,'');return JSON.parse(result.stdout);
}
export async function sourceBytes(path,expected){const bytes=await readFile(path);assert.deepEqual(bytes,expected,'Selected owned source must remain unchanged');return bytes;}
