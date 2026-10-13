import { digest, identifier, InvestigationError } from './core.mjs';
const bad=(op,msg)=>{throw new InvestigationError('input',op,msg);};
const uncertain=status=>['unknown','truncated','contradiction'].includes(status);
const changed=status=>['changed','added','removed'].includes(status);
const emit=(ctx,op,a,r)=>ctx.evidence(op,a,r,{subject:null,links:r.evidence_links,confidence:'derived',authority:'analyst-inference',limitations:r.limitations});
export const handlers={
 correlate_static_and_runtime:async(a,ctx)=>{
  const sm=new Map(a.static_comparisons.map(e=>[e.evidence_id,e])),rm=new Map(a.runtime_comparisons.map(e=>[e.evidence_id,e])),summary={hypotheses:0,contradictions:0,unresolved:0};
  const items=a.mappings.map(m=>{
   const se=sm.get(m.static.comparison_evidence_id),re=rm.get(m.runtime.comparison_evidence_id);
   if(!se||!re)bad('correlate_static_and_runtime','Mapping does not refer to supplied comparison evidence');
   const sel=m.static.selector,n=se.normalized_result;
   const ss=sel.kind==='artifact'?n.changes?.find(c=>c.logical_path===sel.logical_path)?.classification??(n.status==='unchanged'?'unchanged':'unknown'):n.dimensions?.find(d=>d.dimension===sel.dimension)?.status??'unknown';
   const runtimeDimension=re.normalized_result.dimensions?.find(d=>d.dimension===m.runtime.dimension)??re.normalized_result[m.runtime.dimension];
   const rs=typeof runtimeDimension==='string'?runtimeDimension:runtimeDimension?.status??'unknown';
   const observed_pattern=ss==='truncated'||rs==='truncated'?'truncated':uncertain(ss)||uncertain(rs)?'unknown':changed(ss)?changed(rs)?'cochanged':'static_only':changed(rs)?'runtime_only':'both_unchanged';
   const classification=['unknown','truncated'].includes(observed_pattern)?'unresolved_branch':observed_pattern===m.hypothesis.expected_pattern?'hypothesis':'contradiction';
   summary[{hypothesis:'hypotheses',contradiction:'contradictions',unresolved_branch:'unresolved'}[classification]]++;
   return {correlation_id:identifier('cor',{mapping:m,se:se.evidence_id,re:re.evidence_id}),static:{...m.static,status:ss,conclusion_kind:uncertain(ss)?'unresolved_branch':'derived_relationship'},runtime:{...m.runtime,status:rs},side_alignment:m.side_alignment,hypothesis:m.hypothesis,observed_pattern,classification,evidence_links:[se.evidence_id,re.evidence_id],limitations:['A correlation does not establish causation.']};
  });
  return emit(ctx,'correlate_static_and_runtime',a,{status:summary.contradictions?'contradicted':summary.unresolved?'unknown':'correlated',summary,correlations:{items},evidence_links:[...sm.keys(),...rm.keys()],limitations:['Mappings are analyst hypotheses; paired observations constrain, but do not prove, their explanation.']});
 },
 verify_reconstruction:async(a,ctx)=>{
  const summary={total:a.specification.claims.length,passed:0,failed:0,unknown:0,behavioral:0,structural:0},evidence_links=new Set(),recommended_probes=[];
  const items=a.specification.claims.map(c=>{
   const e=ctx.ledger.get(c.comparison_evidence_id);
   if(!e)bad('verify_reconstruction','Comparison evidence must be retained before verification');
   const expected=c.kind==='behavioral'?'compare_process_captures':c.kind==='structural-function'?'compare_functions':'compare_artifacts';
   if(e.operation!==expected)bad('verify_reconstruction','Claim kind does not match comparison operation');
   const n=e.normalized_result,dimension=n.dimensions?.find(d=>d.dimension===c.dimension)??n[c.dimension];
   const observed_status=c.dimension==='overall'?n.status:typeof dimension==='string'?dimension:dimension?.status??'unknown';
   const linked=e.evidence_links.map(id=>ctx.ledger.get(id)).filter(Boolean);
   const left=linked.find(v=>v.evidence_id===(e.parameters.left?.evidence_id??n.left_evidence_id))??linked[0],right=linked.find(v=>v.evidence_id===(e.parameters.right?.evidence_id??n.right_evidence_id))??linked[1];
   if(!left||!right)bad('verify_reconstruction','Both comparison source records must be retained');
   const behaviorReady=c.kind!=='behavioral'||[left,right].every(v=>v.authority==='controlled-replay'&&v.confidence==='observed');
   const status=!behaviorReady||uncertain(observed_status)?'unknown':observed_status==='unchanged'?'pass':'fail';
   summary[{pass:'passed',fail:'failed',unknown:'unknown'}[status]]++;summary[c.kind==='behavioral'?'behavioral':'structural']++;
   const links=[e.evidence_id,left.evidence_id,right.evidence_id];links.forEach(id=>evidence_links.add(id));
   const unknown_ids=[...ctx.unknowns.values()].filter(u=>u.supporting_evidence_ids.includes(e.evidence_id)||u.contradicting_evidence_ids.includes(e.evidence_id)).map(u=>u.unknown_id);
   if(status==='unknown')recommended_probes.push({operation:expected,rationale:'Collect complete comparable evidence for this claim',claim_ids:[c.claim_id],unknown_ids});
   return {claim_id:c.claim_id,kind:c.kind,dimension:c.dimension,status,observed_status,comparison_evidence_id:e.evidence_id,left_evidence_ids:[left.evidence_id],right_evidence_ids:[right.evidence_id],evidence_links:links,unknown_ids,limitations:behaviorReady?e.limitations:['Behavioral claims require observed controlled replays on both sides']};
  });
  const result={status:summary.failed?'fail':summary.unknown?'unknown':'pass',specification_sha256:digest(a.specification),summary,claims:{items},recommended_probes,evidence_links:[...evidence_links],limitations:['Verification applies only to the supplied claims and retained evidence.']};
  return emit(ctx,'verify_reconstruction',a,result);
 },
};
