import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Context } from '../lib/core.mjs';
import { handlers } from '../lib/native.mjs';
import { digest } from '../lib/artifact-binary.mjs';
import { recoverNativeAotDetailed } from '../lib/native-aot.mjs';
import { recoveryPeModel } from './native-aot-recovery-build.mjs';

const completionProgram=`// Independently authored compiler input; its executable is never launched.
using System;
using System.Runtime.InteropServices;
namespace Reclaimer.Owned.Completion;
public sealed class Box<T> {
  public T Value = default!;
  public T Identity(T value) => value;
  public U Echo<U>(T first, U second) => second;
}
public sealed class AutoLedger {
  public int Serial = 17;
  public string Label = "owned-completion";
  public int Mix(int addend) => Serial * 3 + addend;
}
[StructLayout(LayoutKind.Explicit, Size=32, Pack=4)]
public struct PackedLedger {
  [FieldOffset(0)] public int Serial;
  [FieldOffset(8)] public long Stamp;
}
public static class CompletionProof {
  public static void Main() {
    var ledger = new AutoLedger();
    foreach(var field in typeof(AutoLedger).GetFields()) Console.WriteLine(field.Name);
    foreach(var field in typeof(PackedLedger).GetFields()) Console.WriteLine(field.Name);
    foreach(var method in typeof(AutoLedger).GetMethods()) Console.WriteLine(method.Name);
    Console.WriteLine(ledger.Mix(Environment.TickCount));
    Console.WriteLine(typeof(Box<>).FullName);
    foreach(var method in typeof(Box<>).GetMethods()) Console.WriteLine(method.Name);
    Console.WriteLine(typeof(Box<int>).FullName);
  }
}
`;
const completionProject=`<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework><PublishAot>true</PublishAot><Nullable>enable</Nullable><AssemblyName>Reclaimer.Completion.Proof</AssemblyName></PropertyGroup></Project>\n`;

async function buildCompletion({signal}){
  const evidence=path.join(path.resolve(process.env.RECLAIMER_RECOVERY_EVIDENCE??path.join(import.meta.dirname,'../.cache/native-aot-completion')),'owned-aot-completion'),base=await fs.realpath(os.tmpdir()),root=await fs.mkdtemp(path.join(base,'reclaimer-aot-completion-')),profile=path.join(root,'profile'),cache=path.join(root,'packages'),input=path.join(root,'input'),output=path.join(root,'published');
  const receipt={run_id:path.basename(root),started_at:new Date().toISOString(),sdk:'8.0.425',compiler:'Microsoft.DotNet.ILCompiler 8.0.31',runtime:'win-x64',target_execution:'not-performed',sources:[],commands:[],logs:[],success:false};
  await fs.mkdir(evidence,{recursive:true});
  try{
    await fs.mkdir(profile);await fs.mkdir(input);
    const packages=path.join(path.resolve(process.env.REAL_TEST_EVIDENCE_ROOT??path.join(import.meta.dirname,'provider-fixtures')),'parity-20261013/owned-aot/packages');
    await fs.symlink(await fs.realpath(packages),cache,'junction');
    for(const [name,source]of [['Program.cs',completionProgram],['CompletionProof.csproj',completionProject]]){
      const bytes=Buffer.from(source);await fs.writeFile(path.join(input,name),bytes,{flag:'wx'});
      const retained=path.join(evidence,receipt.run_id+'-'+name);await fs.writeFile(retained,bytes,{flag:'wx'});receipt.sources.push({name,sha256:digest(bytes),retained_path:retained});
    }
    await fs.writeFile(path.join(root,'global.json'),JSON.stringify({sdk:{version:'8.0.425',rollForward:'disable'}}));
    await fs.writeFile(path.join(root,'nuget.config'),'<configuration><packageSources><clear/></packageSources></configuration>');
    const env={PATH:process.env.PATH??'',SystemRoot:process.env.SystemRoot??'',OS:'Windows_NT',ProgramFiles:process.env.ProgramFiles??'C:/Program Files','ProgramFiles(x86)':process.env['ProgramFiles(x86)']??'C:/Program Files (x86)',ProgramData:profile,TEMP:root,TMP:root,USERPROFILE:profile,APPDATA:profile,LOCALAPPDATA:profile,DOTNET_CLI_HOME:profile,DOTNET_GENERATE_ASPNET_CERTIFICATE:'false',DOTNET_ADD_GLOBAL_TOOLS_TO_PATH:'false',DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_SKIP_FIRST_TIME_EXPERIENCE:'1',DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE:'true',NUGET_PACKAGES:cache,NUGET_HTTP_CACHE_PATH:path.join(root,'http-cache'),NUGET_PLUGINS_CACHE_PATH:path.join(root,'plugin-cache')};
    const dotnet=path.resolve(process.env.REAL_TEST_DOTNET??path.join(process.env.ProgramFiles??'C:/Program Files','dotnet/dotnet.exe')),msbuild=path.join(path.dirname(dotnet),'sdk/8.0.425/MSBuild.dll'),project=path.join(input,'CompletionProof.csproj'),common=[`-p:BaseIntermediateOutputPath=${path.join(root,'obj')}/`,`-p:BaseOutputPath=${path.join(root,'bin')}/`,`-p:RestoreConfigFile=${path.join(root,'nuget.config')}`,'-p:RuntimeIdentifier=win-x64','-p:NuGetAudit=false','-p:UseSharedCompilation=false','-nodeReuse:false','-maxCpuCount:1'],ctx=new Context({signal});
    for(const [index,argv]of [[dotnet,'exec',msbuild,project,'-target:Restore',...common],[dotnet,'exec',msbuild,project,'-target:Publish','-p:Configuration=Release','-p:SelfContained=true',`-p:PublishDir=${output}/`,...common]].entries()){
      signal?.throwIfAborted();receipt.commands.push(argv);const result=await ctx.run(argv,{cwd:root,timeout:120000,maxBytes:4*1024*1024,env}),log=path.join(evidence,receipt.run_id+'-'+index+'.log');await fs.writeFile(log,result.stdout+result.stderr,{flag:'wx'});receipt.logs.push(log);
    }
    signal?.throwIfAborted();const bytes=await fs.readFile(path.join(output,'Reclaimer.Completion.Proof.exe'));receipt.artifact_sha256=digest(bytes);receipt.artifact_bytes=bytes.length;receipt.retained_target=path.join(evidence,receipt.run_id+'-'+receipt.artifact_sha256+'.exe');await fs.writeFile(receipt.retained_target,bytes,{flag:'wx'});
    for(const source of receipt.sources)assert.equal(digest(await fs.readFile(path.join(input,source.name))),source.sha256);
    receipt.source_preserved=true;receipt.success=true;return receipt;
  }catch(error){receipt.failure={name:error.name,message:error.message};throw error;}
  finally{
    try{try{await fs.unlink(cache);}catch(error){if(error.code!=='ENOENT')throw error;}const resolved=await fs.realpath(root);assert.equal(path.dirname(resolved),base);assert.ok(path.basename(resolved).startsWith('reclaimer-aot-completion-'));await fs.rm(resolved,{recursive:true,force:true});receipt.cleanup={complete:true};}
    catch(error){receipt.cleanup={complete:false,owned_root:root,message:error.message};throw error;}
    finally{receipt.finished_at=new Date().toISOString();receipt.receipt_path=path.join(evidence,receipt.run_id+'-build-receipt.json');await fs.writeFile(receipt.receipt_path,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});}
  }
}

test('actual owned NativeAOT compiler output proves generic definitions, signatures, field layouts and method-code bindings',{
  skip:process.env.REAL_RUN_NATIVE_VARIATIONS!=='1',timeout:240000,
},async t=>{
  const receipt=await buildCompletion({signal:t.signal}),bytes=await fs.readFile(receipt.retained_target),parsed=recoveryPeModel(bytes),detail=recoverNativeAotDetailed(bytes,parsed.model,digest(bytes),parsed.architecture,{signal:t.signal}),module=detail.modules[0],inventory=detail.identity_recovery.modules[0];
  const box=module.types.find(type=>type.identity?.qualified_name==='Reclaimer.Owned.Completion.Box`1');
  assert.ok(box);assert.equal(box.kind,'generic-definition');assert.equal(box.generic_parameter_count,1);assert.equal(box.component_size_bytes,0);
  assert.equal(box.identity.generic_parameters[0].name,'T');
  const echo=inventory.methods.find(method=>method.qualified_name==='Reclaimer.Owned.Completion.Box`1.Echo');
  assert.equal(echo.generic_parameters[0].name,'U');assert.equal(echo.signature.generic_parameter_count,1);
  assert.equal(echo.signature.return_type.display_name,'!!0');assert.deepEqual(echo.signature.parameters.map(parameter=>parameter.display_name),['!0','!!0']);
  const mix=inventory.methods.find(method=>method.qualified_name==='Reclaimer.Owned.Completion.AutoLedger.Mix');
  assert.equal(mix.binding_status,'associated');assert.ok(parsed.model.segments.some(segment=>segment.execute&&BigInt(mix.target_address)>=BigInt(segment.start)&&BigInt(mix.target_address)<BigInt(segment.end)));
  const serial=inventory.fields.find(field=>field.qualified_name==='Reclaimer.Owned.Completion.AutoLedger.Serial'),label=inventory.fields.find(field=>field.qualified_name==='Reclaimer.Owned.Completion.AutoLedger.Label');
  assert.equal(serial.offset_bytes,16);assert.equal(label.offset_bytes,8);assert.equal(serial.declared_offset_bytes,null);
  const packed=inventory.types.find(type=>type.qualified_name==='Reclaimer.Owned.Completion.PackedLedger');
  assert.equal(packed.declared_layout.kind,'explicit');assert.equal(packed.declared_layout.size_hint_bytes,32);assert.equal(packed.declared_layout.packing_hint_bytes,4);
  const packedFields=inventory.fields.filter(field=>field.declaring_type==='Reclaimer.Owned.Completion.PackedLedger');
  assert.deepEqual(packedFields.map(field=>[field.name,field.declared_offset_bytes]).sort(),[['Serial',0],['Stamp',8]]);
  assert.deepEqual(packedFields.map(field=>[field.name,field.offset_bytes,field.offset_basis]).sort(),[['Serial',0,'unboxed-value-data'],['Stamp',8,'unboxed-value-data']]);
  assert.equal(serial.offset_basis,'object-address');assert.equal(label.offset_basis,'object-address');
  const constructed=module.types.find(type=>type.identity?.qualified_name==='Reclaimer.Owned.Completion.Box`1<System.Int32>');
  assert.ok(constructed);assert.equal(constructed.identity.identity_kind,'constructed-generic');
  assert.equal(constructed.identity.generic_definition.method_table_address,box.address);
  assert.equal(constructed.identity.generic_arguments[0].qualified_name,'System.Int32');
  const instantiatedMethod=inventory.methods.find(method=>method.qualified_name==='Reclaimer.Owned.Completion.Box`1<System.Int32>.Identity');
  assert.equal(instantiatedMethod.binding_status,'associated');assert.equal(instantiatedMethod.declaring_method_table_address,constructed.address);
  assert.equal(inventory.methods.find(method=>method.qualified_name==='Reclaimer.Owned.Completion.Box`1.Identity').target_address,null);
  assert.equal(inventory.methods.find(method=>method.qualified_name==='Reclaimer.Owned.Completion.Box`1<System.Int32>.Echo').target_address,null);
  assert.ok(inventory.constructed_candidates.some(candidate=>candidate.reason.includes('shared canonical')));
  for(const member of [mix,serial,label,...packedFields,constructed.identity,instantiatedMethod])for(const binding of member.source_bindings){
    const selected=binding.file_offset===null?module.reconstruction.bytes.subarray(Number(BigInt(binding.address)-module.reconstruction.address),Number(BigInt(binding.address)-module.reconstruction.address)+binding.size_bytes):bytes.subarray(binding.file_offset,binding.file_offset+binding.size_bytes);assert.equal(digest(selected),binding.sha256);
  }
  const ctx=new Context({signal:t.signal});ctx.handlers=handlers;t.after(async()=>{if(ctx.target)await handlers.close_binary({},ctx);});
  await ctx.call('open_binary',{path:receipt.retained_target});await ctx.call('inspect_native_load_image',{});
  const observed=await ctx.call('inspect_native_data_type',{address:constructed.address});
  assert.equal(observed.normalized_result.name,constructed.identity.qualified_name);
  assert.equal(observed.normalized_result.metadata_recovery.original_name,null);
  assert.equal(observed.normalized_result.metadata_recovery.name_origin,'inferred');
  assert.equal(observed.raw_result.nativeaot_members.methods.find(method=>method.name==='Identity').target_address,instantiatedMethod.target_address);
  assert.equal(observed.raw_result.nativeaot_identity.generic_arguments[0].qualified_name,'System.Int32');
  for(const selector of [constructed.name,constructed.id,constructed.identity.qualified_name])assert.equal((await ctx.call('inspect_native_data_type',{type:selector})).normalized_result.id,constructed.id);
  const actualLayout=await ctx.call('inspect_native_data_type',{address:packed.method_table_address});
  assert.deepEqual(actualLayout.raw_result.nativeaot_members.fields.map(field=>[field.name,field.offset_bytes,field.offset_basis]).sort(),[['Serial',0,'unboxed-value-data'],['Stamp',8,'unboxed-value-data']]);
  assert.ok(!actualLayout.normalized_result.fields.some(field=>field.name==='Serial'));
  assert.ok(detail.identity_recovery.resource_usage.output_bytes<=8*1024*1024);
  assert.ok(Buffer.byteLength(JSON.stringify(detail.identity_recovery))<=8*1024*1024);
  assert.equal(digest(await fs.readFile(receipt.retained_target)),receipt.artifact_sha256);
  const assertions={artifact_sha256:receipt.artifact_sha256,source_records:receipt.sources,generic_definition:{name:box.identity.qualified_name,address:box.address,arity:box.generic_parameter_count},constructed_generic:{name:constructed.identity.qualified_name,address:constructed.address,argument:constructed.identity.generic_arguments[0],source_bindings:constructed.identity.source_bindings,method_target:instantiatedMethod.target_address,public_datatype_id:observed.normalized_result.id,original_name:observed.normalized_result.metadata_recovery.original_name},method:{name:mix.qualified_name,address:mix.target_address,source_bindings:mix.source_bindings},fields:[serial,label,...packedFields].map(field=>({name:field.qualified_name,offset_bytes:field.offset_bytes,offset_basis:field.offset_basis,declared_offset_bytes:field.declared_offset_bytes,source_bindings:field.source_bindings})),method_tables:module.types.length,generic_definitions:module.types.filter(type=>type.kind==='generic-definition').length,constructed_generics:inventory.types.filter(type=>type.identity_kind==='constructed-generic').length,associated_types:inventory.types.filter(type=>type.binding_status==='associated').length,associated_methods:inventory.methods.filter(method=>method.binding_status==='associated').length,associated_fields:inventory.fields.filter(field=>field.binding_status==='associated').length,frozen_records:module.instances.length,resource_usage:detail.identity_recovery.resource_usage,serialized_identity_bytes:Buffer.byteLength(JSON.stringify(detail.identity_recovery)),target_execution:'not-performed',source_preserved:true,cleanup:receipt.cleanup,success:true};
  await fs.writeFile(receipt.receipt_path.replace('-build-receipt.json','-analysis-receipt.json'),JSON.stringify(assertions,null,2)+'\n',{flag:'wx'});
});
