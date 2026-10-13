import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIMITS,FAMILIES,sha,id,canonical,coverage,fact,node,edge,graph,localIdentity,logical,properties,application,inventory,parseSource,analyzeAst,observation } from './javascript-model.mjs';
import { recoveryHandlers } from './javascript-recovery.mjs';
import { obligationHandlers } from './javascript-obligations.mjs';
import { projectionHandlers } from './javascript-projections.mjs';
import { embeddedSources,sourceMapDeclaration,inlineSourceMap,loadSourceMapSections,localMapReference,originalPositions,decodeSourceMap } from './javascript-sourcemaps.mjs';
import { moduleExports } from './javascript-exports.mjs';
import { dependencyResolver } from './javascript-dependencies.mjs';
import { composeSourceMaps } from './javascript-mapchain.mjs';

const LIMITATION='Static syntax and candidate relationships do not establish runtime execution, authorization, or behavioral equivalence';
function emit(ctx,op,args,result,links=[],limitations=result.limitations??[]) { return ctx.evidence(op,args,result,{confidence:'derived',authority:'shipped-artifact',limitations,links}); }
const countKeys=(keys)=>Object.fromEntries(keys.map(k=>[k,0]));
const summaryTemplate=()=>({...countKeys(['browser_windows','explicit_web_preferences','preload_entrypoints','context_bridge_apis','exposed_api_members','sender_validation_observations','utility_processes','resolved_utility_entrypoints','native_addon_bindings','resolved_native_addon_bindings']),ipc:countKeys(['operations','literal_channels','dynamic_channel_operations','renderer_transmissions','renderer_listeners','main_handlers','paired_renderer_transmissions','ambiguous_renderer_transmissions','unpaired_literal_renderer_transmissions'])});
async function analyze(args,ctx) {
  const inv=await inventory(args.input_path,args.format??'auto',args.integrity_policy??'fail',ctx.signal),nodes=[],edges=[],summary=summaryTemplate(),stats=countKeys(['relevant_files','nested_asar_containers','text_bytes_read','invalid_utf8_files','parsed_javascript_files','visited_ast_nodes','findings','modules','parse_failures']);
  const root=node('package',{strategy:'content-digest',stability:'global-exact',sha256:inv.rootHash},path.basename(inv.absolute),{path:'.',format:inv.format},fact(inv.rootHash,'.'));nodes.push(root);
  const sem={schema:'JavaScriptSemanticRelationGraph',root_artifact_sha256:inv.rootHash,application_graph_id:null,root_node_ids:[],evidence_contexts:[],nodes:[],relations:[],fingerprints:[],unknowns:[],coverage:null,limitations:[LIMITATION]};
  const fileNodes=new Map(),parsed=[],declaredMaps=[],mapFiles=[],maps=new Map();const limitations=[...inv.limitations,LIMITATION];
  let mapPartial=false;
  async function inventoryMap(reference,base){
    if(base.startsWith('file:')){const virtual=fileURLToPath(base),relative=path.relative(inv.absolute,virtual);if(relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))throw new Error('Virtual source-map base is outside the retained inventory');base=relative.replaceAll('\\','/');}
    const target=localMapReference(reference,base),found=inv.files.find(f=>f.path===target);
    if(!found)throw new Error(`Source-map reference is outside the retained inventory or absent: ${target}`);
    return {path:target,bytes:found.bytes};
  }
  async function addMap(bytes,mapPath,parent,decoded=null,embedded=false) {
    if(maps.has(mapPath))return maps.get(mapPath);
    const hash=sha(bytes),mapNode=embedded?node('source-map',{strategy:'content-digest',stability:'global-exact',sha256:hash},mapPath,{path:mapPath,sha256:hash,bytes:bytes.length,embedded:true},fact(hash,mapPath)):parent;
    if(embedded){nodes.push(mapNode);edges.push(edge(parent,mapNode,'contains',fact(hash,mapPath)));}
    const expanded=await loadSourceMapSections(decoded??JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')),{mapPath,readMap:inventoryMap,signal:ctx.signal});
    const collected=embeddedSources(expanded.map,{mapPath,mapPaths:expanded.mapPaths});limitations.push(...collected.limitations);if(collected.omitted){mapPartial=true;limitations.push(`Source-map original budget omitted ${collected.omitted} entries in ${mapPath}`);}
    Object.assign(mapNode.observations[0].properties,{mapping_count:collected.segments.length,indexed:collected.indexed,captured_section_maps:expanded.captures.map(c=>({path:c.path,sha256:sha(c.bytes),bytes:c.bytes.length}))});
    const composition=await composeSourceMaps(expanded.map,{mapPath,mapPaths:expanded.mapPaths,rootBytes:bytes,readMap:inventoryMap,signal:ctx.signal,initialCaptures:expanded.captures}),originHashes=new Map([[mapPath,hash],...[...expanded.captures,...composition.captures].map(c=>[c.path,sha(c.bytes)])]),originals=new Map(collected.sources.map(s=>[canonical([s.mapPath,s.section,s.sourceIndex]),s]));
    for(const original of composition.originals)originals.set(canonical([original.mapPath,original.section,original.sourceIndex]),original);
    mapNode.observations[0].properties.source_map_composition={complete:composition.complete,chain_map_count:composition.chainMapCount,composed_segment_count:composition.composedSegments.length,diagnostics:composition.diagnostics,captured_chain_maps:composition.captures.map(c=>({path:c.path,sha256:sha(c.bytes),bytes:c.bytes.length}))};
    if(composition.diagnostics.length){mapPartial=true;limitations.push(...composition.diagnostics.map(d=>`Source-map chaining ${d.kind} for ${d.source}: ${d.detail}`));}
    for(const original of originals.values()) {
      const source=original.source??`anonymous-source-${original.sourceIndex}`,content=original.content;
      const originHash=originHashes.get(original.mapPath)??hash,originPath=original.mapPath??mapPath,derived=originPath!==mapPath;
      const sn=node('source-module',{strategy:'source-map-original',stability:'source-map-exact',source_map_sha256:originHash,original_source:source,source_root:original.sourceRoot,source_sha256:content===null?null:sha(content)},source,{path:source,embedded_source:content!==null,source_sha256:content===null?null:sha(content),source_map_section:original.section,source_map_offsets:original.offsets,ignored:original.ignored,...(derived?{chain_from_map:mapPath}:{})},fact(originHash,originPath),{source_name:source,source_root:original.sourceRoot,map_path:originPath,resolution:{kind:'unresolved',reason:'Source-map declared names are metadata; external source paths are not read'}});nodes.push(sn);edges.push(edge(mapNode,sn,'maps_to',derived?fact(originHash,originPath,'static-relationship-inference','inferred'):fact(hash,mapPath)));
    }
    const record={mapNode,collected,composition,composedDecoded:composition.chainMapCount?decodeSourceMap(composition.map,{mapPath}):null};maps.set(mapPath,record);return record;
  }
  for(const f of inv.files) {
    ctx.signal?.throwIfAborted();
    if(/\.asar$/.test(f.path))limitations.push(`Nested ASAR container is retained in inventory but not recursively expanded: ${f.path}`);
    const js=/\.(?:[cm]?js|jsx|ts|tsx)$/.test(f.path),map=/\.map$/.test(f.path),addon=/\.node$/.test(f.path),html=/\.html?$/.test(f.path);
    if(!js&&!map&&!addon&&!html&&!/(?:^|\/)package\.json$/.test(f.path))continue;
    stats.relevant_files++;
    const an=node(js?'javascript-asset':map?'source-map':addon?'native-addon':'artifact',{strategy:'canonical-path',stability:'artifact-version',artifact_sha256:inv.rootHash,path:f.path},f.path,{path:f.path,sha256:f.sha256,bytes:f.bytes.length,imports:[]},fact(f.sha256,f.path));nodes.push(an);fileNodes.set(f.path,an);edges.push(edge(root,an,'contains',fact(f.sha256,f.path)));
    if(addon){summary.native_addon_bindings++;continue;}
    let text;try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(f.bytes);stats.text_bytes_read+=f.bytes.length;}catch{stats.invalid_utf8_files++;limitations.push(`Invalid UTF-8: ${f.path}`);continue;}
    if(js) {
      try {const ast=parseSource(text,f.path);stats.parsed_javascript_files++;stats.parse_failures+=ast.errors.length;if(ast.errors.length)limitations.push(`Parser recovered ${ast.errors.length} error(s) in ${f.path}`);analyzeAst(ast,f,inv.rootHash,an,nodes,edges,sem,stats,summary);if(!ast.errors.length){parsed.push({ast,file:f,appNode:an});const declared=sourceMapDeclaration(text,f.path,ast).url;if(declared)declaredMaps.push({declared,file:f,parent:an});}}
      catch(err){stats.parse_failures++;limitations.push(`JavaScript parse failure in ${f.path}: ${err.message}`);}
    }
    if(map) {
      try {
        mapFiles.push({bytes:f.bytes,mapPath:f.path,parent:an,decoded:JSON.parse(text.replace(/^\uFEFF/,''))});
      }catch(err){mapPartial=true;limitations.push(`Source-map parse failure in ${f.path}: ${err.message}`);}
    }
    if(html)for(const m of text.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi))an.observations[0].properties.imports.push({specifier:m[1],source_range:null});
    if(/(?:^|\/)package\.json$/.test(f.path)) {
      try {const pkg=JSON.parse(text);an.observations[0].properties.package_name=pkg.name??null;an.observations[0].properties.main=pkg.main??null;if(typeof pkg.main==='string')an.observations[0].properties.imports.push({specifier:pkg.main.startsWith('.')?pkg.main:`./${pkg.main}`,source_range:null,entrypoint:true});}
      catch{limitations.push(`Invalid package manifest: ${f.path}`);}
    }
  }
  for(const m of mapFiles)try{await addMap(m.bytes,m.mapPath,m.parent,m.decoded);}catch(error){mapPartial=true;limitations.push(`Source-map parse failure in ${m.mapPath}: ${error.message}`);}
  for(const {declared,file,parent}of declaredMaps)try{
    let record;
    if(declared.startsWith('data:')){const inline=inlineSourceMap(declared);record=await addMap(inline.bytes,`${file.path}#inline-source-map`,parent,inline.map,true);}
    else {const captured=await inventoryMap(declared,file.path);let mapNode=fileNodes.get(captured.path);if(!mapNode){mapNode=node('source-map',{strategy:'canonical-path',stability:'artifact-version',artifact_sha256:inv.rootHash,path:captured.path},captured.path,{path:captured.path,sha256:sha(captured.bytes),bytes:captured.bytes.length},fact(sha(captured.bytes),captured.path));nodes.push(mapNode);}record=await addMap(captured.bytes,captured.path,mapNode);edges.push(edge(record.mapNode,parent,'maps_to',fact(sha(captured.bytes),captured.path),{mapping_role:'generated-code'}));}
    parent.observations[0].properties.source_map={node_id:record.mapNode.node_id,mapping_count:record.collected.segments.length};
    let retained=0;
    for(const semantic of sem.nodes.filter(n=>n.identity.module_path===file.path&&n.identity.source_range)){
      const start=semantic.identity.source_range.start,mapped=originalPositions(record.collected,start.line-1,start.column);
      if(!mapped.mappings.length)continue;
      if(retained+mapped.mappings.length>LIMITS.astNodes){mapPartial=true;limitations.push(`Source-map semantic-location annotation budget reached for ${file.path}`);break;}
      if(mapped.mappings.some(m=>m.original?.verificationReason)){mapPartial=true;if(!limitations.includes('Embedded source line-index budget leaves some original positions unverified'))limitations.push('Embedded source line-index budget leaves some original positions unverified');}
      retained+=mapped.mappings.length;
      semantic.properties.source_map_locations=mapped.mappings.map(m=>({map_path:properties(record.mapNode).path,section_map_path:m.source?.mapPath??properties(record.mapNode).path,generated_position:m.generated,state:m.state,source:m.source?.source??null,source_root:m.source?.sourceRoot??null,section_path:m.sectionPath,name:m.name,original:m.original}));
      if(record.composedDecoded){const composed=originalPositions(record.composedDecoded,start.line-1,start.column);if(retained+composed.mappings.length>LIMITS.astNodes){mapPartial=true;limitations.push(`Composed source-map annotation budget reached for ${file.path}`);break;}retained+=composed.mappings.length;semantic.properties.composed_source_map_locations=composed.mappings.map(m=>({map_path:properties(record.mapNode).path,composition_complete:record.composition.complete,generated_position:m.generated,state:m.state,source:m.source?.source??null,name:m.name,original:m.original}));}
    }
  }catch(error){mapPartial=true;limitations.push(`Declared source-map failure in ${file.path}: ${error.message}`);}
  const resolveDependency=dependencyResolver(inv.files);
  moduleExports(parsed,inv.rootHash,nodes,edges,sem,resolveDependency);
  for(const n of [...fileNodes.values()])for(const imp of properties(n).imports??[]) {
    if(typeof imp.specifier!=='string')continue;
    const resolved=resolveDependency(logical(n),imp.specifier,imp.loader_kind??'import');
    let target=resolved?fileNodes.get(resolved.path):null;
    if(!target&&resolved){const retained=inv.files.find(f=>f.path===resolved.path);if(retained){target=node('artifact',{strategy:'canonical-path',stability:'artifact-version',artifact_sha256:inv.rootHash,path:retained.path},retained.path,{path:retained.path,sha256:retained.sha256,bytes:retained.bytes.length,dependency_only:true},fact(retained.sha256,retained.path));nodes.push(target);fileNodes.set(retained.path,target);edges.push(edge(root,target,'contains',fact(retained.sha256,retained.path)));}}
    if(!target){target=node('unknown',localIdentity(inv.rootHash,'import',imp.specifier),imp.specifier,{specifier:imp.specifier,resolution:imp.specifier.startsWith('.')?'unresolved':'external'},fact(null,null,'static-relationship-inference','unknown'));nodes.push(target);}
    edges.push(edge(n,target,imp.entrypoint?'loads':'imports',fact(properties(n).sha256,logical(n),'static-relationship-inference','inferred'),{specifier:imp.specifier,resolution:target.kind==='unknown'?'unresolved':'resolved',resolution_basis:resolved?.basis??null,loader_kind:imp.loader_kind??'import'}));
  }
  // Pair only literal channel operations, keeping duplicate handlers ambiguous.
  const channels=nodes.filter(n=>n.kind==='ipc-channel'),mains=channels.filter(n=>properties(n).is_main),sends=channels.filter(n=>!properties(n).is_main&&['send','sendSync','invoke'].includes(properties(n).operation));
  for(const send of sends){const matches=mains.filter(n=>properties(n).channel===properties(send).channel);if(matches.length===1){summary.ipc.paired_renderer_transmissions++;edges.push(edge(send,matches[0],'invokes',fact(null,null,'static-relationship-inference','inferred')));}else if(matches.length>1)summary.ipc.ambiguous_renderer_transmissions++;else summary.ipc.unpaired_literal_renderer_transmissions++;}
  for(const n of nodes)n.observations=n.observations.map(o=>observation(o.label,o.properties,o.evidence,o.source_map_reference));
  const cov=stats.parse_failures||stats.invalid_utf8_files||mapPartial?coverage('partial',inv.coverage.omitted_count):inv.coverage,g=graph([root.node_id],nodes,edges,cov,limitations);
  if(!sem.nodes.length) {
    const ef=fact(inv.rootHash,'.','ast-static-analysis','unknown');delete ef.location;const context={...ef,context_id:id('jsrg_evidence',ef)};sem.evidence_contexts.push(context);
    const identity={artifact_sha256:inv.rootHash,module_path:'.',source_range:null,role_key:'no-parsed-module'},sn={kind:'module',identity,function_node_id:null,application_node_ids:[root.node_id],label:'No parsed JavaScript modules',properties:{},evidence:{context_id:context.context_id,location:{available:true,value:{kind:'artifact-path',path:'.'}}},node_id:id('jsrg_node',identity)};sem.nodes.push(sn);sem.root_node_ids.push(sn.node_id);
  }
  sem.application_graph_id=g.graph_id;sem.coverage={status:'partial',truncated:sem.unknowns.some(u=>u.reason==='resource-limit'),omitted_nodes:null,omitted_relations:null,limits:[{name:'astNodes',value:LIMITS.astNodes,unit:'items'}],families:FAMILIES.map(f=>({family:f,status:['call-flow','configuration','data-flow','object-flow','closure','event','timer','child-process','request','promise-ownership'].includes(f)?'partial':'unsupported',retained_relations:0,omitted_relations:null,unknown_ids:sem.unknowns.filter(u=>u.family===f).map(u=>u.unknown_id)}))};
  for(const family of sem.coverage.families)family.retained_relations=sem.relations.filter(r=>({calls:'call-flow','argument-to-parameter':'call-flow','returns-to-call':'call-flow',defines:'data-flow',reads:'data-flow',writes:'data-flow',aliases:'data-flow',defaults:'data-flow',destructures:'object-flow','consumed-by':'data-flow','reads-environment':'configuration','reads-argv':'configuration','reads-property':'object-flow','writes-property':'object-flow',captures:'closure','schedules-timer':'timer','cancels-timer':'timer',spawns:'child-process','constructs-request':'request','registers-listener':'event',awaits:'promise-ownership','returns-task':'promise-ownership'}[r.relation]??'boundary')===family.family).length;
  sem.nodes=[...new Map(sem.nodes.map(n=>[n.node_id,n])).values()];sem.relations=[...new Map(sem.relations.map(r=>[r.relation_id,r])).values()];sem.graph_id=id('jsrg',sem);
  stats.modules=sem.nodes.filter(n=>n.kind==='module').length;stats.findings=nodes.length-1;
  const result={input_path:inv.absolute,format:inv.format,root_artifact_sha256:inv.rootHash,inventory_manifest_id:id('agm',inv.files.map(f=>({path:f.path,sha256:f.sha256}))),inventory_graph_sha256:sha(inv.files.map(f=>({path:f.path,sha256:f.sha256,bytes:f.bytes.length}))),integrity_contradictions:inv.contradictions,graph:g,summary,statistics:stats,limitations,semantic_graph:sem};
  const parent=await emit(ctx,'analyze_javascript_application',args,result);
  if(args.detail!=='summary')return parent;
  const brief={input_path:result.input_path,format:result.format,root_artifact_sha256:inv.rootHash,statistics:stats,electron:summary,coverage:cov,limitation_count:limitations.length};
  return emit(ctx,'analyze_javascript_application',args,{kind:'summary',view:{kind:'summary'},summary:brief,parent_evidence_id:parent.evidence_id,parent_operation:'analyze_javascript_application',parent_digest:sha(result),view_digest:sha(brief),artifact:{path:inv.absolute,sha256:inv.rootHash},coverage:{status:'complete-within-view',examined:nodes.length,total:nodes.length,next_offset:null,exhausted:true},limitations,unknowns:[]},[parent.evidence_id]);
}
function walkGraph(nodes,relations,seeds,direction,allowed=null,limit=LIMITS.traceNodes) {
  const visited=new Set(seeds),selected=new Map(),queue=seeds.map(s=>({nodes:[s],edges:[]})),paths=[];let bounded=false;
  while(queue.length) {
    const p=queue.shift(),last=p.nodes.at(-1),next=relations.filter(e=>(!allowed||allowed.has(e.relation))&&((direction!=='incoming'&&e.source_node_id===last)||(direction!=='outgoing'&&e.target_node_id===last)));
    let expanded=false;
    for(const e of next) {
      const to=e.source_node_id===last?e.target_node_id:e.source_node_id;selected.set(e.edge_id??e.relation_id,e);
      if(!visited.has(to)){if(visited.size>=limit){bounded=true;continue;}visited.add(to);queue.push({nodes:[...p.nodes,to],edges:[...p.edges,e]});expanded=true;}
    }
    if(!expanded)paths.push(p);
  }
  return {nodes:nodes.filter(n=>visited.has(n.node_id)),relations:[...selected.values()].filter(e=>visited.has(e.source_node_id)&&visited.has(e.target_node_id)),paths,visited,bounded};
}
function matchSeed(n,seed) {
  if(seed.kind==='node-id')return n.node_id===seed.value?{basis:'node-id',field:'node_id'}:null;
  if(seed.kind==='channel' && n.kind!=='ipc-channel')return null;
  if(seed.kind==='api' && n.kind!=='context-bridge-api')return null;
  if(seed.kind==='module'&&!['javascript-module','javascript-asset','source-module'].includes(n.kind))return null;
  if(seed.kind==='native-export'&&n.kind!=='native-export')return null;
  if(seed.kind==='route'&&n.kind!=='endpoint')return null;
  const wanted=seed.case_sensitive?seed.value:seed.value.toLowerCase(),values=[...n.observations.map(o=>({basis:'label',field:'label',value:o.label})),{basis:'identity',field:'identity',value:logical(n)},...Object.entries(properties(n)).map(([field,value])=>({basis:'property',field,value}))];
  return values.find(v=>typeof v.value==='string'&&((seed.match??'contains')==='exact'?(seed.case_sensitive?v.value:v.value.toLowerCase())===wanted:(seed.case_sensitive?v.value:v.value.toLowerCase()).includes(wanted)))??null;
}
async function featureTrace(args,ctx) {
  const a=application(args.application),seed={...args.seed,match:args.seed.match??null,case_sensitive:args.seed.case_sensitive??false},direction=args.direction??'both',matches=a.graph.nodes.flatMap(n=>{const m=matchSeed(n,seed);return m?[{node_id:n.node_id,kind:n.kind,basis:m.basis,field:m.field}]:[];}),walk=walkGraph(a.graph.nodes,a.graph.edges,matches.map(m=>m.node_id),direction);
  const paths=walk.paths.map(p=>({path_id:id('jatp',p.nodes),start_node_id:p.nodes[0],end_node_id:p.nodes.at(-1),end_kind:a.graph.nodes.find(n=>n.node_id===p.nodes.at(-1)).kind,node_ids:p.nodes,edge_ids:p.edges.map(e=>e.edge_id),authorities:[...new Set(p.edges.map(e=>e.evidence.authority))],contains_inference:p.edges.some(e=>e.evidence.state==='inferred')}));
  const facts=[...walk.nodes.flatMap(n=>n.observations.map(o=>o.evidence)),...walk.relations.map(e=>e.evidence)],links=[args.application.evidence_id];
  const handoffs=walk.nodes.filter(n=>n.kind==='native-addon').map(n=>({native_node_id:n.node_id,artifact_sha256:properties(n).sha256??n.observations[0].evidence.artifact.sha256,artifact_path:logical(n),export_node_ids:[],requested_exports:[],status:'requires-provider-analysis',providers:[],evidence_ids:[],recommended_tools:['open_binary','binary_overview','search_procedures']}));
  const result={trace_id:id('jatr',{source:a.graph.graph_id,seed,direction}),source_evidence_id:args.application.evidence_id,source_graph_id:a.graph.graph_id,seed,direction,seed_matches:matches,graph:matches.length?graph(matches.map(m=>m.node_id),walk.nodes,walk.relations,walk.bounded?coverage('partial',null,true,[{name:'traceNodes',value:LIMITS.traceNodes,unit:'items'}]):a.graph.coverage,[LIMITATION]):null,paths,native_handoffs:handoffs,summary:{matched_seeds:matches.length,traced_nodes:walk.nodes.length,traced_edges:walk.relations.length,terminal_paths:paths.length,native_handoffs:handoffs.length,observed_facts:facts.filter(f=>f.state==='observed').length,inferred_facts:facts.filter(f=>f.state==='inferred').length,unknown_facts:facts.filter(f=>f.state==='unknown').length,unavailable_facts:facts.filter(f=>f.state==='unavailable').length},coverage:{status:!matches.length?'no-match':walk.bounded||a.graph.coverage.status!=='complete'?'partial':'complete-within-source',source_graph_status:a.graph.coverage.status,total_seed_matches:matches.length},evidence_links:links,limitations:[LIMITATION]};return emit(ctx,'trace_application_feature',args,result,links);
}
async function semanticTrace(args,ctx) {
  const a=application(args.application),g=a.semantic_graph;if(!g)ctx.unavailable('trace_javascript_semantics','Semantic graph was not supplied','Reanalyze the application with complete detail');
  const {seed,direction}=args.query;
  const ids=g.nodes.filter(n=>seed.kind==='semantic-node'?n.node_id===seed.node_id:seed.kind==='application-node'?n.application_node_ids.includes(seed.node_id):seed.kind==='literal'?n.kind==='literal'&&Object.is(n.properties.value,seed.value):seed.kind==='function'?g.fingerprints.some(f=>f.function_node_id===n.node_id&&f.fingerprint_sha256===seed.fingerprint_sha256):seed.kind==='property'?n.kind==='property-slot'&&n.properties.name===seed.name:seed.kind==='event'?n.kind==='event'&&n.properties.name===seed.name:seed.kind==='endpoint'?n.kind==='literal'&&n.properties.value===seed.value:seed.kind==='boundary-field'?n.kind==='property-slot'&&n.properties.name===seed.field:false).map(n=>n.node_id);
  const allowed=new Set(args.query.allowed_relations??g.relations.map(r=>r.relation));
  if(direction==='callers')for(const k of [...allowed])if(k!=='calls')allowed.delete(k);
  if(direction==='ownership')for(const k of [...allowed])if(!['owns','acquires','releases','captures','returns-task','creates-promise','awaits'].includes(k))allowed.delete(k);
  const rels=g.relations.filter(r=>args.query.include_ambiguous_dynamic_edges||r.resolution==='resolved'),walk=walkGraph(g.nodes,rels,ids,['backward-provenance','callers'].includes(direction)?'incoming':'outgoing',allowed),unknowns=g.unknowns.filter(u=>u.node_id===null||walk.visited.has(u.node_id)),links=[args.application.evidence_id];
  const result={query_id:id('jsrq',{graph:g.graph_id,query:args.query}),source_graph_id:g.graph_id,seed,direction,status:!ids.length?'no-match':walk.bounded||unknowns.length||g.coverage.status!=='complete'?'partial':ids.length>1?'ambiguous':'found',seed_node_ids:ids,evidence_contexts:g.evidence_contexts,nodes:walk.nodes,relations:walk.relations,unknowns,expected_match_node_ids:args.query.expected?walk.nodes.filter(n=>args.query.expected.classes.includes(n.kind)).map(n=>n.node_id):[],summary:{total_seed_matches:ids.length,traversed_nodes:walk.nodes.length,traversed_relations:walk.relations.length,traversed_functions:walk.nodes.filter(n=>n.kind==='function').length,traversed_modules:walk.nodes.filter(n=>n.kind==='module').length,relevant_unknowns:unknowns.length},coverage:{status:unknowns.length||walk.bounded||g.coverage.status!=='complete'?'partial':'complete'},limitations:[LIMITATION],source_evidence_id:args.application.evidence_id,evidence_links:links};return emit(ctx,'trace_javascript_semantics',args,result,links);
}
async function versionComparison(args,ctx) {
  const left=application(args.left),right=application(args.right),links=[args.left.evidence_id,args.right.evidence_id],items=[],used=new Set(),ambiguousRight=new Map(),summary=countKeys(['unchanged','added','removed','changed','unknown']),matching=countKeys(['exact_node_identity','exact_content_digest','exact_module_source_digest','source_map_identity','structural_fingerprint','semantic_key','ambiguous','unmatched']);
  const complete=left.graph.coverage.status==='complete'&&right.graph.coverage.status==='complete';
  for(const l of left.graph.nodes) {
    let candidates=right.graph.nodes.filter(r=>!used.has(r.node_id)&&r.node_id===l.node_id),basis='exact-node-identity';
    if(!candidates.length&&properties(l).sha256){basis='exact-content-digest';candidates=right.graph.nodes.filter(r=>!used.has(r.node_id)&&r.kind===l.kind&&properties(r).sha256===properties(l).sha256);}
    if(!candidates.length){basis='semantic-key';candidates=right.graph.nodes.filter(r=>!used.has(r.node_id)&&r.kind===l.kind&&logical(r)===logical(l)&&canonical(properties(r).export_name??null)===canonical(properties(l).export_name??null)&&r.observations[0].label===l.observations[0].label);}
    const r=candidates.length===1?candidates[0]:null;
    let status,dimensions=[],match;
    if(r){used.add(r.node_id);dimensions=['content','location','properties'].filter(d=>d==='content'?properties(l).sha256!==properties(r).sha256:d==='location'?logical(l)!==logical(r):canonical(properties(l))!==canonical(properties(r)));status=dimensions.length?'changed':'unchanged';match={status:'matched',basis,confidence:basis.startsWith('exact')?'exact':'medium',candidate_left_node_ids:[],candidate_right_node_ids:[]};matching[basis.replaceAll('-','_')]++;}
    else if(candidates.length>1){status='unknown';match={status:'ambiguous',basis:'none',confidence:'unknown',candidate_left_node_ids:[],candidate_right_node_ids:candidates.map(n=>n.node_id)};for(const c of candidates)ambiguousRight.set(c.node_id,[...(ambiguousRight.get(c.node_id)??[]),l.node_id]);matching.ambiguous++;}
    else{status=complete?'removed':'unknown';dimensions=['availability'];match={status:'unmatched',basis:'none',confidence:'unknown',candidate_left_node_ids:[],candidate_right_node_ids:[]};matching.unmatched++;}
    const base={node_kind:l.kind,dimensions,evidence_links:links,limitations:status==='unknown'?['Correspondence or absence is not established']:[],status,left_node_id:l.node_id,right_node_id:r?.node_id??null,match};items.push({...base,item_id:id('javc_item',base)});summary[status]++;
  }
  for(const r of right.graph.nodes.filter(n=>!used.has(n.node_id))) {const ambiguous=ambiguousRight.has(r.node_id),status=complete&&!ambiguous?'added':'unknown',base={node_kind:r.kind,dimensions:['availability'],evidence_links:links,limitations:ambiguous?['Node participates in an ambiguous cross-version correspondence']:[],status,left_node_id:null,right_node_id:r.node_id,match:{status:ambiguous?'ambiguous':'unmatched',basis:'none',confidence:'unknown',candidate_left_node_ids:ambiguousRight.get(r.node_id)??[],candidate_right_node_ids:[]}};items.push({...base,item_id:id('javc_item',base)});summary[status]++;}
  const result={comparison_id:id('javc',{left:left.graph.graph_id,right:right.graph.graph_id}),left:{evidence_id:args.left.evidence_id,graph_id:left.graph.graph_id,root_artifact_sha256:left.root_artifact_sha256},right:{evidence_id:args.right.evidence_id,graph_id:right.graph.graph_id,root_artifact_sha256:right.root_artifact_sha256},summary,matching,items,graph:graph(right.graph.root_node_ids,[...left.graph.nodes,...right.graph.nodes],[...left.graph.edges,...right.graph.edges],coverage(complete?'complete':'partial',complete?0:null),[LIMITATION]),coverage:{left_graph_status:left.graph.coverage.status,right_graph_status:right.graph.coverage.status,left_graph_omitted_count:left.graph.coverage.omitted_count,right_graph_omitted_count:right.graph.coverage.omitted_count,status:complete?'complete-within-inputs':'partial'},evidence_links:links,limitations:[LIMITATION]};return emit(ctx,'compare_application_versions',args,result,links);
}
async function sourceComparison(args,ctx) {
  const ref=args.reference,a=application(args.application),links=[args.application.evidence_id],weights={'exact-source-digest':100,'source-map-original-path':80,'current-path-exact':70,'current-path-suffix':50,'basename-match':25,'language-extension':5},items=[],summary=countKeys(['unchanged','modified','removed','split','merged','duplicated','unknown']),used=new Set(),files=ref.entries.filter(e=>e.kind==='file');
  const relevant=a.graph.nodes.filter(n=>['javascript-module','javascript-asset','source-module','native-addon','artifact'].includes(n.kind)),complete=ref.inventory_state==='complete'&&a.graph.coverage.status==='complete';let evaluations=0;
  for(const entry of files) {
    const candidates=[];
    for(const n of relevant){evaluations++;const p=logical(n)??'',pr=properties(n),signals=[];
      const add=(kind,currentValues)=>signals.push({kind,weight:weights[kind],source_value:kind==='exact-source-digest'?entry.sha256:entry.path,current_values:currentValues});
      const digest=n.identity.source_sha256??pr.source_sha256??pr.sha256;if(entry.sha256&&digest===entry.sha256)add('exact-source-digest',[digest]);
      if(n.identity.strategy==='source-map-original'&&n.identity.original_source.replaceAll('\\','/')===entry.path)add('source-map-original-path',[p]);
      if(p===entry.path)add('current-path-exact',[p]);else if(p.endsWith(`/${entry.path}`))add('current-path-suffix',[p]);
      if(path.posix.basename(p)===path.posix.basename(entry.path))add('basename-match',[p]);
      if(path.posix.extname(p)===path.posix.extname(entry.path))add('language-extension',[p]);
      const score=signals.reduce((s,x)=>s+x.weight,0);if(score>=20)candidates.push({current_node_id:n.node_id,current_node_kind:n.kind,score,confidence:signals.some(s=>s.kind==='exact-source-digest')?'exact':score>=80?'high':score>=50?'medium':'low',signals});
    }
    candidates.sort((a,b)=>b.score-a.score||a.current_node_id.localeCompare(b.current_node_id));const best=candidates.filter(c=>c.score===candidates[0]?.score),exact=best.filter(c=>c.signals.some(s=>s.kind==='exact-source-digest'));
    const bestNode=best.length===1?relevant.find(n=>n.node_id===best[0].current_node_id):null,currentDigest=bestNode?.identity.source_sha256??properties(bestNode??{observations:[]}).source_sha256??properties(bestNode??{observations:[]}).sha256;
    const status=exact.length>1?'duplicated':exact.length===1?'unchanged':best.length===1&&best[0].score>=50&&entry.sha256&&currentDigest?'modified':!best.length&&complete&&entry.content_state==='hashed'?'removed':'unknown';
    const chosen=['unchanged','duplicated','modified'].includes(status)?best.map(c=>c.current_node_id):[];chosen.forEach(n=>used.add(n));summary[status]++;
    const base={source_path:entry.path,source_sha256:entry.sha256??null,source_language:entry.language??null,status,confidence:exact.length?'exact':status==='modified'?'medium':'unknown',current_node_ids:chosen,candidates,limitations:['Name and path correspondence are candidates, not behavioral equivalence']};items.push({...base,mapping_id:id('stbc_item',base)});
  }
  const result={comparison_id:id('stbc',{ref:ref.root_sha256,app:a.graph.graph_id}),reference:{root_sha256:ref.root_sha256,inventory_state:ref.inventory_state},application:{evidence_id:args.application.evidence_id,graph_id:a.graph.graph_id,root_artifact_sha256:a.root_artifact_sha256},scoring:{algorithm:'rea-source-to-bundle-signals',minimum_candidate_score:20,weights:Object.entries(weights).map(([signal,weight])=>({signal,weight}))},summary,items,unmapped_current_node_ids:relevant.filter(n=>!used.has(n.node_id)).map(n=>n.node_id),coverage:{status:complete?'complete-within-inputs':'partial',reference_inventory_state:ref.inventory_state,application_graph_status:a.graph.coverage.status,retained_source_files:files.length,retained_application_nodes:relevant.length,candidate_evaluations:evaluations},evidence_links:links,limitations:[LIMITATION]};return emit(ctx,'compare_source_to_bundle',args,result,links);
}
function exportSelection(e,modulePath,exportName) {
  const a=application(e),all=a.graph.nodes.filter(n=>properties(n).export_name!==undefined).map(n=>({node_id:n.node_id,module_path:logical(n),export_name:properties(n).export_name,matches_requested_module:logical(n)===modulePath,matches_requested_export:properties(n).export_name===exportName})),candidates=all.filter(c=>c.matches_requested_module&&c.matches_requested_export);
  return {evidence_id:e.evidence_id,graph_id:a.graph.graph_id,requested_module_path:modulePath,requested_export_name:exportName,candidates,omitted_candidates:0,status:candidates.length===1?'selected':candidates.length?'ambiguous':'missing',selected_node_id:candidates.length===1?candidates[0].node_id:null};
}
async function exportComparison(args,ctx) {
  const la=application(args.left),ra=application(args.right),left=exportSelection(args.left,args.left_module_path,args.left_export_name),right=exportSelection(args.right,args.right_module_path,args.right_export_name),links=[args.left.evidence_id,args.right.evidence_id],ls=properties(la.graph.nodes.find(n=>n.node_id===left.selected_node_id)??{observations:[]}).export_shape,rs=properties(ra.graph.nodes.find(n=>n.node_id===right.selected_node_id)??{observations:[]}).export_shape,changes=[],inventories=[];
  for(const [side,shape]of [['left',ls],['right',rs]])if(shape?.source_range)inventories.push({side,variant_index:0,discriminant:null,paired:!!ls&&!!rs,source_range:shape.source_range,properties:Object.keys(shape.fields),property_coverage:Object.keys(shape.fields).map(p=>({path:p,status:shape.complete?'complete':'partial'}))});
  for(const p of [...new Set([...Object.keys(ls?.fields??{}),...Object.keys(rs?.fields??{})])].sort()) {
    const l=ls?.fields[p]??(ls?.complete?{availability:'absent'}:{availability:'unknown',reason:'Left export/property inventory is incomplete'}),r=rs?.fields[p]??(rs?.complete?{availability:'absent'}:{availability:'unknown',reason:'Right export/property inventory is incomplete'});
    if(canonical(l)===canonical(r)&&l.availability!=='unknown'&&r.availability!=='unknown')continue;
    const status=l.availability==='unknown'||r.availability==='unknown'?'unknown':l.availability==='absent'?'added':r.availability==='absent'?'removed':'changed',base={status,path:p,discriminant:null,presence:{left:ls?.fields[p]?'present':ls?.complete?'absent':'unknown-coverage',right:rs?.fields[p]?'present':rs?.complete?'absent':'unknown-coverage'},left:l,right:r,left_source_range:ls?.source_range??null,right_source_range:rs?.source_range??null,evidence_links:links,limitations:status==='unknown'?['Computed properties, spreads or dynamic values prevent a literal claim']:[]};changes.push({...base,change_id:id('jesc_change',base)});
  }
  const summary=countKeys(['added','removed','changed','unknown']);changes.forEach(c=>summary[c.status]++);const complete=ls?.complete&&rs?.complete;
  const result={comparison_id:id('jesc',{left,right}),left,right,property_inventories:inventories,summary,changes,coverage:{status:complete?'complete-within-inputs':'partial',left_graph_status:la.graph.coverage.status,right_graph_status:ra.graph.coverage.status,paired_variants:ls&&rs?1:0,unpaired_left_variants:ls&&!rs?1:0,unpaired_right_variants:rs&&!ls?1:0,omitted_left_variants:0,omitted_right_variants:0,left_source_omitted_variants:ls?.complete?0:null,right_source_omitted_variants:rs?.complete?0:null,left_omitted_fields:0,right_omitted_fields:0,left_omitted_property_coverage:0,right_omitted_property_coverage:0,omitted_candidates:0,omitted_changes:0},evidence_links:links,limitations:[LIMITATION]};return emit(ctx,'compare_javascript_export_shapes',args,result,links);
}

export const handlers={analyze_javascript_application:analyze,trace_application_feature:featureTrace,trace_javascript_semantics:semanticTrace,compare_application_versions:versionComparison,compare_source_to_bundle:sourceComparison,compare_javascript_export_shapes:exportComparison,...recoveryHandlers,...obligationHandlers,...projectionHandlers};
const capabilityDetails={
  analyze_javascript_application:{prerequisites:['Readable explicit directory or ASAR'],limitations:['Nested ASARs are not expanded','Constant imports/export aliases, retained package routing and argument/return/closure candidates are supported; custom loader conditions, flow-sensitive mutation and arbitrary factories remain incomplete','VLQ/indexed/chained coordinates are decoded through retained intermediate text; ambiguous or missing associations remain partial, unmapped section extents remain unknown, and coordinate verification is bounded','External maps are confined to retained inventory; declared original names never authorize original-source filesystem reads']},
  recover_javascript_sources:{prerequisites:['Readable UTF-8 JavaScript or flat/indexed source-map file','Nonexistent output directory with an existing parent'],limitations:['Minimal retains bytes; standard removes mapping comments; aggressive removes ordinary comments while preserving recognizable legal notices/annotations, with checked parsed-program digests and raw originals retained','Local indexed/chained maps retain raw captures and intermediate text; composed artifacts carry partial status for cycles, missing text/maps, conflicting associations and ambiguous positions','Remote maps and external original source loading are unsupported; chained map declarations are followed only from retained text within existing local map boundaries','Heuristic/inspection modes recover literal wrapper candidates with byte/context provenance; arbitrary loader execution, wrapper removal and application reconstruction remain unsupported','Parsed-program equality does not establish runtime, source-reflection or tooling equivalence; executed module revision is not independently attested']},
  reconcile_javascript_runtime:{prerequisites:['Static application graph evidence','V8 or browser/electron page capture evidence','Explicit location mapping or retained captured source text'],limitations:['Frames/workers are projected from retained identities; worker metadata does not establish its script bytes or execution and loaded assets establish only export residence','Source maps, CDP hashes and declared-only source digests are not primary byte identity authority','Conflicting byte/location candidates stay unknown and duplicated content stays ambiguous until an explicit location disambiguates it','Node metadata-only capture schemas cannot report precise executed ranges, concrete runtime values or exported object shapes']},
  project_android_application_graph:{prerequisites:['Concrete APK inventory evidence'],limitations:['Bridge candidates and runtime families use path/format conventions']},
  project_apple_application_graph:{prerequisites:['Concrete IPA/ZIP/DMG/directory inventory evidence'],limitations:['Bundle layout and roles use path conventions; loaded executables and validated signatures require separate evidence']},
  project_managed_application_graph:{prerequisites:['Artifact-aligned managed inspection evidence'],limitations:['Native declarations do not establish loaded native bindings']},
  build_reconstruction_obligation_ledger:{prerequisites:['Supplied evidence bundle','Reviewed obligations and binding manifest'],limitations:['Generated candidates remain unreviewed','Verifier commands are evaluated as supplied evidence and are never executed']},
  evaluate_reconstruction_coverage:{prerequisites:['Named boundary in a supplied reconstruction coverage packet'],limitations:['Evaluates evidence completeness and compatibility within the packet; does not observe filesystem or deployment state']},
};
export const capabilities=Object.fromEntries(Object.keys(handlers).map(operation=>[operation,{implemented:true,prerequisites:capabilityDetails[operation]?.prerequisites??['Concrete compatible application evidence'],limitations:[LIMITATION,...(capabilityDetails[operation]?.limitations??[])]}]));
