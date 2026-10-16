import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {Context,digest} from '../lib/core.mjs';

export const extensionProgram=`// Independently authored static producer input. The target is never executed.
using System;
namespace Reclaimer.Owned.Extension;
public sealed class Duo<First, Second> {
 public First Left = default!;
 public readonly Second Right = default!;
 public First Echo(First value, Second other) => value;
 public Result Project<Result>(Result value) => value;
}
public sealed class Ledger {
 public readonly int Immutable = 41;
 public int Mutable = 17;
 public static int Global = 29;
 public static string Label = "owned-extension";
}
public static class Proof {
 public static void Main() {
  foreach(var f in typeof(Ledger).GetFields()) Console.WriteLine(f.Name);
  foreach(var f in typeof(Duo<,>).GetFields()) Console.WriteLine(f.Name);
  foreach(var m in typeof(Duo<,>).GetMethods()) Console.WriteLine(m.Name);
  foreach(var f in typeof(Duo<int,long>).GetFields()) Console.WriteLine(f.Name);
  foreach(var m in typeof(Duo<int,long>).GetMethods()) Console.WriteLine(m.Name);
  Console.WriteLine(typeof(Duo<int,long>).FullName);
  var duo = new Duo<int,long>();
  Console.WriteLine(duo.Echo(Environment.TickCount, 7));
  Console.WriteLine(duo.Project<short>(13));
 }
}
`;

export async function buildAotExtension({signal}={}){
 const evidence=path.resolve(process.env.RECLAIMER_EXTENSION_EVIDENCE??path.join(os.tmpdir(),'reclaimer-owned-extension-evidence')),base=await fs.realpath(os.tmpdir()),root=await fs.mkdtemp(path.join(base,'reclaimer-aot-extension-')),profile=path.join(root,'profile'),cache=path.join(root,'packages'),input=path.join(root,'input'),output=path.join(root,'published');
 const receipt={run_id:path.basename(root),sdk:'8.0.425',compiler:'Microsoft.DotNet.ILCompiler8.0.31',runtime:'win-x64',target_execution:'not-performed',sources:[],commands:[],logs:[],success:false};await fs.mkdir(evidence,{recursive:true});
 try{
  await fs.mkdir(profile);await fs.mkdir(input);const packages=path.join(path.resolve(process.env.REAL_TEST_EVIDENCE_ROOT??path.join(import.meta.dirname,'provider-fixtures')),'parity-20261013/owned-aot/packages');await fs.symlink(await fs.realpath(packages),cache,'junction');
  const projectText='<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework><PublishAot>true</PublishAot><Nullable>enable</Nullable><AssemblyName>Reclaimer.Extension.Proof</AssemblyName></PropertyGroup></Project>\n';
  for(const [name,source]of [['Program.cs',extensionProgram],['ExtensionProof.csproj',projectText]]){const bytes=Buffer.from(source),retained=path.join(evidence,receipt.run_id+'-'+name);await fs.writeFile(path.join(input,name),bytes,{flag:'wx'});await fs.writeFile(retained,bytes,{flag:'wx'});receipt.sources.push({name,sha256:digest(bytes),retained_path:retained});}
  await fs.writeFile(path.join(root,'global.json'),JSON.stringify({sdk:{version:'8.0.425',rollForward:'disable'}}));await fs.writeFile(path.join(root,'nuget.config'),'<configuration><packageSources><clear/></packageSources></configuration>');
  const env={PATH:process.env.PATH??'',SystemRoot:process.env.SystemRoot??'',OS:'Windows_NT',ProgramFiles:process.env.ProgramFiles??'C:/Program Files','ProgramFiles(x86)':process.env['ProgramFiles(x86)']??'C:/Program Files (x86)',ProgramData:profile,TEMP:root,TMP:root,USERPROFILE:profile,APPDATA:profile,LOCALAPPDATA:profile,DOTNET_CLI_HOME:profile,DOTNET_GENERATE_ASPNET_CERTIFICATE:'false',DOTNET_ADD_GLOBAL_TOOLS_TO_PATH:'false',DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_SKIP_FIRST_TIME_EXPERIENCE:'1',DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE:'true',NUGET_PACKAGES:cache,NUGET_HTTP_CACHE_PATH:path.join(root,'http-cache'),NUGET_PLUGINS_CACHE_PATH:path.join(root,'plugin-cache')};
  const dotnet=path.resolve(process.env.REAL_TEST_DOTNET??path.join(process.env.ProgramFiles??'C:/Program Files','dotnet/dotnet.exe')),msbuild=path.join(path.dirname(dotnet),'sdk/8.0.425/MSBuild.dll'),project=path.join(input,'ExtensionProof.csproj'),common=[`-p:BaseIntermediateOutputPath=${path.join(root,'obj')}/`,`-p:BaseOutputPath=${path.join(root,'bin')}/`,`-p:RestoreConfigFile=${path.join(root,'nuget.config')}`,'-p:RuntimeIdentifier=win-x64','-p:NuGetAudit=false','-p:UseSharedCompilation=false','-nodeReuse:false','-maxCpuCount:1'],ctx=new Context({signal});
  for(const [index,argv]of [[dotnet,'exec',msbuild,project,'-target:Restore',...common],[dotnet,'exec',msbuild,project,'-target:Publish','-p:Configuration=Release','-p:SelfContained=true',`-p:PublishDir=${output}/`,...common]].entries()){signal?.throwIfAborted();receipt.commands.push(argv);const result=await ctx.run(argv,{cwd:root,timeout:120000,maxBytes:4*1024*1024,env}),log=path.join(evidence,receipt.run_id+'-'+index+'.log');await fs.writeFile(log,result.stdout+result.stderr,{flag:'wx'});receipt.logs.push(log);}
  const bytes=await fs.readFile(path.join(output,'Reclaimer.Extension.Proof.exe'));receipt.artifact_sha256=digest(bytes);receipt.artifact_bytes=bytes.length;receipt.retained_target=path.join(evidence,receipt.run_id+'-'+receipt.artifact_sha256+'.exe');await fs.writeFile(receipt.retained_target,bytes,{flag:'wx'});for(const source of receipt.sources)assert.equal(digest(await fs.readFile(path.join(input,source.name))),source.sha256);receipt.source_preserved=true;receipt.success=true;return receipt;
 }catch(error){receipt.failure={name:error.name,message:error.message};throw error;}
 finally{try{try{await fs.unlink(cache);}catch(error){if(error.code!=='ENOENT')throw error;}const resolved=await fs.realpath(root);assert.equal(path.dirname(resolved),base);assert.ok(path.basename(resolved).startsWith('reclaimer-aot-extension-'));await fs.rm(resolved,{recursive:true,force:true});receipt.cleanup={complete:true};}catch(error){receipt.cleanup={complete:false,owned_root:root,message:error.message};throw error;}finally{receipt.receipt_path=path.join(evidence,receipt.run_id+'-build-receipt.json');await fs.writeFile(receipt.receipt_path,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});}}
}
