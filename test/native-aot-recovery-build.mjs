import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Context } from '../lib/core.mjs';
import { digest, hex, parsePe } from '../lib/artifact-binary.mjs';
import { recoverNativeAotDetailed } from '../lib/native-aot.mjs';

export const recoveryEvidenceRoot=path.join(path.resolve(process.env.RECLAIMER_RECOVERY_EVIDENCE??path.join(import.meta.dirname,'../.cache/recovery')),'owned-aot-recovery');
const evidenceRoot=path.resolve(process.env.REAL_TEST_EVIDENCE_ROOT??path.join(import.meta.dirname,'provider-fixtures'));
const packageRoot=path.join(evidenceRoot,'parity-20261013/owned-aot/packages');
const sourceRoot=path.resolve(import.meta.dirname,'fixtures/native-aot-recovery');
export function recoveryPeModel(bytes) {
  const parsed=parsePe(bytes);
  return {architecture:parsed.architecture,model:{symbols:[],functions:[],segments:parsed.sections.map(section=>({name:section.name,start:hex(parsed.image_base+BigInt(section.rva)),end:hex(parsed.image_base+BigInt(section.rva+section.virtual_size)),file_offset:section.file_offset,file_size:section.file_size,read:!!(section.characteristics&0x40000000),write:!!(section.characteristics&0x80000000),execute:!!(section.characteristics&0x20000000)}))}};
}

export async function buildOwnedAotRecovery({signal}={}) {
  const ctx=new Context({signal}),temporaryBase=await fs.realpath(os.tmpdir()),owned=await fs.mkdtemp(path.join(temporaryBase,'reclaimer-aot-recovery-'));
  const receipt={started_at:new Date().toISOString(),source_root:sourceRoot,sources:[],sdk:'8.0.425',compiler:'Microsoft.DotNet.ILCompiler 8.0.31',runtime:'win-x64',target_execution:'not-performed',commands:[],success:false};
  try {
    const input=path.join(owned,'input'),profile=path.join(owned,'profile'),cache=path.join(owned,'packages'),output=path.join(owned,'published');await fs.mkdir(input);await fs.mkdir(profile);
    // Junction is owned and points only at the explicitly authorized private
    // vendor cache. Clearing package sources prevents a network restore.
    await fs.symlink(await fs.realpath(packageRoot),cache,'junction');
    for(const name of ['RecoveryProof.csproj','Program.cs']){const bytes=await fs.readFile(path.join(sourceRoot,name));receipt.sources.push({name,sha256:digest(bytes)});await fs.writeFile(path.join(input,name),bytes,{flag:'wx'});}
    await fs.writeFile(path.join(owned,'global.json'),JSON.stringify({sdk:{version:'8.0.425',rollForward:'disable'}}));
    await fs.writeFile(path.join(owned,'nuget.config'),'<configuration><packageSources><clear/></packageSources></configuration>');
    const env={PATH:process.env.PATH??'',SystemRoot:process.env.SystemRoot??'',OS:'Windows_NT',ProgramFiles:process.env.ProgramFiles??'C:/Program Files','ProgramFiles(x86)':process.env['ProgramFiles(x86)']??'C:/Program Files (x86)',ProgramData:profile,TEMP:owned,TMP:owned,USERPROFILE:profile,APPDATA:profile,LOCALAPPDATA:profile,DOTNET_CLI_HOME:profile,DOTNET_SKIP_FIRST_TIME_EXPERIENCE:'1',DOTNET_GENERATE_ASPNET_CERTIFICATE:'false',DOTNET_ADD_GLOBAL_TOOLS_TO_PATH:'false',DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE:'true',NUGET_PACKAGES:cache,NUGET_HTTP_CACHE_PATH:path.join(owned,'http-cache'),NUGET_PLUGINS_CACHE_PATH:path.join(owned,'plugin-cache')};
    const common=[`-p:BaseIntermediateOutputPath=${path.join(owned,'obj')}/`,`-p:BaseOutputPath=${path.join(owned,'bin')}/`,`-p:RestoreConfigFile=${path.join(owned,'nuget.config')}`,'-p:RuntimeIdentifier=win-x64','-p:NuGetAudit=false','-p:UseSharedCompilation=false','-nodeReuse:false','-maxCpuCount:1'],dotnet=path.resolve(process.env.REAL_TEST_DOTNET??path.join(process.env.ProgramFiles??'C:/Program Files','dotnet/dotnet.exe')),msbuild=path.join(path.dirname(dotnet),'sdk/8.0.425/MSBuild.dll'),project=path.join(input,'RecoveryProof.csproj');
    const commands=[[dotnet,'exec',msbuild,project,'-target:Restore',...common],[dotnet,'exec',msbuild,project,'-target:Publish','-p:Configuration=Release','-p:SelfContained=true',`-p:PublishDir=${output}/`,...common]];
    await fs.mkdir(recoveryEvidenceRoot,{recursive:true});
    for(const [index,argv] of commands.entries()){signal?.throwIfAborted();receipt.commands.push(argv);const result=await ctx.run(argv,{cwd:owned,timeout:120000,maxBytes:4*1024*1024,env});await fs.writeFile(path.join(recoveryEvidenceRoot,`build-${index}.log`),result.stdout+result.stderr);}
    signal?.throwIfAborted();const bytes=await fs.readFile(path.join(output,'RecoveryProof.exe')),parsed=recoveryPeModel(bytes),detail=recoverNativeAotDetailed(bytes,parsed.model,digest(bytes),parsed.architecture,{signal}),instances=detail.modules.flatMap(module=>module.instances);
    const sentinel=instances.find(instance=>instance.kind==='string'&&instance.string_value==='Reclaimer-owned-AOT α🚀');if(!sentinel)throw new Error('Owned compiler literal did not yield a bounded frozen string');
    const array=instances.find(instance=>instance.kind==='array'&&instance.component_count===7&&detail.modules.some(module=>{if(!module.reconstruction||!instance.data_address)return false;const at=Number(BigInt(instance.data_address)-module.reconstruction.address);return at>=0&&module.reconstruction.bytes.subarray(at,at+7).equals(Buffer.from([1,2,3,5,8,13,21]));}));if(!array)throw new Error('Owned compiler array did not yield matching frozen component bytes');
    const boxed=instances.find(instance=>instance.kind==='object'&&detail.modules.some(module=>{const type=module.types.find(type=>type.address===instance.method_table_address);if(type?.element_type!=='int32'||!module.reconstruction)return false;const at=Number(BigInt(instance.address)-module.reconstruction.address)+detail.pointer_size;return at>=0&&at+4<=module.reconstruction.bytes.length&&module.reconstruction.bytes.readInt32LE(at)===173;}));if(!boxed)throw new Error('Owned compiler boxed value did not yield matching static bytes');
    receipt.retained_target=path.join(recoveryEvidenceRoot,'RecoveryProof.exe');receipt.artifact_sha256=digest(bytes);receipt.artifact_bytes=bytes.length;receipt.assertions={owned_literal:sentinel.address,owned_array:array.address,owned_boxed_int32:boxed.address,modules:detail.modules.length,method_tables:detail.modules.reduce((n,m)=>n+m.types.length,0),frozen_instances:instances.length};
    for(const source of receipt.sources)if(digest(await fs.readFile(path.join(sourceRoot,source.name)))!==source.sha256)throw new Error('Owned AOT compiler source changed during validation');
    await fs.writeFile(receipt.retained_target,bytes);receipt.source_preserved=true;receipt.success=true;return receipt;
  }catch(error){receipt.failure={name:error.name,message:error.message,stdout:error.stdout??'',stderr:error.stderr??''};throw error;}
  finally {
    receipt.finished_at=new Date().toISOString();await fs.mkdir(recoveryEvidenceRoot,{recursive:true});
    // Remove the junction first: cleanup never recursively traverses vendor data.
    try{await fs.unlink(path.join(owned,'packages'));}catch(error){if(error.code!=='ENOENT')throw error;}
    const resolved=await fs.realpath(owned);if(path.dirname(resolved)!==temporaryBase||!path.basename(resolved).startsWith('reclaimer-aot-recovery-'))throw new Error('Owned AOT cleanup boundary mismatch');
    try{await fs.rm(resolved,{recursive:true,force:true,maxRetries:3,retryDelay:100});receipt.cleanup={complete:true};}catch(error){receipt.cleanup={complete:false,owned_root:resolved,message:error.message};throw error;}finally{await fs.writeFile(path.join(recoveryEvidenceRoot,'build-receipt.json'),JSON.stringify(receipt,null,2)+'\n');}
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename))buildOwnedAotRecovery().then(receipt=>console.log(JSON.stringify(receipt,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
