import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { canonical, digest, identifier, InvestigationError } from './core.mjs';
import { tools, validate } from './contracts.mjs';

const bad = (op, message) => { throw new InvestigationError('input', op, message); };
const revisionDigest = u => digest({ ...u, revision_digest: undefined });
const ranks = { inferred: 0, derived: 1, observed: 2 };
const unique = values => [...new Map(values.map(v => [canonical(v), v])).values()];
export function bundle(ctx) {
 const records = [...ctx.ledger.values()].map(v=>structuredClone(v));
 return {
  artifacts: unique(records.filter(r=>r.subject).map(r=>({digest:r.subject.digest,format:r.subject.format,architecture:r.subject.architecture}))),
  providers: unique(records.map(r=>r.provider)),
  environments: unique(records.map(r=>r.environment).filter(Boolean)),
  scenarios: records.filter(r=>r.authority==='controlled-replay').map(r=>({evidence_id:r.evidence_id,operation:r.operation,authority:r.authority})),
  captures: records.filter(r=>/capture|observe/.test(r.operation)).map(r=>({evidence_id:r.evidence_id,predicate_type:r.predicate_type})),
  unknowns: [...ctx.unknowns.values()].map(v=>structuredClone(v)), records,
 };
}
const ajv=new Ajv2020({strict:false,allErrors:true});addFormats(ajv);
const bundleValidator=ajv.compile(tools.get('get_evidence_bundle').outputSchema);
const bindingOperation='external_evidence_integrity';
const nativeIdentity=r=>identifier('ev',{protocol:1,...r,evidence_id:undefined})===r.evidence_id;
// Historical wire identifiers are opaque input, never execution authority.
const historicalRecord=r=>typeof r.predicate_type==='string'&&r.predicate_type.startsWith('rea.');
function externalBindings(records){
 const boundRecords=new Map(),boundUnknowns=new Map();
 for(const record of records.filter(r=>r.operation===bindingOperation)){
  if(!nativeIdentity(record))bad('import_evidence_bundle','Integrity binding content digest mismatch');
  const n=record.normalized_result;
  if(n?.schema!=='real.external-integrity.v1'||!Array.isArray(n.records)||!Array.isArray(n.unknowns))bad('import_evidence_bundle','Invalid external integrity binding');
  for(const item of n.records){if(!/^ev_[a-f0-9]{64}$/.test(item?.evidence_id)||!/^[a-f0-9]{64}$/.test(item?.sha256))bad('import_evidence_bundle','Invalid external record binding');if(boundRecords.has(item.evidence_id)&&boundRecords.get(item.evidence_id)!==item.sha256)bad('import_evidence_bundle','Conflicting external record bindings');boundRecords.set(item.evidence_id,item.sha256);}
  for(const item of n.unknowns){if(typeof item?.unknown_id!=='string'||!Number.isSafeInteger(item.revision)||item.revision<1||!/^[a-f0-9]{64}$/.test(item?.sha256))bad('import_evidence_bundle','Invalid external unknown binding');const key=item.unknown_id+':'+item.revision;if(boundUnknowns.has(key)&&boundUnknowns.get(key)!==item.sha256)bad('import_evidence_bundle','Conflicting external unknown bindings');boundUnknowns.set(key,item.sha256);}
 }
 return {records:boundRecords,unknowns:boundUnknowns};
}
function validRecordIdentity(record,bindings){
 if(nativeIdentity(record))return true;
 if(!historicalRecord(record))return false;
 const binding=bindings?.records.get(record.evidence_id);
 return binding===undefined||binding===digest(record);
}
export function checkBundle(value) {
 if(!bundleValidator({result:value}))bad('import_evidence_bundle','Invalid bundle: '+ajv.errorsText(bundleValidator.errors));
 const bindings=externalBindings(value.records);
 const ids=new Set();
 for(const r of value.records){
  if(ids.has(r.evidence_id))bad('import_evidence_bundle','Duplicate evidence identifier');
  ids.add(r.evidence_id);
  if(tools.has(r.operation)&&!validate(r.operation,'output',r).valid)bad('import_evidence_bundle','Record violates its operation output contract');
  if(!validRecordIdentity(r,bindings))bad('import_evidence_bundle','Evidence content digest mismatch');
 }
 const unknownIds=new Set();
 for(const u of value.unknowns){
  if(unknownIds.has(u.unknown_id))bad('import_evidence_bundle','Duplicate unknown identifier');
  unknownIds.add(u.unknown_id);
  if(revisionDigest(u)!==u.revision_digest){
   const bound=bindings.unknowns.get(u.unknown_id+':'+u.revision);
   const historical=u.mutation_evidence_ids.length>0&&u.mutation_evidence_ids.every(id=>historicalRecord(value.records.find(r=>r.evidence_id===id)??{}));
   if(!historical||bound!==undefined&&bound!==digest(u))bad('import_evidence_bundle','Unknown revision digest mismatch');
  }
  if(u.mutation_evidence_ids.some(id=>!ids.has(id)))bad('import_evidence_bundle','Unknown mutation evidence is missing');
  for(const id of [...u.supporting_evidence_ids,...u.contradicting_evidence_ids,...u.resolution?.evidence_ids??[]])if(!ids.has(id))bad('import_evidence_bundle','Unknown evidence reference is missing');
  if(u.relationships.some(r=>!value.unknowns.some(v=>v.unknown_id===r.unknown_id)))bad('import_evidence_bundle','Unknown relationship target is missing');
 }
 return value;
}
function checkImportConflicts(ctx,value,binding=null){
 for(const r of value.records){const old=ctx.ledger.get(r.evidence_id);if(old&&digest(old)!==digest(r))bad('import_evidence_bundle','Evidence identifier conflicts with retained content');}
 for(const u of value.unknowns){const old=ctx.unknowns.get(u.unknown_id);if(old&&(old.revision_digest===u.revision_digest?digest(old)!==digest(u):!(u.revision===old.revision+1&&u.previous_revision_digest===old.revision_digest)))bad('import_evidence_bundle','Unknown history conflicts with retained revision');}
 if(binding){const old=ctx.ledger.get(binding.evidence_id)??value.records.find(r=>r.evidence_id===binding.evidence_id);if(old&&digest(old)!==digest(binding))bad('import_evidence_bundle','Integrity binding identifier conflicts with retained content');}
}
function getUnknown(ctx,id){const u=ctx.unknowns.get(id);if(!u)bad('unknown','Unknown identifier is not retained');return u;}
function checkLinks(a,ctx){
 for(const id of [...a.supporting_evidence_ids??[],...a.contradicting_evidence_ids??[],...a.resolution?.evidence_ids??[]])if(!ctx.ledger.has(id))bad('unknown','Evidence reference is not retained: '+id);
 for(const relation of a.relationships??[])if(!ctx.unknowns.has(relation.unknown_id))bad('unknown','Relationship target is not retained');
}
function resolutionValid(u,ctx){
 if(!u.resolution||u.status!=='resolved')return false;
 if(u.resolution.disposition!=='verified')return u.resolution.evidence_ids.length===0;
 return u.contradicting_evidence_ids.length===0 && u.resolution.evidence_ids.length>0 && u.resolution.evidence_ids.every(id=>{
  const e=ctx.ledger.get(id);
  return e && (!u.required_authority||e.authority===u.required_authority) && ranks[e.confidence]>=ranks[u.required_confidence] &&
   (!u.required_environment||Object.entries(u.required_environment).every(([k,v])=>v===null||e.environment?.[k]===v)) &&
   !e.limitations.some(l=>/unverified|not observed|unavailable|truncated/i.test(l));
 });
}
async function mutation(operation,params,u,ctx){
 const prior=ctx.unknowns.get(u.unknown_id),priorDigest=prior?digest(prior):null;
 const event=await ctx.evidence('unknown_mutation',{operation,...params},{unknown_id:u.unknown_id,revision:u.revision,status:u.status},{
  subject:null,authority:'analyst-inference',confidence:'observed',predicateType:'unknown-ledger-mutation',publish:false,
 });
 // Evidence preparation can yield. Reject a competing commit before publishing
 // either the event or its unknown revision.
 const retained=ctx.unknowns.get(u.unknown_id);
 if(operation==='record_unknown'){
  if(retained)bad(operation,'Question already retained in this scope; update its revision');
 }else if(!retained||digest(retained)!==priorDigest)bad(operation,'Revision conflict');
 u.mutation_evidence_ids=[...u.mutation_evidence_ids,event.evidence_id];
 u.revision_digest=revisionDigest(u);
 const heldEvent=structuredClone(event),heldUnknown=structuredClone(u);
 ctx.signal?.throwIfAborted();
 // No await separates the final cancellation check and these state writes.
 ctx.ledger.set(heldEvent.evidence_id,heldEvent);ctx.unknowns.set(u.unknown_id,heldUnknown);return {result:u};
}
export const handlers={
 get_evidence_bundle:async(a,ctx)=>({result:checkBundle(bundle(ctx))}),
 export_evidence_bundle:async(a,ctx)=>{
  const output=resolve(a.path), b=checkBundle(bundle(ctx));const data=JSON.stringify(b,null,2)+'\n';
  await writeFile(output,data,{flag:a.overwrite?'w':'wx',signal:ctx.signal});
  return {result:{path:output,bytes:Buffer.byteLength(data),records:b.records.length,unknowns:b.unknowns.length}};
 },
 import_evidence_bundle:async(a,ctx)=>{
  const bytes=await ctx.read(a.path);ctx.signal?.throwIfAborted();
  const b=checkBundle(JSON.parse(bytes.toString('utf8')));checkImportConflicts(ctx,b);
  const external=b.records.filter(r=>!nativeIdentity(r)),historicalUnknowns=b.unknowns.filter(u=>revisionDigest(u)!==u.revision_digest);
  const binding=external.length||historicalUnknowns.length?await ctx.evidence(bindingOperation,{}, {
   schema:'real.external-integrity.v1',records:external.map(r=>({evidence_id:r.evidence_id,sha256:digest(r)})),unknowns:historicalUnknowns.map(u=>({unknown_id:u.unknown_id,revision:u.revision,sha256:digest(u)})),
  },{subject:null,authority:'analyst-inference',confidence:'observed',publish:false,limitations:['Historical identifiers and revision digests are preserved as opaque reference data; their original digest algorithm and assertions were not verified.','This binding detects changes relative to the imported content. It does not certify the source, history, truth, or execution authority of that content.']}):null;
  // Binding preparation can yield; check retained revisions again before any
  // insertion so a concurrent change cannot be overwritten by a stale import.
  if(binding)checkImportConflicts(ctx,b,binding);
  const records=b.records.filter(r=>!ctx.ledger.has(r.evidence_id)).map(r=>structuredClone(r));
  const unknowns=b.unknowns.filter(u=>{const old=ctx.unknowns.get(u.unknown_id);return !old||digest(old)!==digest(u);}).map(u=>structuredClone(u));
  const unknowns_added=unknowns.filter(u=>!ctx.unknowns.has(u.unknown_id)).length,heldBinding=binding?structuredClone(binding):null;
  ctx.signal?.throwIfAborted();
  // No await separates the final cancellation check and synchronous commit.
  for(const r of records)ctx.ledger.set(r.evidence_id,r);
  for(const u of unknowns)ctx.unknowns.set(u.unknown_id,u);
  if(heldBinding&&!ctx.ledger.has(heldBinding.evidence_id))ctx.ledger.set(heldBinding.evidence_id,heldBinding);
  return {result:{imported:records.length,unknowns_added,total:ctx.ledger.size}};
 },
 record_unknown:async(a,ctx)=>{
  checkLinks(a,ctx);
  const scope_digest=ctx.target?.sha256??null;
  const u={unknown_id:identifier('unk',{question:a.question,domain:a.domain,scope_digest}),revision:1,previous_revision_digest:null,revision_digest:'',scope_digest,
   question:a.question,status:'open',severity:a.severity,domain:a.domain,supporting_evidence_ids:a.supporting_evidence_ids??[],contradicting_evidence_ids:a.contradicting_evidence_ids??[],
   required_authority:a.required_authority,required_confidence:a.required_confidence,required_environment:a.required_environment,recommended_probes:a.recommended_probes,relationships:a.relationships,resolution:null,mutation_evidence_ids:[]};
  if(ctx.unknowns.has(u.unknown_id))bad('record_unknown','Question already retained in this scope; update its revision');
  return mutation('record_unknown',a,u,ctx);
 },
 update_unknown:async(a,ctx)=>{
  const old=getUnknown(ctx,a.unknown_id);if(a.expected_revision!==old.revision)bad('update_unknown','Revision conflict');
  checkLinks(a,ctx);
  const {expected_revision,...changes}=a;
  const u={...old,...changes,revision:old.revision+1,previous_revision_digest:old.revision_digest};
  if(u.status==='resolved'&&!resolutionValid(u,ctx))bad('update_unknown','Resolution requirements are not satisfied by retained evidence');
  if(u.status!=='resolved'&&u.resolution)bad('update_unknown','Resolution requires resolved status');
  return mutation('update_unknown',a,u,ctx);
 },
 list_unknowns:async(a,ctx)=>{let items=[...ctx.unknowns.values()];for(const k of ['status','severity','domain'])if(a[k])items=items.filter(u=>u[k]===a[k]);return {result:{items:structuredClone(items),total:items.length}};},
 verify_unknown_resolution:async(a,ctx)=>{const u=getUnknown(ctx,a.unknown_id);return {result:{valid:revisionDigest(u)===u.revision_digest&&resolutionValid(u,ctx),truthVerified:false,unknown:structuredClone(u)}};},
 inspect_analysis_view:async(a,ctx)=>{
  const e=a.source.kind==='inline'?a.source.evidence:ctx.ledger.get(a.source.evidence_id);
  if(!e)bad('inspect_analysis_view','Evidence is not retained');
  if(!validRecordIdentity(e,externalBindings([...ctx.ledger.values()])))bad('inspect_analysis_view','Evidence content digest mismatch');
  if(!validate(e.operation,'output',e).valid)bad('inspect_analysis_view','Evidence violates its operation output contract');
  if(!['inspect_binary_layout','analyze_javascript_application','analyze_function'].includes(e.operation))bad('inspect_analysis_view','Evidence operation does not have a supported analysis view');
  const n=e.normalized_result,v=a.view,limitations=[...e.limitations],unknowns=[];
  if(!nativeIdentity(e))limitations.push('Historical evidence identity is opaque; original content identity and assertions are unverified.');
  let selected,key,count,total;
  if(v.kind==='summary'){
   if(e.operation==='inspect_binary_layout')selected={bytes:n.artifact.bytes,format:n.format,architecture:n.architecture,image_type:n.image_type,entry:n.entry_point,counts:{sections:n.sections?.length??0,segments:n.segments?.length??0,symbols:n.symbols?.length??0,relocations:n.relocations?.length??0},limitation_count:limitations.length};
   else if(e.operation==='analyze_javascript_application')selected={input_path:n.input_path,format:n.format,root_artifact_sha256:n.root_artifact_sha256,statistics:n.statistics,electron:n.summary,coverage:n.graph.coverage,limitation_count:limitations.length};
   else bad('inspect_analysis_view','Native functions use native facets');
   key='summary';count=total=1;
  }else if(v.kind==='facet'){selected=n[v.facet]??null;key='facet';count=total=selected===null?0:1;}
  else if(v.kind==='native'){
   const flow=n.native_value_flow;
   const flowField={value_flow_operations:'operations',value_flow_def_use:'def_use_edges',value_flow_effects:'effects',value_flow_parameters:'parameters',value_flow_parameter_uses:'parameter_uses'}[v.facet];
   selected=v.facet==='value_flow_summary'?flow?{available:flow.available,provenance:flow.provenance??null,reason:flow.reason??null,truncated:flow.truncated??null,counts:flow.available?Object.fromEntries(['operations','def_use_edges','effects','parameters','parameter_uses'].map(k=>[k,flow[k]?.length??null])):null}:null:flowField?flow?.[flowField]??null:n[v.facet]??null;
   if(selected===null)unknowns.push('Facet was not observed');
   total=Array.isArray(selected)?selected.length:selected===null?0:1;
   if(Array.isArray(selected))selected=selected.slice(v.offset,v.offset+v.limit);
   count=Array.isArray(selected)?selected.length:selected===null?0:1;key='item';
  }else{
   const collection=n[v.collection]?.items??n[v.collection]??(v.collection==='modules'&&n.semantic_graph?n.semantic_graph.nodes.filter(n=>n.kind==='module'):[]);
   if(!Array.isArray(collection))bad('inspect_analysis_view','Collection is not an array');
   total=collection.length;
   if(v.kind==='page'){selected=collection.slice(v.offset,v.offset+v.limit);key='items';count=selected.length;}
   else {const entries=Object.entries(v.selector).filter(([k])=>k!=='kind');const matches=collection.filter((item,i)=>entries.every(([k,val])=>k==='index'||k==='ordinal'?i===val:item[k]===val));selected=matches.length===1?matches[0]:null;if(matches.length>1)unknowns.push('Selector is ambiguous; supply an exact ordinal');key='item';count=selected===null?0:1;}
  }
  const offset=v.offset??0,next=['page','native'].includes(v.kind)&&offset+count<total?offset+count:null;
  const out={kind:v.kind,view:v,[key]:selected,parent_evidence_id:e.evidence_id,parent_operation:e.operation,parent_digest:digest(e),view_digest:digest({view:v,value:selected}),artifact:{path:e.subject?.local_path??n.input_path??'',sha256:e.subject?.digest.sha256??n.root_artifact_sha256??digest(e)},coverage:{status:count===0?'empty':next===null?'complete-within-view':'page',examined:count,total,next_offset:next,exhausted:next===null},limitations,unknowns};
  if(v.kind==='native')out.procedure_address=n.procedure?.address??n.address??null;
  return ctx.evidence('inspect_analysis_view',a,out,{subject:e.subject,links:[e.evidence_id],confidence:'derived',authority:e.authority,limitations});
 },
};
