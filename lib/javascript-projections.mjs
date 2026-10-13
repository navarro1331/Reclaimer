import path from 'node:path';
import { id,sha,coverage,fact,node,edge,graph,localIdentity,logical,properties,application } from './javascript-model.mjs';

function invRows(evidences,ctx,operation) {
  const flattened=evidences.flatMap(e=>e.normalized_result?.substeps?.map(s=>s.evidence)??[e]);let root=null,complete=true;const rows=[],symlinks=[];
  for(const e of flattened) {
    const r=e.normalized_result,g=r?.graph??r?.inventory??(r?.manifest?.occurrences?r.manifest:r);
    const subject=r?.manifest??r?.subject??g?.subject??g?.root??{};
    const rootHash=subject.root_sha256??g?.root_sha256??g?.root_artifact_sha256??e.subject?.digest?.sha256,rootFormat=subject.root_format??g?.root_format??e.subject?.format;
    if(rootHash&&rootFormat) {if(root&&root.sha256!==rootHash)throw Object.assign(new Error('Inventory roots disagree'),{code:'ROOT_MISMATCH'});root={sha256:rootHash,format:rootFormat};}
    const artifacts=new Map((g?.artifacts??[]).map(a=>[a.artifact_id,a]));
    const entries=g?.occurrences??g?.entries??g?.files??[];
    for(const entry of entries) {
      const art=artifacts.get(entry.artifact_id)??entry,p=entry.logical_path??entry.path??entry.name,hash=art.sha256??art.digest?.sha256;
      if(entry.entry_kind==='symlink'||entry.kind==='symlink'){if(p)symlinks.push(p);continue;}
      if(p&&hash&&/^[a-f0-9]{64}$/.test(hash))rows.push({path:p.replaceAll('\\','/'),artifact_id:art.artifact_id??id('art',hash),sha256:hash,format:art.format??entry.format??'unknown'});
    }
    const state=g?.coverage?.status??g?.coverage?.state??r?.coverage?.status;complete&&=['complete','complete-within-inventory','complete-within-substeps'].includes(state)&&!(g?.coverage?.truncated??false);
  }
  if(!root)ctx.unavailable(operation,'Supplied evidence has no concrete inventory root','Supply the inventory evidence nested in an artifact inspection');
  return {root,rows:[...new Map(rows.map(r=>[r.path,r])).values()],symlinks,complete,evidenceIds:evidences.map(e=>e.evidence_id)};
}
const cov = complete => ({status:complete?'complete-within-inventory':'partial',inventory_complete:complete});
const bridgeCov = (n,total=n) => ({status:n===total?'complete':'partial',total_candidates:total,emitted_candidates:n,omitted_candidates:total-n});
async function android(args,ctx) {
  const op='project_android_application_graph',i=invRows(args.inventory_evidence,ctx,op);if(i.root.format!=='apk')ctx.unavailable(op,'Inventory root is not an APK','Supply an APK inventory');
  const components={manifests:[],resources:[],dex:[],jvm_classes:[],native_libraries:[],javascript:[],signing:[]};
  for(const r of i.rows) {
    if(/(?:^|\/)AndroidManifest\.xml$/.test(r.path))components.manifests.push(r);
    else if(/(?:^|\/)(?:resources\.arsc|res\/)/.test(r.path))components.resources.push(r);
    if(/\.dex$/i.test(r.path))components.dex.push(r);if(/\.class$/i.test(r.path))components.jvm_classes.push(r);
    if(/\.so$/i.test(r.path))components.native_libraries.push(r);if(/\.(?:js|mjs|cjs|jsbundle)$/i.test(r.path))components.javascript.push(r);
    if(/^META-INF\/.*\.(?:RSA|DSA|EC|SF|MF)$/i.test(r.path))components.signing.push(r);
  }
  const families=[];if(components.dex.length)families.push('dalvik-art');if(components.jvm_classes.length)families.push('java-kotlin');if(components.native_libraries.length)families.push('native');if(components.javascript.length)families.push('javascript');
  for(const [family,re]of [['react-native',/reactnative|hermes|react-native/i],['flutter',/libflutter|flutter_assets/i],['unity',/libunity|unity3d/i]])if(i.rows.some(r=>re.test(r.path)))families.push(family);
  const bridges=[];let total=0;
  for(const managed of [...components.dex,...components.jvm_classes,...components.javascript])for(const native of components.native_libraries) {total++;if(bridges.length<2048)bridges.push({managed_path:managed.path,native_path:native.path,basis:families.includes('react-native')?'react-native-convention':families.includes('flutter')?'flutter-convention':families.includes('unity')?'unity-convention':'managed-and-native-content'});}
  const limitations=['Runtime families and bridge candidates use inventory path conventions; initialization, JNI registration, signatures and execution are not established'];
  const result={projection_id:id('adp',{root:i.root,components}),root_sha256:i.root.sha256,root_format:'apk',source_evidence_ids:i.evidenceIds,components,runtime_families:families,bridge_candidates:bridges,bridge_candidate_coverage:bridgeCov(bridges.length,total),coverage:cov(i.complete),limitations};return ctx.evidence(op,args,result,{links:i.evidenceIds,limitations,confidence:'derived'});
}
async function apple(args,ctx) {
  const op='project_apple_application_graph',i=invRows(args.inventory_evidence,ctx,op);if(!['ipa','directory','zip','dmg'].includes(i.root.format))ctx.unavailable(op,'Inventory root is not an Apple package or directory','Supply an IPA, ZIP, DMG or directory inventory');
  const components={bundle_metadata:[],executables:[],frameworks:[],native_libraries:[],javascript:[],signing:[],privileged_helpers:[],launchd_plists:[],helpers:[]},bundlePaths=new Set();
  for(const r of i.rows) {
    for(const m of r.path.matchAll(/(?:^|\/)([^/]+\.(?:app|appex|framework|xpc|bundle|plugin|systemextension|dext))(?=\/|$)/g))bundlePaths.add(r.path.slice(0,m.index+m[0].length));
    if(/(?:^|\/)Info\.plist$/.test(r.path))components.bundle_metadata.push(r);
    if(['mach-o','mach-o-universal'].includes(r.format))components.executables.push(r);
    if(/\.framework\//.test(r.path))components.frameworks.push(r);
    if(/\.(?:dylib|so|node)$/.test(r.path))components.native_libraries.push(r);
    if(/\.(?:js|mjs|cjs|jsbundle)$/.test(r.path))components.javascript.push(r);
    if(/(?:^|\/)(?:_CodeSignature|embedded\.mobileprovision)(?:\/|$)/.test(r.path))components.signing.push(r);
    if(/(?:^|\/)PrivilegedHelperTools\//.test(r.path))components.privileged_helpers.push(r);
    if(/(?:^|\/)Launch(?:Agents|Daemons)\/.*\.plist$/.test(r.path))components.launchd_plists.push({...r,domain:r.path.includes('LaunchAgents/')?'agent':'daemon'});
    if(/(?:^|\/)(?:Helpers|LoginItems)\//.test(r.path))components.helpers.push(r);
  }
  const sorted=[...bundlePaths].sort(),bundles=sorted.map(p=> {
    const ancestors=sorted.filter(a=>p.startsWith(`${a}/`)).sort((a,b)=>b.length-a.length),deep=i.rows.some(r=>r.path.startsWith(`${p}/Contents/`)),suffix=path.posix.extname(p);
    const role=suffix==='.appex'?'app-extension':suffix==='.xpc'?'xpc-service':suffix==='.framework'?'framework':suffix==='.systemextension'?'system-extension':suffix==='.dext'?'driver-extension':suffix==='.plugin'?'plug-in':suffix==='.bundle'?'resource-bundle':p.includes('/LoginItems/')?'login-item':suffix==='.app'?(ancestors.length?'nested-application':'application'):'bundle';
    return {path:p,parent_path:ancestors[0]??null,layout:deep?'macos-deep':i.rows.some(r=>r.path.startsWith(`${p}/Versions/`))?'versioned-framework':'shallow',role,role_basis:'path-convention',info_plist_path:components.bundle_metadata.find(r=>r.path===`${p}/${deep?'Contents/':''}Info.plist`)?.path??null,executable_candidates:components.executables.filter(r=>r.path.startsWith(`${p}/`)).map(r=>r.path),signing_paths:components.signing.filter(r=>r.path.startsWith(`${p}/`)).map(r=>r.path)};
  });
  const platforms=[];if(i.root.format==='ipa'||i.rows.some(r=>r.path.startsWith('Payload/')))platforms.push('ios');if(bundles.some(b=>b.layout==='macos-deep')||i.root.format==='dmg')platforms.push('macos');
  const runtime=[];if(components.executables.length)runtime.push('native');if(components.javascript.length)runtime.push('javascript');for(const [f,re]of [['react-native',/react-native|hermes/i],['flutter',/flutter/i],['unity',/unity/i]])if(i.rows.some(r=>re.test(r.path)))runtime.push(f);
  const bridges=[];let total=0;for(const j of components.javascript)for(const native of [...components.executables,...components.native_libraries]){total++;if(bridges.length<2048)bridges.push({source_path:j.path,native_path:native.path,basis:'javascript-and-native-content'});}
  const limitations=['Bundle roles, candidate executables and bridges are derived from paths and supplied formats; plist-declared entrypoints, loading and signatures require separate evidence'];
  const result={projection_id:id('aap',{root:i.root,bundles,components}),root_sha256:i.root.sha256,root_format:i.root.format,platforms,source_evidence_ids:i.evidenceIds,application_roots:bundles.filter(b=>b.role==='application').map(b=>b.path),bundles,components,symlinks:i.symlinks,runtime_families:runtime,bridge_candidates:bridges,bridge_candidate_coverage:bridgeCov(bridges.length,total),coverage:cov(i.complete),limitations};return ctx.evidence(op,args,result,{links:i.evidenceIds,limitations,confidence:'derived'});
}
async function managed(args,ctx) {
  const op='project_managed_application_graph',inputs=Object.entries(args).filter(([,v])=>v?.normalized_result),first=inputs[0]?.[1],hash=first?.normalized_result?.artifact?.sha256;
  if(!hash)ctx.unavailable(op,'Managed input has no concrete artifact identity','Supply managed artifact/member/boundary inspection evidence');
  if(inputs.some(([,e])=>e.normalized_result?.artifact?.sha256!==hash))throw Object.assign(new Error('Managed evidence artifacts disagree'),{code:'ROOT_MISMATCH'});
  const nodes=[],edges=[],tokens=new Map(),links=inputs.map(([,e])=>e.evidence_id),artifact=first.normalized_result.artifact,root=node('artifact',{strategy:'content-digest',stability:'global-exact',sha256:hash},artifact.path,{path:artifact.path},fact(hash,artifact.path,'managed-static-analysis','observed',null,links));nodes.push(root);
  const summary={graph_nodes:0,graph_edges:0,assemblies:0,modules:0,types:0,methods:0,fields:0,pinvoke_imports:0,native_implementations:0};
  let moduleNode=root;
  for(const [key,e]of inputs) {
    const r=e.normalized_result;
    const add=(kind,item,group)=>{const label=item.full_name??item.name??item.import_name??item.token,an=node(kind,localIdentity(hash,kind,item.token??label),label||kind,{...item,path:artifact.path},fact(hash,artifact.path,'managed-static-analysis','observed',null,[e.evidence_id]));nodes.push(an);if(item.token)tokens.set(item.token,an);summary[group]++;return an;};
    if(r.assembly){const n=add('managed-assembly',r.assembly,'assemblies');edges.push(edge(root,n,'contains',fact(hash,artifact.path,'managed-static-analysis')));}
    if(r.module){moduleNode=add('managed-module',r.module,'modules');edges.push(edge(root,moduleNode,'contains',fact(hash,artifact.path,'managed-static-analysis')));}
    for(const [field,kind,group]of [['types','managed-type','types'],['methods','managed-method','methods'],['fields','managed-field','fields'],['pinvoke_imports','managed-pinvoke-import','pinvoke_imports'],['native_implementations','managed-native-implementation','native_implementations']])for(const item of r[field]??[]) {
      const n=add(kind,item,group),parent=tokens.get(item.declaring_type_token)??moduleNode;edges.push(edge(parent,n,'contains',fact(hash,artifact.path,'managed-static-analysis')));
    }
  }
  for(const [,e]of inputs)for(const call of e.normalized_result.call_edges??[]) {const source=tokens.get(call.caller_token),target=tokens.get(call.target_token);if(source&&target)edges.push(edge(source,target,'calls',fact(hash,artifact.path,'managed-static-analysis','observed',null,[e.evidence_id]),{opcode:call.opcode}));}
  const complete=inputs.every(([,e])=>e.normalized_result.coverage?.state==='complete'),limitations=['Metadata tokens are artifact-local; native declarations do not establish native binding or execution'],g=graph([root.node_id],nodes,edges,coverage(complete?'complete':'partial',complete?0:null),limitations);summary.graph_nodes=g.nodes.length;summary.graph_edges=g.edges.length;
  for(const [key,kind]of Object.entries({assemblies:'managed-assembly',modules:'managed-module',types:'managed-type',methods:'managed-method',fields:'managed-field',pinvoke_imports:'managed-pinvoke-import',native_implementations:'managed-native-implementation'}))summary[key]=g.nodes.filter(n=>n.kind===kind).length;
  const result={projection_id:id('magp',{hash,graph:g.graph_id}),root_artifact_sha256:hash,source_evidence:{managed_artifact_evidence_id:args.managed_artifact?.evidence_id??null,managed_members_evidence_id:args.managed_members?.evidence_id??null,managed_native_boundaries_evidence_id:args.managed_native_boundaries?.evidence_id??null},summary,graph:g,coverage:{status:complete?'complete-within-inputs':'partial'},evidence_links:links,limitations};return ctx.evidence(op,args,result,{links,limitations,confidence:'derived'});
}
function runtimeLocation(l) {return typeof l==='string'?l:l?.kind==='file'?l.file_path:l?.kind==='url'?l.sanitized_url:l?.kind==='builtin'?l.specifier:null;}
async function reconcile(args,ctx) {
  const op='reconcile_javascript_runtime',layers=args.static_layers.map(l=>{const a=application(l.analysis);return {layer_id:id('jrl',{evidence:l.analysis.evidence_id,role:l.role??'application',mappings:l.runtime_mappings??[]}),role:l.role??'application',evidence_id:l.analysis.evidence_id,graph_id:a.graph.graph_id,root_artifact_sha256:a.root_artifact_sha256,input_path:a.input_path,format:a.format,runtime_mappings:l.runtime_mappings??[],app:a};}),captures=[],reconciliations=[],runtimeNodes=[],runtimeEdges=[],states=[],links=[...layers.map(l=>l.evidence_id),...args.runtime_observations.map(e=>e.evidence_id)],summary={runtime_targets:0,runtime_frames:0,runtime_scripts:0,runtime_workers:0,matched:0,ambiguous:0,unmatched:0,unknown:0,static_loaded:0,static_resident:0,static_not_observed:0,static_unknown:0};
  let complete=layers.every(l=>l.app.graph.coverage.status==='complete'),mapDeclarations=0;
  function uniqueEntities(items,key,kind){const found=new Map();for(const item of items){const identity=key(item);if(typeof identity!=='string'||!identity)ctx.unavailable(op,`Runtime ${kind} evidence lacks a concrete identity`,'Supply a capture with concrete debugger-reported identities');const prior=found.get(identity);if(prior&&sha(prior)!==sha(item))throw Object.assign(new Error(`Conflicting runtime ${kind} records share one capture identity`),{code:'CONFLICTING_RUNTIME_IDENTITY'});found.set(identity,item);}return [...found.values()];}
  function captureLocation(item){return item.location??(typeof item.file_path==='string'?{kind:'file',file_path:item.file_path}:typeof item.url==='string'?{kind:'url',sanitized_url:item.url}:null);}
  for(const e of args.runtime_observations) {
    const r=e.normalized_result,hash=sha(r),browser=Array.isArray(r.frames)&&Boolean(r.browser),scripts=uniqueEntities(r.scripts?.items??[],s=>s.script_key,'script'),frames=uniqueEntities(r.frames??[],f=>f.frame_id,'frame'),workers=uniqueEntities(r.workers??[],w=>w.target_id,'worker'),targetKey=r.target?.target_id??r.target?.target_key;
    if(!targetKey)ctx.unavailable(op,'Runtime evidence lacks a concrete target key','Supply a JavaScript runtime observation capture');
    const targetLocation=captureLocation(r.target),target=node('target',{strategy:'runtime-instance',stability:'capture-only',capture_sha256:hash,runtime_key:targetKey},targetKey,{...r.target,location:targetLocation},fact(null,null,'passive-cdp-runtime','observed',null,[e.evidence_id]));runtimeNodes.push(target);
    const excluded=r.scripts?.excluded,c=r.completeness,scopeComplete=browser?Boolean(c)&&![...(c.attach_limited_sections??[]),...(c.unavailable_sections??[]),...(c.truncated_sections??[]),...(c.policy_filtered_sections??[])].includes('scripts')&&!(c.dropped_events?.scripts??1)&&!(c.excluded??[]).some(x=>x.section==='scripts'&&(x.count===null||x.count>0)):!(r.capture?.truncated??true)&&(!excluded||Object.values(excluded).every(v=>v===0));complete&&=scopeComplete;
    const targetLoc=runtimeLocation(targetLocation)||{kind:'unresolved',reported_url:r.target.location?.reported_url??'',reason:r.target.location?.reason??'location-authorization-not-attempted'};
    captures.push({evidence_id:e.evidence_id,capture_sha256:hash,kind:browser?r.target.file_path?'electron':'browser':r.target.runtime_kind?.startsWith('electron')?'electron':'v8-inspector',target_node_id:target.node_id,target_key:targetKey,target_location:targetLoc,frames:frames.length,scripts:scripts.length,workers:workers.length,scripts_complete_within_scope:scopeComplete});summary.runtime_targets++;summary.runtime_scripts+=scripts.length;summary.runtime_frames+=frames.length;summary.runtime_workers+=workers.length;
    const frameNodes=new Map();
    for(const frame of frames){const n=node('frame',{strategy:'runtime-instance',stability:'capture-only',capture_sha256:hash,runtime_key:`frame:${frame.frame_id}`},frame.frame_id,{...frame,location:captureLocation(frame)},fact(null,null,'passive-cdp-runtime','observed',null,[e.evidence_id]));runtimeNodes.push(n);frameNodes.set(frame.frame_id,n);}
    for(const frame of frames)runtimeEdges.push(edge(frameNodes.get(frame.parent_frame_id)??target,frameNodes.get(frame.frame_id),'contains',fact(null,null,'passive-cdp-runtime','observed',null,[e.evidence_id]),{reported_parent_frame_id:frame.parent_frame_id,parent_frame_observed:frame.parent_frame_id?frameNodes.has(frame.parent_frame_id):null}));
    for(const worker of workers){const n=node(worker.type==='service_worker'?'service-worker':'worker',{strategy:'runtime-instance',stability:'capture-only',capture_sha256:hash,runtime_key:`worker:${worker.target_id}`},worker.target_id,{...worker,location:captureLocation(worker)},fact(null,null,'passive-cdp-runtime','observed',null,[e.evidence_id]));runtimeNodes.push(n);runtimeEdges.push(edge(frameNodes.get(worker.parent_frame_id)??target,n,'contains',fact(null,null,'passive-cdp-runtime','observed',null,[e.evidence_id]),{reported_parent_frame_id:worker.parent_frame_id,parent_frame_observed:worker.parent_frame_id?frameNodes.has(worker.parent_frame_id):null}));}
    for(const script of scripts) {
      const location=captureLocation(script),runtime=node('runtime-script-instance',{strategy:'runtime-instance',stability:'capture-only',capture_sha256:hash,runtime_key:script.script_key},script.script_key,{...script,location},fact(null,null,'passive-cdp-runtime','observed',null,[e.evidence_id]));runtimeNodes.push(runtime);runtimeEdges.push(edge(frameNodes.get(script.frame_id)??target,runtime,'contains',fact(null,null,'passive-cdp-runtime','observed',null,[e.evidence_id]),{reported_frame_id:script.frame_id??null,frame_observed:script.frame_id?frameNodes.has(script.frame_id):null}));
      const loc=runtimeLocation(location),source=script.source?.included===false?null:script.source?.artifact,text=source?.text;
      let sourceHash=null;
      if(typeof text==='string') {sourceHash=sha(text);if(source.sha256&&source.sha256!==sourceHash||source.bytes!==undefined&&source.bytes!==Buffer.byteLength(text))throw Object.assign(new Error('Runtime source artifact metadata disagrees with captured bytes'),{code:'INVALID_CAPTURE_CONTENT'});}
      const contentCandidates=[],locationCandidates=[];
      if(script.source_map_url)mapDeclarations++;
      for(const layer of layers)for(const n of layer.app.graph.nodes.filter(n=>['javascript-asset','javascript-module','javascript-chunk'].includes(n.kind)&&properties(n).sha256)) {
        if(sourceHash&&sourceHash===properties(n).sha256)contentCandidates.push({layer,node:n});
        for(const m of layer.runtime_mappings) {
          let p=null;
          if(m.kind==='file-root'&&location?.kind==='file') {const relative=path.relative(path.resolve(m.root),path.resolve(loc));if(relative&&relative!=='..'&&!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative))p=path.posix.join(m.artifact_prefix??'',relative.replaceAll('\\','/'));}
          if(m.kind==='url-prefix'&&location?.kind==='url') {
            try {const url=new URL(loc),prefix=new URL(m.prefix),decoded=decodeURIComponent(url.pathname),base=decodeURIComponent(prefix.pathname);
              if(url.origin===prefix.origin&&url.protocol===prefix.protocol&&!url.username&&!url.password&&(decoded===base||decoded.startsWith(base.endsWith('/')?base:`${base}/`))) {const rest=decoded.slice(base.length).replace(/^\//,'');if(!rest.split('/').some(s=>s==='..'||s.includes('\\')))p=path.posix.join(m.artifact_prefix??'',rest);}
            }catch{continue;}
          }
          if(p===logical(n))locationCandidates.push({layer,node:n});
        }
      }
      const unique=rows=>[...new Map(rows.map(c=>[`${c.layer.layer_id}:${c.node.node_id}`,c])).values()],content=unique(contentCandidates),locations=unique(locationCandidates),intersection=content.filter(c=>locations.some(l=>l.layer.layer_id===c.layer.layer_id&&l.node.node_id===c.node.node_id)),conflict=sourceHash&&locations.length&&!intersection.length;
      const candidates=conflict?unique([...content,...locations]):intersection.length?intersection:sourceHash?content:locations,matched=candidates.length===1?candidates[0]:null;
      const basis=intersection.length?'content-and-location':sourceHash?'content-sha256':locations.length?'artifact-path':'none',status=conflict?'unknown':matched?'matched':candidates.length>1?'ambiguous':loc?'unmatched':'unknown';
      const reason=conflict?'captured-content-disagrees-with-static-location':intersection.length?'content-and-location-match':matched?sourceHash?'unique-content-match':'unique-location-match':candidates.length>1?'ambiguous-static-candidates':loc?'no-authorized-location-mapping':'runtime-location-unresolved';
      const base={entity_kind:'script',runtime_evidence_id:e.evidence_id,runtime_node_id:runtime.node_id,basis,confidence:status==='matched'?(sourceHash?'exact':'medium'):'unknown',reason,candidate_static_count:candidates.length,candidate_static_nodes:candidates.map(c=>({static_layer_id:c.layer.layer_id,static_node_id:c.node.node_id})),static_layer_id:status==='matched'?matched.layer.layer_id:null,static_node_id:status==='matched'?matched.node.node_id:null,status};reconciliations.push({...base,reconciliation_id:id('jrr_item',base)});summary[status]++;
      if(status==='matched')runtimeEdges.push(edge(matched.node,runtime,'observed_as',fact(null,null,'cross-layer-reconciliation','inferred',null,[e.evidence_id])));
    }
  }
  for(const layer of layers)for(const n of layer.app.graph.nodes.filter(n=>['javascript-asset','javascript-module','javascript-chunk'].includes(n.kind))) {
    const matches=reconciliations.filter(r=>r.status==='matched'&&r.static_layer_id===layer.layer_id&&r.static_node_id===n.node_id),resident=n.kind==='javascript-module'?reconciliations.filter(r=>r.status==='matched'&&r.static_layer_id===layer.layer_id&&layer.app.graph.nodes.some(asset=>asset.node_id===r.static_node_id&&asset.kind==='javascript-asset'&&logical(asset)===logical(n))):[],uncertain=reconciliations.some(r=>['ambiguous','unknown'].includes(r.status)&&r.candidate_static_nodes.some(c=>c.static_layer_id===layer.layer_id&&c.static_node_id===n.node_id)),status=matches.length?'loaded':resident.length?'resident-in-loaded-asset':complete&&!uncertain?'not-observed-in-capture':'unknown';summary[status==='loaded'?'static_loaded':status==='resident-in-loaded-asset'?'static_resident':status==='unknown'?'static_unknown':'static_not_observed']++;
    states.push({static_layer_id:layer.layer_id,static_node_id:n.node_id,kind:n.kind,status,runtime_node_ids:(matches.length?matches:resident).map(r=>r.runtime_node_id),reason:matches.length?'runtime-script-correspondence':resident.length?'containing-asset-was-loaded':complete?'not-observed-in-bounded-capture':'static-or-runtime-coverage-incomplete'});
  }
  const limitations=['Runtime captures prove bounded loaded-script observations; missing correspondence does not establish that code is absent or unreachable','CDP hash metadata is not treated as a SHA-256 observation; exact content matching requires captured source bytes','Source-map declarations are excluded from primary matching'];
  const g=graph(layers.flatMap(l=>l.app.graph.root_node_ids),[...layers.flatMap(l=>l.app.graph.nodes),...runtimeNodes],[...layers.flatMap(l=>l.app.graph.edges),...runtimeEdges],coverage(complete?'complete':'partial',complete?0:null),limitations),result={reconciliation_id:id('jrr',{layers:layers.map(l=>l.layer_id),captures}),static_layers:layers.map(({app,...l})=>l),runtime_captures:captures,summary,reconciliations,static_load_states:states,graph:g,source_map_authority:{used_for_primary_matching:false,static_layer_count:layers.length,runtime_script_declarations:mapDeclarations,limitation:limitations[2]},coverage:{status:complete?'complete-within-inputs':'partial',truncated:false,omitted_runtime_entities:0,omitted_reconciliation_items:0,omitted_static_load_states:0,omitted_graph_items:0},evidence_links:links,limitations};return ctx.evidence(op,args,result,{links,limitations,confidence:'derived'});
}
export const projectionHandlers={project_android_application_graph:android,project_apple_application_graph:apple,project_managed_application_graph:managed,reconcile_javascript_runtime:reconcile};
