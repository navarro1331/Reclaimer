import { Cli, z } from 'incur';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { engine } from './engine.mjs';
import { serve } from './protocol.mjs';
import { tools } from './contracts.mjs';
import { VERSION, errorResult, InvestigationError, digest } from './core.mjs';
import { prepareCommand, jsonFields } from './cli-routes.mjs';
import { configure } from './setup.mjs';
import contracts from './cli-contracts.json' with {type:'json'};
const root=fileURLToPath(new URL('../',import.meta.url));
const snake=key=>key.replaceAll('-','_').replace(/[A-Z]/g,char=>'_'+char.toLowerCase());
const aliases={analyze:'binary_overview',inspect:'binary_overview',decompile:'procedure_pseudo_code',function:'analyze_function',instructions:'read_function_instructions',trace:'trace_feature','capture-process':'capture_process_scenario','evidence-import':'import_evidence_bundle'};
const json=async value=>{try{return JSON.parse(value);}catch{try{return JSON.parse(await readFile(resolve(value),'utf8'));}catch(cause){throw new InvestigationError('input','cli','Expected inline JSON or a readable JSON file',{cause:cause.code??null});}}};
async function localCommand(name,a,options,ctx){
 if(name==='providers')return {providers:await ctx.nativeAvailability?.(ctx)??[]};
 if(name==='capabilities')return (await ctx.call('binary_session',{})).result;
 if(name==='doctor'){
  const candidates=await ctx.nativeAvailability?.(ctx)??[],checks=[{name:'node',status:Number(process.versions.node.split('.')[0])>=24?'pass':'fail',version:process.versions.node},{name:'catalog',status:Object.keys(ctx.handlers).length===tools.size?'pass':'fail',registered:Object.keys(ctx.handlers).length,expected:tools.size}];
  if(options.target)try{await ctx.read(options.target);checks.push({name:'target',status:'pass'});}catch(cause){checks.push({name:'target',status:'fail',reason:cause.message});}
  return {status:checks.some(c=>c.status==='fail')?'fail':'pass',checks,providers:candidates};
 }
 if(name==='import-reference-source'){
  const e=await ctx.call('analyze_javascript_application',{input_path:a.root,format:'directory',integrity_policy:'fail'});
  return {result:{root:resolve(a.root),evidence_id:e.evidence_id,analysis:e.normalized_result,authority:'historical-reference'}};
 }
 if(name==='evidence-export'){
  const input=await json(a.source);
  if(input.records)await ctx.call('import_evidence_bundle',{path:a.source});
  else if(input.evidence_id)ctx.ledger.set(input.evidence_id,input);
  else throw new InvestigationError('input',name,'Source must be an evidence record or bundle');
  return ctx.call('export_evidence_bundle',{path:a.output,overwrite:options.overwrite??false});
 }
 if(['setup','uninstall','update'].includes(name))return configure(name,options,ctx);
 return undefined;
}
export async function invoke(name,a={},options={}){
 const ctx=await engine();
 try{
  const suppliedArgs=structuredClone(a),suppliedOptions=structuredClone(options),fields=jsonFields(name);
  for(const key of fields.args)if(suppliedArgs[key]!==undefined)suppliedArgs[key]=JSON.stringify(await json(suppliedArgs[key]));
  for(const key of fields.options)if(suppliedOptions[key]!==undefined)suppliedOptions[key]=JSON.stringify(await json(suppliedOptions[key]));
  const route=prepareCommand(name,suppliedArgs,suppliedOptions);
  if(route.operation===null)return localCommand(name,route.parameters.args,route.parameters.options,ctx);
  return await invokePrepared(ctx,route);
 }finally{if(ctx.target)await ctx.handlers.close_binary?.({},ctx);}
}
export async function invokePrepared(ctx,route){
 if(route.integrityPolicy)ctx.config.integrityPolicy=route.integrityPolicy;
 if(route.openTarget)await ctx.call('open_binary',route.openTarget);
 for(const pre of route.preCalls??[])route.parameters[pre.assign]=await ctx.call(pre.operation,pre.parameters);
 const result=await ctx.call(route.operation,route.parameters);
 if(route.integrityPolicy&&ctx.target){
  const current=digest(await ctx.read(ctx.target.path)),expected=ctx.target.sha256;
  if(current!==expected){
   const message='Source changed during CLI analysis: opened SHA256 '+expected+', final SHA256 '+current;
   if(route.integrityPolicy==='fail')throw new InvestigationError('input',route.operation,message,{reason:'integrity_contradiction',expected_sha256:expected,observed_sha256:current});
   if(result.evidence_id){ctx.ledger.delete(result.evidence_id);return ctx.evidence(result.operation,{...result.parameters,integrity_policy:route.integrityPolicy},result.normalized_result,{subject:result.subject,provider:result.provider,predicateType:result.predicate_type,raw:result.raw_result,authority:result.authority,confidence:result.confidence,environment:result.environment,locations:result.locations,links:result.evidence_links,limitations:[...result.limitations,message]});}
  }
 }
 return result;
}
export async function cli(argv=process.argv.slice(2),{applicationName='real'}={}){
 if(argv[0]==='mcp'||argv.includes('--mcp'))return serve(await engine());
 const app=Cli.create(applicationName,{description:'Local artifact investigation and evidence comparison',version:VERSION});
 for(const definition of contracts.commands){
  const schema=definition.schema??{},args=schema.args?z.fromJSONSchema(schema.args):undefined,options=schema.options?z.fromJSONSchema(schema.options):undefined;
  app.command(definition.name,{description:'Run '+definition.name.replaceAll('-',' '),args,options,run:async(c)=>{
   try{return await invoke(definition.name,c.args,c.options);}
   catch(cause){process.exitCode=1;return errorResult(cause,definition.name);}
  }});
 }
 await app.serve(argv);
}
