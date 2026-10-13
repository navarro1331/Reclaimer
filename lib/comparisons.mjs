import { diffLines } from 'diff';
import { digest, identifier, canonical, InvestigationError } from './core.mjs';
import { checkBundle } from './evidence.mjs';
const error=(op,msg)=>{throw new InvestigationError('input',op,msg);};
const eq=(a,b)=>canonical(a)===canonical(b);
const links=(a,b)=>[a.evidence_id,b.evidence_id];
const emit=(ctx,op,a,r,l)=>ctx.evidence(op,a,r,{subject:null,links:l,confidence:'derived',authority:'analyst-inference',limitations:r.limitations??[]});
function manifest(e){let n=e.normalized_result;n=n?.manifest??n?.substeps?.find(s=>s.operation==='inventory_artifact')?.evidence?.normalized_result?.manifest??n;if(!n?.manifest_id||!Array.isArray(n.occurrences)||!Array.isArray(n.artifacts))error('compare_artifacts','An artifact manifest is required');return n;}
function occurrenceMap(n){return new Map(n.occurrences.map(o=>[o.logical_path,{o,a:n.artifacts.find(a=>a.artifact_id===o.artifact_id)}]));}
function functionPart(n,key){
 if(n.procedure?.body?.available===false&&['pseudocode','assembly','cfg'].includes(key))return undefined;
 if(['calls','references','strings_names'].includes(key)){
  const fields={calls:['callers','callees'],references:['incoming_references','outgoing_references'],strings_names:['referenced_strings','referenced_names']}[key];
  if(fields.some(field=>n[field]===undefined))return undefined;
  return Object.fromEntries(fields.map(field=>[field,n[field]]));
 }
 const mapping={identity:'procedure',pseudocode:'pseudocode',assembly:'assembly',comments:'comments',calls:'callees',references:'outgoing_references',strings_names:'referenced_strings',cfg:'basic_blocks'};
 const field=mapping[key];const value=n[field];
 if(value?.state==='unavailable'||value?.status==='unavailable'||value===undefined)return undefined;
 return value?.state==='available'?value.value:value;
}
function resultStatus(counts){return counts.unknown||counts.unresolved?'unknown':Object.entries(counts).some(([k,v])=>v&&!/unchanged/.test(k))?'changed':'unchanged';}
export const handlers={
 compare_artifacts:async(a,ctx)=>{
  const l=manifest(a.left),r=manifest(a.right),lm=occurrenceMap(l),rm=occurrenceMap(r),changes=[],summary={unchanged:0,added:0,removed:0,changed:0,unknown:0,contradiction:0};
  for(const p of new Set([...lm.keys(),...rm.keys()])){
   const left=lm.get(p),right=rm.get(p),dimensions=[];
   if(left&&right)for(const [key,dim]of [['sha256','content'],['kind','kind'],['format','format'],['size','size'],['executable','executable'],['metadata','metadata']]){
    const x=key==='sha256'?left.a?.digest?.sha256??left.a?.sha256:left.a?.[key],y=key==='sha256'?right.a?.digest?.sha256??right.a?.sha256:right.a?.[key];
    if(x!==undefined&&y!==undefined&&!eq(x,y))dimensions.push(dim);
   }
   const leftComplete=l.coverage?.status==='complete'||l.coverage?.status==='complete-within-inputs'||l.coverage?.complete===true;
   const rightComplete=r.coverage?.status==='complete'||r.coverage?.status==='complete-within-inputs'||r.coverage?.complete===true;
   const leftHash=left?.a?.digest?.sha256??left?.a?.sha256,rightHash=right?.a?.digest?.sha256??right?.a?.sha256;
   const classification=!left?leftComplete?'added':'unknown':!right?rightComplete?'removed':'unknown':!left.a||!right.a||!leftHash||!rightHash?'unknown':dimensions.length?'changed':'unchanged';
   summary[classification]++;
   if(classification!=='unchanged')changes.push({classification,logical_path:p,dimensions:dimensions.length?dimensions:['availability'],left_occurrence_id:left?.o.occurrence_id??null,right_occurrence_id:right?.o.occurrence_id??null,left_artifact_id:left?.o.artifact_id??null,right_artifact_id:right?.o.artifact_id??null,evidence_links:links(a.left,a.right)});
  }
  const limitations=[...a.left.limitations,...a.right.limitations];
  return emit(ctx,'compare_artifacts',a,{status:summary.unknown?'unknown':changes.length?'changed':'unchanged',left_manifest_id:l.manifest_id,right_manifest_id:r.manifest_id,summary,changes,limitations},links(a.left,a.right));
 },
 compare_functions:async(a,ctx)=>{
  const l=a.left.normalized_result.result??a.left.normalized_result,r=a.right.normalized_result.result??a.right.normalized_result;
  const ln=l.procedure?.name??l.name??'',rn=r.procedure?.name??r.name??'';
  const function_match={status:ln&&ln===rn?'matched':!ln||!rn?'ambiguous':'mismatched',method:ln&&ln===rn?'symbol':'explicit',left_name:ln,right_name:rn};
  const dimensions=['identity','pseudocode','assembly','comments','calls','references','strings_names','cfg'].map(dimension=>{
   const x=functionPart(l,dimension),y=functionPart(r,dimension),unknown=x===undefined||y===undefined||function_match.status!=='matched',status=unknown?'unknown':eq(x,y)?'unchanged':'changed';
   const deltas=typeof x==='string'&&typeof y==='string'?diffLines(x,y):null;
   return {dimension,left_count:x===undefined?null:Array.isArray(x)?x.length:typeof x==='string'?x.split('\n').length:1,right_count:y===undefined?null:Array.isArray(y)?y.length:typeof y==='string'?y.split('\n').length:1,
    evidence_links:links(a.left,a.right),limitations:unknown?['A function dimension or an unambiguous symbol match is unavailable']:[],status,left_digest:unknown?null:digest(x),right_digest:unknown?null:digest(y),text_delta:unknown||!deltas?null:{added_lines:deltas.filter(d=>d.added).reduce((s,d)=>s+d.count,0),removed_lines:deltas.filter(d=>d.removed).reduce((s,d)=>s+d.count,0),hunks:deltas.filter(d=>d.added||d.removed).length},conclusion_kind:unknown?'unresolved_branch':'derived_relationship'};
  });
  const summary={unchanged:0,changed:0,unknown:0};dimensions.forEach(d=>summary[d.status]++);
  const result={status:resultStatus(summary),function_match,left_subject_sha256:a.left.subject?.digest.sha256??digest(a.left),right_subject_sha256:a.right.subject?.digest.sha256??digest(a.right),summary,dimensions,changes:dimensions.filter(d=>d.status!=='unchanged'),limitations:[...a.left.limitations,...a.right.limitations]};
  return emit(ctx,'compare_functions',a,result,links(a.left,a.right));
 },
 compare_bundles:async(a,ctx)=>{
  const leftBytes=await ctx.read(a.left_bundle_path),rightBytes=await ctx.read(a.right_bundle_path),l=checkBundle(JSON.parse(leftBytes)),r=checkBundle(JSON.parse(rightBytes)),changes=[];
  const summary={records_unchanged:0,records_added:0,records_removed:0,records_changed:0,unknowns_unchanged:0,unknowns_added:0,unknowns_removed:0,unknowns_advanced:0,unknowns_diverged:0,unresolved:0};
  const lm=new Map(l.records.map(e=>[e.evidence_id,e])),rm=new Map(r.records.map(e=>[e.evidence_id,e]));
  const pairs=a.record_pairs??[],pairedLeft=new Set(),pairedRight=new Set();for(const pair of pairs){if(pairedLeft.has(pair.left_evidence_id)||pairedRight.has(pair.right_evidence_id))error('compare_bundles','Explicit record pairs must be one-to-one');pairedLeft.add(pair.left_evidence_id);pairedRight.add(pair.right_evidence_id);const x=lm.get(pair.left_evidence_id),y=rm.get(pair.right_evidence_id);if(!x||!y)error('compare_bundles','Explicit record pair is absent');lm.delete(x.evidence_id);rm.delete(y.evidence_id);const identityConflict=x.evidence_id===y.evidence_id&&!eq(x,y);if(eq(x.normalized_result,y.normalized_result)&&!identityConflict){summary.records_unchanged++;continue;}summary.records_changed++;changes.push({entity:'evidence',key:x.evidence_id,classification:'changed',conclusion_kind:identityConflict?'contradiction':'observed_change',left_evidence_ids:[x.evidence_id],right_evidence_ids:[y.evidence_id],left_digest:digest(x),right_digest:digest(y),limitations:[]});}
  for(const id of new Set([...lm.keys(),...rm.keys()])){const x=lm.get(id),y=rm.get(id);if(x&&y){if(eq(x,y)){summary.records_unchanged++;continue;}summary.records_changed++;changes.push({entity:'evidence',key:id,classification:'changed',conclusion_kind:'contradiction',left_evidence_ids:[id],right_evidence_ids:[id],left_digest:digest(x),right_digest:digest(y),limitations:['The same opaque evidence identifier names different retained content; the source assertions are not reconciled.']});continue;}const classification=x?'removed':'added';summary['records_'+classification]++;changes.push({entity:'evidence',key:id,classification,conclusion_kind:'observed_change',left_evidence_ids:x?[id]:[],right_evidence_ids:y?[id]:[],left_digest:x?digest(x):null,right_digest:y?digest(y):null,limitations:[]});}
  const lu=new Map(l.unknowns.map(u=>[u.unknown_id,u])),ru=new Map(r.unknowns.map(u=>[u.unknown_id,u]));
  for(const id of new Set([...lu.keys(),...ru.keys()])){const x=lu.get(id),y=ru.get(id);if(x?.revision_digest===y?.revision_digest&&eq(x,y)){summary.unknowns_unchanged++;continue;}const identityConflict=x&&y&&x.revision_digest===y.revision_digest;const classification=!x?'added':!y?'removed':!identityConflict&&y.previous_revision_digest===x.revision_digest&&y.revision>x.revision?'history_advanced':'history_diverged';summary['unknowns_'+({history_advanced:'advanced',history_diverged:'diverged'}[classification]??classification)]++;changes.push({entity:'residual_unknown',key:id,classification,conclusion_kind:classification==='history_diverged'?'contradiction':'observed_change',left_evidence_ids:x?.mutation_evidence_ids??[],right_evidence_ids:y?.mutation_evidence_ids??[],left_digest:identityConflict?digest(x):x?.revision_digest??null,right_digest:identityConflict?digest(y):y?.revision_digest??null,limitations:identityConflict?['The same opaque revision digest names different unknown content; history is not reconciled.']:[]});}
  return emit(ctx,'compare_bundles',a,{status:resultStatus(summary),left_bundle_sha256:digest(leftBytes),right_bundle_sha256:digest(rightBytes),summary,changes,limitations:[]},[...l.records,...r.records].map(e=>e.evidence_id));
 },
 find_changed_behavior:async(a,ctx)=>{
  const summary={observed_changes:0,static_candidates:0,contradictions:0,unresolved:0},items=[];
  for(const e of a.comparisons){const n=e.normalized_result;const runtime=/process|web_capture|web_screenshot/.test(e.operation),rows=n.dimensions??n.changes??[{dimension:'overall',status:n.status??'unknown'}];for(const d of rows){
   const status=d.status??d.classification??'unknown';
   const classification=status==='contradiction'?'contradiction':status==='unknown'||status==='truncated'?'unresolved_branch':runtime?'observed_change':'derived_relationship';
   if(classification==='observed_change'&&status!=='unchanged')summary.observed_changes++;else if(classification==='derived_relationship'&&status!=='unchanged')summary.static_candidates++;else if(classification==='contradiction')summary.contradictions++;else if(classification==='unresolved_branch')summary.unresolved++;
   items.push({scope:runtime?'runtime':'static_candidate',dimension:d.dimension??d.logical_path??'overall',classification,status,source_comparison_id:e.evidence_id,evidence_links:[e.evidence_id,...e.evidence_links],limitations:d.limitations??e.limitations});
  }}
  const evidence_links=[...new Set(a.comparisons.flatMap(e=>[e.evidence_id,...e.evidence_links]))];
  const hasRuntime=a.comparisons.some(e=>/process|web_capture|web_screenshot/.test(e.operation));
  return emit(ctx,'find_changed_behavior',a,{behavior_status:summary.observed_changes?'observed_changed':!hasRuntime||summary.unresolved||summary.contradictions||summary.static_candidates?'unknown':'observed_unchanged',summary,findings:{items},evidence_links,limitations:['Static differences are behavioral hypotheses until a comparable controlled runtime observation supports them.']},evidence_links);
 },
 build_call_path:async(a,ctx)=>{
  const nodes=new Map(),edges=[];
  for(const e of a.functions){const n=e.normalized_result.result??e.normalized_result,p=n.procedure??n;const address=p.address;if(!address)continue;nodes.set(address,{address,name:p.name??null,evidence_links:[e.evidence_id]});for(const c of n.callees?.items??n.callees??[]){const dest=c.address??c.target;if(dest)edges.push({source:address,target:dest,evidence_links:[e.evidence_id]});}}
  const start=a.start.address,goal=a.goal.address,q=nodes.has(start)?[[start]]:[],seen=new Set(nodes.has(start)?[start]:[]);let path=null,depth=0;
  while(q.length){const p=q.shift();depth=Math.max(depth,p.length-1);const end=p.at(-1);if(end===goal){path=p;break;}for(const edge of edges.filter(e=>e.source===end))if(!seen.has(edge.target)){seen.add(edge.target);q.push([...p,edge.target]);}}
  const exhaustive=nodes.has(start)&&[...nodes.keys()].every(k=>edges.filter(e=>e.source===k).every(e=>nodes.has(e.target)))&&a.functions.every(e=>e.normalized_result.coverage?.status==='complete'||e.normalized_result.complete===true);
  const evidence_links=a.functions.map(e=>e.evidence_id),paths=path?[{hops:path.length-1,nodes:path.map(p=>nodes.get(p)??{address:p,name:null,evidence_links}),edges:path.slice(1).map((p,i)=>edges.find(e=>e.source===path[i]&&e.target===p)),evidence_links}]:[];
  return emit(ctx,'build_call_path',a,{start,goal,explored:{nodes:seen.size,edges:edges.length,depth_reached:depth},evidence_links,limitations:exhaustive?[]:['Provided call graph is partial; missing paths are unknown.'],status:path?'found':exhaustive?'not_found':'unknown',shortest_hops:path?path.length-1:null,search_scope:{exhaustive},paths},evidence_links);
 },
};
