import Ajv2020 from 'ajv/dist/2020.js';
import cliContract from './cli-contracts.json' with {type:'json'};
import { tools, validate } from './contracts.mjs';
import { InvestigationError } from './core.mjs';

const ajv=new Ajv2020({strict:false,allErrors:true,useDefaults:true}),definitions=new Map(cliContract.commands.map(c=>[c.name,c]));
const commandValidators=new Map(cliContract.commands.map(c=>[c.name,{args:ajv.compile(c.schema?.args??{type:'object',properties:{},additionalProperties:false}),options:ajv.compile(c.schema?.options??{type:'object',properties:{},additionalProperties:false})}]));
const snake=k=>k.replaceAll('-','_').replace(/[A-Z]/g,c=>`_${c.toLowerCase()}`);
const local=new Set(['providers','doctor','setup','uninstall','update','import-reference-source','evidence-export']);
const aliases={analyze:'binary_overview',inspect:'binary_overview',decompile:'procedure_pseudo_code',function:'analyze_function',instructions:'read_function_instructions',trace:'trace_feature','capture-process':'capture_process_scenario','evidence-import':'import_evidence_bundle',capabilities:'binary_session'};
const selectionCommands=new Set(['decompile','function','instructions','inspect-native-api']);
const jsonNames={
  'capture-process':{args:['scenario']},
  compare:{args:['left','right']},
  'compare-process-captures':{args:['left','right','traceSpec']},
  'compare-web-captures':{args:['beforeJson','afterJson'],options:['normalizationJson']},
  'compare-web-screenshots':{args:['beforeJson','afterJson']},
  'capture-native-ui-scenario':{options:['steps']},
};
export function jsonFields(name) {
  const def=definitions.get(name);if(!def)throw new InvestigationError('input','cli','Unknown command');
  return {args:[...(def.schema?.args?.properties?.inputJson?['inputJson']:[]),...(jsonNames[name]?.args??[])],options:[...(jsonNames[name]?.options??[])]};
}
function parseJson(value,field,name) {
  try{return JSON.parse(value);}catch{throw new InvestigationError('input',name,`${field} must contain resolved JSON; the CLI adapter must load JSON file arguments before preparation`);}
}
function requireInput(operation,parameters,name) {
  const result=validate(operation,'input',parameters);
  if(!result.valid)throw new InvestigationError('input',name,'CLI arguments cannot form a valid public MCP request',{operation,validation_errors:result.errors});
}
/** Pure preparation. Filesystem JSON references are resolved by the adapter first.
 * preCalls contain real prerequisites that must supply Evidence into assign fields.
 */
export function prepareCommand(name,args={},opts={}) {
  if(!definitions.has(name))throw new InvestigationError('input',name,'Unknown public CLI command');
  const a=structuredClone(args),o=structuredClone(opts),validators=commandValidators.get(name);
  for(const [kind,value]of [['args',a],['options',o]])if(!validators[kind](value))throw new InvestigationError('input',name,`CLI ${kind} do not satisfy the observed command schema`,{validation_errors:validators[kind].errors});
  if(local.has(name))return {operation:null,parameters:{command:name,args:a,options:o}};
  let operation=aliases[name]??name.replaceAll('-','_');
  if(name==='search')operation=o.kind==='strings'?'search_strings':'search_procedures';
  if(name==='compare') {
    const left=parseJson(a.left,'left',name),right=parseJson(a.right,'right',name);
    const artifact=e=>e.operation==='inspect_artifact'||e.operation==='inventory_artifact'||e.normalized_result?.manifest||e.normalized_result?.manifest_id;
    operation=artifact(left)&&artifact(right)?'compare_artifacts':'compare_functions';const parameters={left,right};requireInput(operation,parameters,name);return {operation,parameters};
  }
  if(!tools.has(operation))throw new InvestigationError('unavailable',name,'No public MCP route corresponds to this CLI command');
  const input=tools.get(operation).inputSchema,allowed=new Set(Object.keys(input.properties??{})),parameters={},route={operation,parameters};
  if(name==='analyze')route.integrityPolicy=o.integrityPolicy;
  const hasInnerPath=['inspect-keyed-archive','inspect-plist'].includes(name),needsTarget=a.path!==undefined&&(!allowed.has('path')&&!allowed.has('input_path')||hasInnerPath||name==='observe-native-calls');
  if(needsTarget) {
    route.openTarget={path:a.path};
    if(o['target-format']!==undefined)route.openTarget.format=o['target-format'];if(o.provider!==undefined)route.openTarget.provider_id=o.provider;if(o.snapshot!==undefined)route.openTarget.snapshot_path=o.snapshot;
    requireInput('open_binary',route.openTarget,name);
  }
  if(a.inputJson!==undefined)Object.assign(parameters,parseJson(a.inputJson,'inputJson',name));
  else if(name==='capture-process')Object.assign(parameters,parseJson(a.scenario,'scenario',name));
  else if(name==='compare-managed-members') {
    route.preCalls=[{operation:'inspect_managed_members',parameters:{path:a.leftPath},assign:'left'},{operation:'inspect_managed_members',parameters:{path:a.rightPath},assign:'right'}];
    for(const p of route.preCalls)requireInput(p.operation,p.parameters,name);
    return route;
  }
  else {
    const names={path:allowed.has('input_path')?'input_path':'path',endpoint:allowed.has('inspector_endpoint')?'inspector_endpoint':'cdp_endpoint',artifactFormat:'format',integrityPolicy:'integrity_policy',relativePath:'path',archive:'path',record:'record_ordinals',sensitiveValue:'sensitive_values',debuggerContext:'include_debugger_context',root:name==='trace-dylib-resolution'?'roots':'root'};
    const nested=new Set(['offset','length']);
    for(const [key,value]of Object.entries({...a,...o})) {
      if(value===undefined||key==='path'&&needsTarget||key==='address'&&selectionCommands.has(name)||['target-format','provider','snapshot','inputJson'].includes(key))continue;
      if(name==='extract-firmware'&&nested.has(key))continue;
      if(['compare-web-captures','compare-web-screenshots','compare-process-captures'].includes(name))continue;
      if(name==='trace-web-source-location'&&['sourceMapPath','sourceMapUrl','line','column'].includes(key))continue;
      if(name==='trace-web-module-imports'&&['importMapPath','importMapBaseUrl'].includes(key))continue;
      const mapped=names[key]??snake(key);if(allowed.has(mapped))parameters[mapped]=value;
    }
    if(selectionCommands.has(name))parameters.procedure=o.procedure??a.address;
    if(name==='search')parameters.pattern=o.pattern??a.pattern;
    if(name==='trace')parameters.query=o.query??a.query;
    if(name==='xrefs'&&o.address!==undefined)parameters.address=o.address;
    if(name==='inspect-keyed-archive'&&a.archive!==undefined)parameters.path=a.archive;
    if(name==='inspect-plist'&&o.relativePath!==undefined)parameters.path=o.relativePath;
    if(name==='extract-firmware'&&(o.offset!==undefined||o.length!==undefined)) {
      if(o.length===undefined)throw new InvestigationError('input',name,'A firmware range offset requires an explicit length');
      parameters.range={offset:o.offset??0,length:o.length};
    }
    if(name==='compare-process-captures') {parameters.left=parseJson(a.left,'left',name);parameters.right=parseJson(a.right,'right',name);if(a.traceSpec!==undefined)parameters.trace_spec=parseJson(a.traceSpec,'traceSpec',name);}
    if(['compare-web-captures','compare-web-screenshots'].includes(name)) {
      const rawBefore=parseJson(a.beforeJson,'beforeJson',name),rawAfter=parseJson(a.afterJson,'afterJson',name),before=rawBefore.normalized_result??rawBefore,after=rawAfter.normalized_result??rawAfter;
      if(name==='compare-web-captures') {
        const normalization=parseJson(o.normalizationJson,'normalizationJson',name),scenario=before.scenario&&after.scenario;
        if(scenario){parameters.before_scenario=before;parameters.after_scenario=after;parameters.normalization=normalization;}
        else {parameters.before=before;parameters.after=after;if(normalization.rules?.length)throw new InvestigationError('input',name,'Normalization rules require scenario captures');}
      }else {parameters.before=before;parameters.after=after;parameters.channel_threshold=o.channelThreshold;}
    }
    if(name==='capture-native-ui-scenario'&&o.steps!==undefined)parameters.steps=parseJson(o.steps,'steps',name);
    if(name==='observe-native-ui'&&o.steps!==undefined)throw new InvestigationError('input',name,'The observed observe-native-ui --steps flag has no corresponding MCP field; use capture-native-ui-scenario');
    if(name==='trace-web-source-location') {parameters.source_map={path:a.sourceMapPath,url:a.sourceMapUrl};parameters.generated_position={line:a.line,column:a.column};}
    if(name==='trace-web-module-imports'&&(o.importMapPath!==undefined||o.importMapBaseUrl!==undefined)) {
      if(!o.importMapPath||!o.importMapBaseUrl)throw new InvestigationError('input',name,'Import-map path and base URL must be supplied together');
      parameters.import_map={path:o.importMapPath,base_url:o.importMapBaseUrl};
    }
  }
  requireInput(operation,parameters,name);return route;
}
export const cliRouteCatalog=cliContract.commands.map(c=>({name:c.name,local:local.has(c.name),operation:local.has(c.name)?null:aliases[c.name]??c.name.replaceAll('-','_'),json:jsonFields(c.name)}));
