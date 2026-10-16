import { fileURLToPath } from 'node:url';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, normalize } from 'node:path';
import { api } from './contracts.mjs';
import { digest, VERSION } from './core.mjs';
import { observedSession } from './session-observations.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const commandPath=fileURLToPath(new URL('../scripts/real.mjs',import.meta.url));
const valueOf=out=>Object.hasOwn(out,'normalized_result')?out.normalized_result:out.result;
export async function inspectServerAlignment(a,{version=VERSION,catalog=api,serverPath=commandPath,packagePath=new URL('../package.json',import.meta.url),catalogPath=new URL('./api-contracts.json',import.meta.url)}={}){
 const reasons=[],unknowns=[];
 const catalogDigest=digest(catalog);
 if(a.expected_package_version&&a.expected_package_version!==version)reasons.push('Requested package version differs from this running server');
 if(a.expected_catalog_digest&&a.expected_catalog_digest!==catalogDigest)reasons.push('Requested catalog digest differs from this running server');
 if(a.expected_server_path){
  const normalizePath=p=>{const n=normalize(resolve(p));return process.platform==='win32'?n.toLowerCase():n;};
  const current=await realpath(serverPath).catch(()=>serverPath),expected=await realpath(a.expected_server_path).catch(()=>a.expected_server_path);
  if(normalizePath(current)!==normalizePath(expected))reasons.push('Requested command path differs from this running server');
 }
 try{const disk=JSON.parse(await readFile(packagePath,'utf8'));if(disk.version!==version)reasons.push('Package version on disk differs from this running server');}catch{unknowns.push('Package version on disk could not be inspected');}
 try{const disk=JSON.parse(await readFile(catalogPath,'utf8'));if(digest(disk)!==catalogDigest)reasons.push('Catalog on disk differs from the loaded catalog');}catch{unknowns.push('Catalog on disk could not be inspected');}
 return {state:reasons.length?'mcp_server_restart_required':unknowns.length?'unknown':'aligned',reasons:[...reasons,...unknowns],remediation:reasons.length?'Verify the selected server command and restart the MCP server to load the intended package and catalog':unknowns.length?'Inspect the reported on-disk identity limitations':null};
}
export function effects(name){
 const mutatesSession=/^(open|close|set|unset|goto|next|prev|record|update|import)_/.test(name);
 const launchesProcess=/capture|observe|native|procedure|decompile|^(inspect|extract)_artifact$/.test(name);
 return {mutatesTarget:/^annotate_native/.test(name),mutatesSession,writesFilesystem:/extract|export|recover|capture|annotate|import/.test(name),launchesProcess,accessesNetwork:/web|browser|electron|runtime/.test(name),changesUiState:/goto|next_address|prev_address|native_ui|capture_(browser|electron)_scenario/.test(name),mayDiscardData:/close_binary|unset/.test(name),idempotent:!mutatesSession&&!/capture|observe/.test(name)};
}
async function candidatesFor(ctx){
 const raw=await ctx.nativeAvailability?.(ctx)??[];
 return raw.map(meta=>{
  const selected=(ctx.target?.provider_id??'').replace('-mcp','')===meta.id;
  const live=selected&&!!ctx.nativeSession?.model;
  const code=meta.id==='hopper'&&process.platform!=='darwin'?'unsupported_host':meta.configured?'version_unresolved':'not_configured';
  return {provider:{id:meta.id,name:meta.id,version:live?ctx.nativeSession.model.provider_version??null:null},
   availability:live?{status:'available',code:null,reason:null,diagnostics:{analysis_model_observed:true}}:{status:'unavailable',code,reason:meta.configured?'Provider is configured; this session has not observed successful analysis':meta.reason,diagnostics:{configured:meta.configured,route:meta.route,validation_scope:meta.validation_scope??null}},
   target_support:live?{status:'supported',code:null,reason:null,diagnostics:{source_sha256:ctx.target.sha256}}:{status:'unknown',code:null,reason:'A compatible provider analysis has not been observed for the selected target',diagnostics:{}},selected,capabilities:[]};
 });
}
export const handlers={
 binary_session:async(a,ctx)=>{
  const candidates=await candidatesFor(ctx);
  const selected=candidates.find(c=>c.selected);
  const nativeReady=!!ctx.nativeSession?.model;
  const debuggerInfo=await ctx.debuggerPrerequisite?.(ctx);
  const availability=api.tools.map(t=>{
   const nativeRequired=/procedure|^address_name$|^comment$|^inline_comment$|^xrefs$|^list_(names|procedures|segments|strings|bookmarks)$|^set_|^unset_|native_(function|data_type|instruction|call_targets|values|dispatch_metadata|api)|^binary_overview$|^analyze_function$|^trace_(feature|call_path)$|^get_(objc|call_graph)|swift_types/.test(t.name);
   const targetRequired=nativeRequired||ctx.nativeOperations?.has(t.name)&&!['open_binary','list_documents'].includes(t.name)||['observe_native_calls','inspect_artifact','extract_artifact','get_navigation_context','inspect_address_context','current_address','current_document','current_procedure','goto_address','next_address','prev_address'].includes(t.name);
   const independentReady=!!ctx.target&&(['binary_overview','list_names','list_procedures','list_strings','address_name','comment','inline_comment','list_bookmarks'].includes(t.name)&&['elf','pe','mach-o','dos-com'].includes(ctx.target.format)||['analyze_swift_types','get_objc_classes','get_objc_protocols','inspect_native_dispatch_metadata'].includes(t.name)&&(ctx.target.format==='mach-o'||ctx.target.format==='analysis-database'&&ctx.nativeSession?.sourceBytes?.subarray(0,4).equals(Buffer.from([0xe2,0x9c,0xa8,0x0e]))));
   const reason=!ctx.handlers[t.name]?'provider_unavailable':targetRequired&&!ctx.target?'target_required':nativeRequired&&!nativeReady&&!independentReady?'provider_missing':t.name==='observe_native_calls'&&!debuggerInfo?.present?'provider_unavailable':['observe_native_ui','capture_native_ui_scenario'].includes(t.name)&&!['win32','linux'].includes(process.platform)?'unsupported_host':['observe_native_ui','capture_native_ui_scenario'].includes(t.name)&&process.platform==='linux'&&(!process.env.DISPLAY||!process.env.DBUS_SESSION_BUS_ADDRESS)?'provider_unavailable':t.name==='list_segments'&&nativeReady&&typeof ctx.nativeSession.model.image_base!=='string'?'provider_unavailable':'available';
   const eff=effects(t.name),ann=t.annotations??{};
   return {name:t.name,surface:'mcp',client_requirements:{required:[],optional:[],missing_required:[],missing_optional:[]},effects:eff,annotations:{read_only:ann.readOnlyHint??false,destructive:ann.destructiveHint??false,idempotent:ann.idempotentHint??false,open_world:ann.openWorldHint??false},available:reason==='available',reason,remediation:reason==='available'?null:reason==='target_required'?'Open a compatible target':'Configure the documented provider prerequisites'};
  });
  const capabilities=availability.map(t=>({operation:t.name,available:t.available,reason:t.available?null:t.reason,availability_code:t.available?null:t.reason==='unsupported_host'?'unsupported_host':t.reason==='provider_missing'?'not_configured':null,effects:{mutates_artifact:t.effects.mutatesTarget,launches_process:t.effects.launchesProcess,may_show_ui:t.effects.changesUiState,may_access_network:t.effects.accessesNetwork,may_write_filesystem:t.effects.writesFilesystem,changes_permissions:false,requires_root:false},limitations:['Availability describes this session and registered route; it does not establish exhaustive format or live-provider coverage']}));
  for(const candidate of candidates)candidate.capabilities=candidate.selected?capabilities.filter(c=>c.available&&ctx.nativeOperations?.has(c.operation)):[];
  const result={
   ...observedSession(ctx,capabilities,digest),analysis_provider_candidates:candidates,tool_availability:availability,
   client_features:{elicitation_form:!!ctx.clientCapabilities?.elicitation?.form,elicitation_url:!!ctx.clientCapabilities?.elicitation?.url,roots:!!ctx.clientCapabilities?.roots,sampling:!!ctx.clientCapabilities?.sampling},
   server_identity:{package:{name:'reclaimer',version:VERSION,root_path:root,build_commit:null},
    server:{name:'real',version:VERSION,started_at:ctx.startedAt,command_path:commandPath},
    sdk:{server:'independent-jsonrpc',client_test:'@modelcontextprotocol/client@2.3.1',core:'independent-jsonrpc'},
    negotiated_protocol_version:ctx.protocolVersion,client:ctx.client,skill:{name:'real',expected_version:VERSION},
    catalog:{tools:api.tools.length,prompts:api.prompts.length,contract_sha256:digest(api)},protocol_features:{progress:true,cancellation:true,elicitation:false},
    alignment:await inspectServerAlignment(a)},
   open:!!ctx.target,
  };
  if(ctx.target)Object.assign(result,Object.fromEntries(['path','format','kind','sha256','architecture'].map(k=>[k,ctx.target[k]])));
  return {result};
 },
 get_navigation_context:async(a,ctx)=>{
  const document=a.document??valueOf(await ctx.call('current_document',{}));
  const address=valueOf(await ctx.call('current_address',{document}));
  let procedure=null;
  try{const resolved=valueOf(await ctx.call('resolve_containing_procedure',{address,document}));procedure=resolved.found?resolved.procedure.address:null;}catch(error){if(error.code!=='unavailable')throw error;}
  return {result:{document,address,procedure}};
 },
 inspect_address_context:async(a,ctx)=>{
  const out={address:a.address,document:a.document??ctx.target?.path??null};
  for(const [key,operation] of Object.entries({name:'address_name',procedure:'resolve_containing_procedure',comment:'comment',inline_comment:'inline_comment',bookmarks:'list_bookmarks'})){
   try{const input=key==='bookmarks'?{document:a.document}:{address:a.address,...(a.document?{document:a.document}:{})};if(input.document===undefined)delete input.document;
    out[key]={state:'available',value:valueOf(await ctx.call(operation,input))};
   }catch(error){if(ctx.signal?.aborted||error.name==='AbortError'||['cancelled','contract'].includes(error.code))throw error;out[key]={state:'unavailable',reason:error.message,remediation:error.details?.remediation??'Configure a provider and open a compatible target'};}
  }return {result:out};
 },
};
