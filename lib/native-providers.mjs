import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { digest } from './artifact-binary.mjs';
import { parseDosImage } from './native-dos.mjs';

const bridgeRoot=fileURLToPath(new URL('../bridge/independent/',import.meta.url));
function argv(config,field,env){const v=config?.[field]??(process.env[env]?JSON.parse(process.env[env]):null);if(v!==null&&(!Array.isArray(v)||!v.length||v.some(x=>typeof x!=='string'||!x||x.includes('\0'))))throw new Error(`${field} must be a nonempty argv array`);return v;}
export async function nativeModel(ctx) {
  if(ctx.nativeSession?.model){if(digest(await ctx.read(ctx.target.path))!==ctx.target.sha256)throw new Error('Source artifact changed since native model analysis');return ctx.nativeSession.model;}
  const id=ctx.target?.provider_id??'ghidra',session=ctx.nativeSession;if(!session||!ctx.target)ctx.unavailable('native_provider','No binary session is open','Call open_binary');
  const root=await fs.mkdtemp(path.join(ctx.config?.temporaryRoot??os.tmpdir(),'real-native-'));session.ownedRoots.push(root);
  try {
  for(const name of ['home','appdata','localappdata'])await fs.mkdir(path.join(root,name),{mode:0o700});
  const artifact=path.join(root,'source-'+path.basename(ctx.target.path)),output=path.join(root,'model.json');await fs.writeFile(artifact,await ctx.read(ctx.target.path),{flag:'wx',mode:0o600});
  if(id==='ghidra'){
    const base=argv(ctx.config,'ghidraArgv','REAL_GHIDRA_ARGV');if(!base)ctx.unavailable('native_provider','Ghidra headless JVM argv is not configured','Set config.ghidraArgv or REAL_GHIDRA_ARGV to the existing analyzeHeadless executable argv; on Windows use the Java launcher argv, not a .bat shell');
    const launch=/^java(?:\.exe)?$/i.test(path.basename(base[0]))?[base[0],`-Duser.home=${path.join(root,'home')}`,...base.slice(1).filter(v=>!v.startsWith('-Duser.home='))]:base;
    if(['dos-mz','dos-com'].includes(ctx.target.format))parseDosImage(await ctx.read(artifact),ctx.target.format);
    const project=path.join(root,'project');await fs.mkdir(project,{mode:0o700});const loader=ctx.target.format==='dos-com'?['-loader','BinaryLoader','-processor','x86:LE:16:Real Mode','-cspec','default','-loader-baseAddr','0x100','-preScript','RealComEntry.java']:[];await ctx.run([...launch,project,'independent','-import',artifact,...loader,'-scriptPath',bridgeRoot,'-postScript','RealExport.java',output,artifact,'-deleteProject','-analysisTimeoutPerFile','120','-max-cpu','1'],{cwd:root,timeout:180000,env:providerEnv(ctx)});
  }else if(id==='hopper'){
    if(process.platform!=='darwin')ctx.unavailable('native_provider','Hopper CLI bridge requires macOS and an installed licensed Hopper','Run on an operator-configured macOS host');const base=argv(ctx.config,'hopperArgv','REAL_HOPPER_ARGV');if(!base)ctx.unavailable('native_provider','Hopper executable argv is not configured','Set config.hopperArgv to the installed Hopper executable argv');const script=path.join(root,'export.py');const src=await fs.readFile(path.join(bridgeRoot,'hopper-export.py'),'utf8');await fs.writeFile(script,`REAL_OUTPUT = ${JSON.stringify(output)}\n${src}`,{flag:'wx',mode:0o600});await ctx.run([...base,'-e',artifact,'-s',script],{cwd:root,timeout:180000,env:providerEnv(ctx)});
  }else if(id==='ida'||id==='ida-mcp'){
    const endpoint=ctx.config?.idaMcpUrl??process.env.REAL_IDA_MCP_URL;if(!endpoint)ctx.unavailable('native_provider','Operator-supplied IDA MCP endpoint is not configured','Set config.idaMcpUrl to the existing local IDA MCP transport endpoint');const u=new URL(endpoint);if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname))throw new Error('IDA MCP adapter currently accepts loopback endpoints only');const operations=ctx.config?.idaMcpTools??{};if(!operations.exportModel)ctx.unavailable('native_provider','IDA MCP export tool mapping is not configured','Configure idaMcpTools.exportModel with the existing server tool that returns function/instruction/reference metadata');const response=await fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:operations.exportModel,arguments:{path:artifact}}}),signal:AbortSignal.any([AbortSignal.timeout(180000),...(ctx.signal?[ctx.signal]:[])])});if(!response.ok)throw new Error(`IDA MCP HTTP ${response.status}`);const result=await response.json();if(result.error)throw new Error(`IDA MCP rejected model export: ${result.error.message}`);const model=result.result?.structuredContent??JSON.parse(result.result?.content?.find(x=>x.type==='text')?.text??'null');await fs.writeFile(output,JSON.stringify(model),{flag:'wx',mode:0o600});
  }else{
    const base=argv(ctx.config,'nativeProviderArgv','REAL_NATIVE_PROVIDER_ARGV');if(!base)ctx.unavailable('native_provider',`Native provider ${id} is not configured`,'Configure nativeProviderArgv for an explicit independent JSON model adapter');const request=path.join(root,'request.json');await fs.writeFile(request,JSON.stringify({protocol:'real-native-model-v1',artifact,source_sha256:ctx.target.sha256}),{flag:'wx',mode:0o600});await ctx.run([...base,'--request',request,'--response',output],{cwd:root,timeout:180000,env:providerEnv(ctx)});
  }
  const info=await fs.lstat(output);if(!info.isFile()||info.isSymbolicLink()||info.size>128*1024*1024)throw new Error('Native model output is not a bounded regular file');const model=JSON.parse(await fs.readFile(output,'utf8'));if(model.protocol!=='real-native-model-v1'||!Array.isArray(model.functions)||!Array.isArray(model.instructions)||!Array.isArray(model.symbols)||!Array.isArray(model.references)||!Array.isArray(model.segments))throw new Error('Native model adapter response is malformed');if(model.source_sha256&&model.source_sha256!==ctx.target.sha256)throw new Error('Native model source digest does not match selected target');if(digest(await ctx.read(ctx.target.path))!==ctx.target.sha256)throw new Error('Source artifact changed during native analysis');session.model=model;return model;
  } catch(error){await fs.rm(root,{recursive:true,force:true});session.ownedRoots=session.ownedRoots.filter(p=>p!==root);throw error;}
}
function providerEnv(ctx){const root=ctx.nativeSession?.ownedRoots?.at(-1)??'';return{PATH:process.env.PATH??'',SystemRoot:process.env.SystemRoot??'',TEMP:root,TMP:root,JAVA_HOME:ctx.config?.javaHome??process.env.JAVA_HOME??'',HOME:path.join(root,'home'),USERPROFILE:path.join(root,'home'),APPDATA:path.join(root,'appdata'),LOCALAPPDATA:path.join(root,'localappdata'),...(ctx.config?.nativeProviderEnv??{})};}
export const providerCapabilities={ghidra:{route:'owned-project-headless-java',prerequisites:['installed Ghidra and compatible JDK','explicit ghidraArgv'],liveValidated:true,validationScope:{ghidra:'12.1.4',jdk:'25.0.4.1+1',artifact:'one independently authored x86_64 return42 ELF',sha256:'029995b0537a4a7f175731412994e737a2259f91d5a7b96217f4cc35eccb982c',operations:['open_binary','binary_overview','procedure_pseudo_code','procedure_assembly','analyze_function','inspect_native_api','trace_native_values','read_bytes'],sourcePreserved:true}},hopper:{route:'official-python-script',prerequisites:['macOS','installed licensed Hopper','explicit hopperArgv'],liveValidated:false},ida:{route:'operator-supplied-loopback-mcp',prerequisites:['running IDA MCP server','explicit endpoint and export tool mapping'],liveValidated:false}};
export async function availability(ctx){
  const candidates=[];
  for(const [id,meta]of Object.entries(providerCapabilities)){let configured=false,reason;
    if(id==='ghidra'){const a=argv(ctx.config,'ghidraArgv','REAL_GHIDRA_ARGV');configured=!!a;reason=configured?'Executable presence has not established successful analysis':'No ghidraArgv configured';}
    else if(id==='hopper'){configured=process.platform==='darwin'&&!!argv(ctx.config,'hopperArgv','REAL_HOPPER_ARGV');reason=process.platform==='darwin'?'Hopper argv required':'Hopper route requires macOS';}
    else{configured=!!(ctx.config?.idaMcpUrl??process.env.REAL_IDA_MCP_URL)&&!!ctx.config?.idaMcpTools?.exportModel;reason='IDA MCP endpoint and operator tool mapping required';}
    candidates.push({id,configured,available:configured,status:configured?'configured-unverified':'prerequisite-unavailable',reason,...meta});
  }
  return candidates;
}
