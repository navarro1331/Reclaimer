import { id,sha,canonical } from './javascript-model.mjs';

const GROUPS={status:['unowned','characterized','implemented','verified','contradicted','blocked','out-of-scope','unknown'],layer:['cli','protocol','electron','persistence','process','runtime','packaging','native-abi','application','other'],authority:['candidate','observed','reviewed','unknown']};
function grouped(values,keys){return keys.map(key=>({key,count:values.filter(v=>v===key).length}));}
function recordMap(bundle){const records=new Map();for(const record of bundle?.records??[]){const prior=records.get(record.evidence_id);if(prior&&canonical(prior)!==canonical(record))throw Object.assign(new Error('One evidence ID is assigned conflicting retained records'),{code:'CONFLICTING_EVIDENCE'});records.set(record.evidence_id,record);}return records;}
function originalAuthority(e,required){if(!e)return false;if(required==='static')return e.authority==='shipped-artifact';if(required==='runtime')return ['controlled-replay','external-service'].includes(e.authority);if(required==='process')return e.authority==='controlled-replay';return e.authority==='external-service';}
async function build(args,ctx) {
  const records=recordMap(args.evidence_bundle),bindings=args.manifest?.bindings??[],contradictions=args.manifest?.contradictions??[],obligations=[];
  for(const reviewed of args.reviewed_obligations??[]) {
    const candidates=bindings.filter(b=>b.obligation_id===reviewed.obligation_id),binding=candidates.length===1?candidates[0]:null,diagnostics=[];
    const add=(code,detail)=>diagnostics.push({code,detail});
    if(!binding)add(candidates.length?'ambiguous-owner':'missing-owner',candidates.length?'Multiple owner bindings prevent selecting an implementation':'No implementation owner is bound');
    if(args.reviewed_obligations.filter(o=>o.obligation_id===reviewed.obligation_id).length>1)add('duplicate-definition','Multiple reviewed definitions share one obligation ID');
    const original=(binding?.original_cases??[]).filter(c=>originalAuthority(records.get(c.evidence_id),reviewed.required_original_authority));
    for(const kind of reviewed.required_case_kinds) {
      if(!original.some(c=>c.kind===kind))add('missing-original-case',`Missing ${kind} original observation at ${reviewed.required_original_authority} authority`);
      if(!binding?.fixtures.some(f=>f.case_kind===kind&&f.authority===reviewed.required_fixture_authority&&f.evidence_ids.length&&f.evidence_ids.every(e=>records.has(e))))add('missing-case',`Missing ${kind} fixture at ${reviewed.required_fixture_authority} authority`);
    }
    if(reviewed.requires_parser_type&&!binding?.parser_type)add('missing-parser-type','Obligation requires a parser/schema/domain type binding');
    const verifier=binding?.verifier,verifierRecord=verifier?records.get(verifier.result_evidence_id):null,recordedStatus=verifierRecord?.normalized_result?.status??verifierRecord?.normalized_result?.result?.status;
    if(!verifier)add('missing-verifier','No verifier is bound');
    else {
      if(verifier.authority!==reviewed.required_verifier_authority)add('weak-verifier-authority','Verifier authority does not match the obligation');
      if(!verifier.enumerated_obligation_ids.includes(reviewed.obligation_id))add('verifier-does-not-enumerate','Verifier does not enumerate this obligation');
      if(!records.has(verifier.result_evidence_id))add('missing-verifier-result','Verifier result evidence is absent from the supplied bundle');
      else if(recordedStatus!=='pass')add(recordedStatus==='fail'?'verifier-failed':'missing-verifier-result','Retained verifier evidence does not contain a passing result');
      if(verifier.status!=='pass')add(verifier.status==='fail'?'verifier-failed':'missing-verifier-result',`Verifier result is ${verifier.status}`);
    }
    const claims=contradictions.filter(c=>c.obligation_id===reviewed.obligation_id),contradiction=claims.find(c=>c.evidence_ids.some(e=>records.has(e))),reviewRecords=reviewed.review_evidence_ids.filter(e=>records.has(e));
    if(contradiction)add('contradiction','Retained contradiction evidence intersects the obligation');
    if(claims.some(c=>!c.evidence_ids.length||c.evidence_ids.some(e=>!records.has(e))))add('contradiction-evidence-missing','A declared contradiction has missing supporting evidence');
    if(reviewed.residual_unknown_ids.length)add('residual-unknown','Residual unknowns remain attached to the obligation');
    let status=reviewed.disposition==='out-of-scope'?'out-of-scope':reviewed.disposition==='blocked'||reviewed.unavailable_authority.length?'blocked':contradiction||verifier?.status==='fail'||recordedStatus==='fail'?'contradicted':!binding?'unowned':!diagnostics.length?'verified':original.length?'implemented':'characterized';
    if(!reviewRecords.length){add('static-only','Review references are not present in the bundle');if(status==='verified')status='unknown';}
    const refs=[...new Set([...reviewRecords,...original.map(c=>c.evidence_id)])].map(e=>({evidence_id:e,authority:records.get(e).authority,state:reviewRecords.includes(e)?'reviewed':records.get(e).confidence==='observed'?'observed':'candidate',location:reviewed.target.location}));
    const {disposition,review_evidence_ids,...rest}=reviewed;
    obligations.push({...rest,origin:'reviewed',authority_references:refs,source_state:reviewRecords.length?'reviewed':'unknown',observed_cases:original,binding,status,diagnostics});
  }
  // Evidence records generate candidates, never reviewed obligations or active authority.
  for(const evidence of records.values()) {
    const sem=evidence.normalized_result?.semantic_graph;
    if(!sem?.nodes)continue;
    for(const n of sem.nodes.filter(n=>['function','call-site','boundary','resource','request','child-process','timer'].includes(n.kind))) {
      const obligation_id=`candidate.${n.node_id}`,unknowns=(sem.unknowns??[]).filter(u=>u.node_id===n.node_id).map(u=>u.unknown_id);
      obligations.push({obligation_id,obligation_version:1,title:n.label??n.kind,origin:'generated',application_layer:'application',family:n.kind,target:{artifact_sha256:n.identity.artifact_sha256,application_node_id:n.application_node_ids[0]??null,semantic_node_id:n.node_id,location:n.identity.module_path},authority_references:[{evidence_id:evidence.evidence_id,authority:evidence.authority,state:'candidate',location:n.identity.module_path}],source_state:'candidate',observed_cases:[],required:false,required_case_kinds:['positive','negative'],required_original_authority:'static',required_fixture_authority:'unit',required_verifier_authority:'unit',requires_parser_type:false,dependency_obligation_ids:[],residual_unknown_ids:unknowns,unavailable_authority:[],required_next_evidence:['Review the candidate and bind characterization cases before making it required'],binding:null,status:'unowned',diagnostics:[{code:'static-only',detail:'Generated from static syntax; human review is not inferred'}]});
    }
  }
  const byId=new Map(obligations.map(o=>[o.obligation_id,o]));
  // Propagate open dependencies until order no longer influences closure.
  let changed=true;while(changed){changed=false;for(const o of obligations)for(const dep of o.dependency_obligation_ids)if(!byId.has(dep)||byId.get(dep).status!=='verified') {
    const code=byId.has(dep)?'dependency-open':'dependency-missing',detail=`Dependency ${dep} is missing or unverified`;
    if(!o.diagnostics.some(d=>d.code===code&&d.detail===detail))o.diagnostics.push({code,detail});if(o.status==='verified'){o.status='implemented';changed=true;}
  }}
  const required=obligations.filter(o=>o.required&&o.status!=='out-of-scope'),open=required.filter(o=>o.status!=='verified'),failed=required.some(o=>o.status==='contradicted'),status=failed?'failed':!required.length?'unknown':open.length?'open':'ready',links=[...records.keys()];
  const result={schema:'ReconstructionObligationLedger',ledger_id:id('rol',{obligations,links}),closure_digest:sha({obligations,manifest:args.manifest??null}),status,coverage:{status:'complete'},summary:{total:obligations.length,required:required.length,verified:obligations.filter(o=>o.status==='verified').length,required_open:open.length,by_status:grouped(obligations.map(o=>o.status),GROUPS.status),by_application_layer:grouped(obligations.map(o=>o.application_layer),GROUPS.layer),by_evidence_authority:grouped(obligations.map(o=>o.source_state),GROUPS.authority)},reports:{missing_owner_obligation_ids:obligations.filter(o=>!o.binding).map(o=>o.obligation_id),missing_verifier_obligation_ids:obligations.filter(o=>!o.binding?.verifier).map(o=>o.obligation_id),contradicted_obligation_ids:obligations.filter(o=>o.status==='contradicted').map(o=>o.obligation_id),residual_unknown_ids:[...new Set(obligations.flatMap(o=>o.residual_unknown_ids))]},ownership_graph:obligations.filter(o=>o.binding).map(o=>({obligation_id:o.obligation_id,module_path:o.binding.owner.module_path,symbol:o.binding.owner.symbol})),dependency_graph:obligations.flatMap(o=>o.dependency_obligation_ids.map(dep=>({obligation_id:o.obligation_id,depends_on_obligation_id:dep}))),obligations,evidence_links:links,limitations:['Candidate obligations are static-analysis suggestions; reviewed references and verifier claims are evaluated only within the supplied evidence bundle','This operation does not execute verifiers or approve reconstruction authority']};
  return ctx.evidence('build_reconstruction_obligation_ledger',args,result,{links,confidence:'derived',authority:'analyst-inference',limitations:result.limitations});
}
async function evaluate(args,ctx) {
  const c=args.coverage,boundary=c.boundaries.find(b=>b.boundary_id===args.boundary_id);
  if(!boundary)throw Object.assign(new Error('Requested reconstruction boundary is absent'),{code:'INVALID_BOUNDARY'});
  const reasons=[],add=(code,subject_id,detail)=>reasons.push({code,subject_id,detail}),records=recordMap(c.evidence_bundle),surfaceIds=new Set(boundary.required_surface_ids),claimIds=new Set(boundary.required_claim_ids),now=Date.now();
  // Required claims and recursive surface dependencies remain inside the selected boundary's proof closure.
  for(const claim of c.claims.filter(cl=>claimIds.has(cl.claim_id)))for(const surface of claim.surface_ids)surfaceIds.add(surface);
  const queue=[...surfaceIds];for(let i=0;i<queue.length;i++){const surface=c.surfaces.find(s=>s.surface_id===queue[i]);for(const dependency of surface?.dependency_surface_ids??[])if(!surfaceIds.has(dependency)){surfaceIds.add(dependency);queue.push(dependency);}}
  for(const s of surfaceIds) {
    const surface=c.surfaces.find(x=>x.surface_id===s);if(!surface){add('surface-missing',s,'Required surface is missing');continue;}
    for(const dep of surface.dependency_surface_ids)if(!c.surfaces.some(x=>x.surface_id===dep))add('dependency-surface-missing',s,`Dependency surface ${dep} is missing`);
    const owners=c.owners.filter(o=>o.surface_id===s);
    if(!owners.length){add('owner-missing',s,'Required surface has no owner');continue;}
    if(owners.length!==1){add('owner-duplicate',s,'Required surface has multiple owners');continue;}
    const o=owners[0].ownership;
    if(o.disposition!=='implemented'&&!boundary.allowed_dispositions.includes(o.disposition))add('disposition-not-allowed',s,`Disposition ${o.disposition} is not allowed`);
    if(o.disposition==='implemented') {
      if(o.path_state!=='present')add(o.path_state==='missing'?'owner-path-missing':'owner-path-unknown',s,'Owner path is not confirmed present');
      if(o.package_state!=='distributed')add(o.package_state==='missing'?'owner-undistributed':'owner-distribution-unknown',s,'Owner is not confirmed in the distributed package');
      if(o.authority_route!=='none')add(o.authority_route==='detected'?'authority-routing-detected':'authority-routing-unknown',s,'Authority routing is detected or unverified');
    }
  }
  for(const cl of boundary.required_claim_ids) {
    const claim=c.claims.find(x=>x.claim_id===cl);if(!claim){add('claim-missing',cl,'Required claim is missing');continue;}
    const contracts=c.verifier_contracts.filter(v=>v.claim_ids.includes(cl));
    if(!contracts.length){add('verifier-missing',cl,'No verifier contract covers this claim');continue;}
    if(contracts.length!==1){add('verifier-duplicate',cl,'Multiple verifier contracts cover the claim');continue;}
    const v=contracts[0],results=c.verifier_results.filter(r=>r.verifier_id===v.verifier_id).sort((a,b)=>Date.parse(b.observed_at)-Date.parse(a.observed_at)||Number(b.status==='fail')-Number(a.status==='fail')||sha(a).localeCompare(sha(b))),r=results[0];
    if(!r){add('verifier-result-missing',cl,'No verifier result supplied');continue;}
    if(results.some(other=>Date.parse(other.observed_at)===Date.parse(r.observed_at)&&canonical(other)!==canonical(r)))add('verifier-result-incompatible',cl,'Conflicting verifier results share the latest observation time; input order cannot select an authoritative result');
    if(now-Date.parse(r.observed_at)>v.max_age_ms||Date.parse(r.observed_at)>now+60000)add('verifier-result-stale',cl,'Verifier result lies outside its freshness window');
    const surfaces=claim.surface_ids.map(s=>c.surfaces.find(x=>x.surface_id===s)),artifacts=surfaces.map(s=>s?c.artifacts.find(a=>a.artifact_id===s.artifact_id):null),artifactHashes=artifacts.filter(Boolean).map(a=>a.artifact_sha256),ownerHashes=claim.surface_ids.flatMap(s=>c.owners.filter(o=>o.surface_id===s&&o.ownership.disposition==='implemented').map(o=>o.ownership.owner_sha256));
    const retainedResultStatuses=r.evidence_ids.map(e=>records.get(e)?.normalized_result?.status).filter(s=>s!==undefined);
    if(surfaces.some(s=>!s)||artifacts.some(a=>!a)||v.normalization_removes_dimensions||r.contract_sha256!==v.contract_sha256||r.normalization_sha256!==v.normalization_sha256||r.repeats<v.minimum_repeats||v.authority!==claim.required_authority||!r.covered_claim_ids.includes(cl)||!claim.required_dimensions.every(d=>v.dimensions.includes(d)&&r.covered_dimensions.includes(d))||!artifactHashes.every(h=>r.artifact_sha256s.includes(h))||!ownerHashes.every(h=>r.owner_sha256s.includes(h))||!r.evidence_ids.length||r.evidence_ids.some(e=>!records.has(e))||retainedResultStatuses.some(s=>s==='fail'))add('verifier-result-incompatible',cl,'Result does not bind all required contracts, preserved dimensions, artifact/owner digests, repetitions and evidence');
    if(r.status==='fail')add('verifier-failed',cl,'Verifier failed');else if(r.status!=='pass')add('verifier-unknown',cl,`Verifier status is ${r.status}`);
  }
  for(const u of c.residual_unknown_ids)if(!boundary.allowed_unknown_ids.includes(u))add('active-unknown',u,'Residual unknown is outside the allowed boundary exceptions');
  for(const u of c.evidence_bundle.unknowns??[])if(u.status!=='resolved'&&!boundary.allowed_unknown_ids.includes(u.unknown_id))add('active-unknown',u.unknown_id,'Evidence bundle includes an unresolved unknown');
  for(const con of c.contradictions)if(con.status==='active'&&(con.surface_ids.some(s=>surfaceIds.has(s))||con.claim_ids.some(s=>claimIds.has(s))))add('active-contradiction',con.contradiction_id,'Active contradiction intersects the required boundary');
  for(const kind of boundary.required_package_proof_kinds) {
    const proofs=c.package_proofs.filter(p=>p.kind===kind),subject=boundary.boundary_id;
    const boundaryHashes=[...surfaceIds].map(s=>c.surfaces.find(x=>x.surface_id===s)?.artifact_id).filter(Boolean).map(a=>c.artifacts.find(x=>x.artifact_id===a)?.artifact_sha256).filter(Boolean);
    if(!proofs.length)add('package-proof-missing',subject,`Required ${kind} proof is missing`);
    else if(proofs.some(p=>p.status==='fail'))add('package-proof-failed',subject,`${kind} proof failed`);
    else if(!proofs.some(p=>p.status==='pass'&&p.evidence_ids.length&&p.evidence_ids.every(e=>records.has(e))&&p.artifact_sha256s.length&&boundaryHashes.every(h=>p.artifact_sha256s.includes(h))))add('package-proof-unknown',subject,`${kind} proof lacks passing evidence for all boundary artifacts`);
  }
  const failed=reasons.some(r=>['verifier-failed','package-proof-failed','active-contradiction','authority-routing-detected'].includes(r.code)),unknownOnly=reasons.length&&reasons.every(r=>r.code.includes('unknown'));
  return {boundary_id:boundary.boundary_id,status:failed?'failed':!reasons.length?'ready':unknownOnly?'unknown':'partial',summary:{required_surfaces:boundary.required_surface_ids.length,required_claims:boundary.required_claim_ids.length,reasons:reasons.length},reasons,recommended_probes:reasons.map(r=>({operation:r.code.startsWith('owner')?'inspect_reconstruction_owner':r.code.startsWith('verifier')?'run_reconstruction_verifier':'collect_reconstruction_evidence',subject_id:r.subject_id,rationale:r.detail})),evidence_ids:[...new Set([...c.verifier_results.flatMap(r=>r.evidence_ids),...c.package_proofs.flatMap(r=>r.evidence_ids)].filter(e=>records.has(e)))]};
}
export const obligationHandlers={build_reconstruction_obligation_ledger:build,evaluate_reconstruction_coverage:evaluate};
