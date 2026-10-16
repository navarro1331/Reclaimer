import { properties, logical } from './javascript-model.mjs';

/** Classify recorded source-map partitions, without claiming generated-code equivalence. */
export function sourceMapPartitions(reference,application,signal){
 const g=application.graph,byId=new Map(g.nodes.map(n=>[n.node_id,n])),out=new Map(),incoming=new Map();
 for(const e of g.edges){for(const [map,key]of [[out,e.source_node_id],[incoming,e.target_node_id]]){const rows=map.get(key)??[];rows.push(e);map.set(key,rows);}}
 const originals=new Map();
 for(const n of g.nodes.filter(n=>n.kind==='source-module'&&n.identity.strategy==='source-map-original')){const key=n.identity.original_source.replaceAll('\\','/'),rows=originals.get(key)??[];rows.push(n);originals.set(key,rows);}
 const associations=new Map(),generatedSources=new Map();let work=0;
 for(const entry of reference.entries.filter(e=>e.kind==='file')){
  signal?.throwIfAborted();const rows=[];
  for(const original of originals.get(entry.path)??[]){
   if(++work>1_000_000)throw Object.assign(new Error('Source partition analysis exceeds one million work steps'),{code:'capacity'});
   if(!entry.sha256||original.identity.source_sha256!==entry.sha256)continue;
   for(const parent of (incoming.get(original.node_id)??[]).filter(e=>e.relation==='maps_to')){
    const generated=[...(out.get(parent.source_node_id)??[]).filter(e=>e.relation==='maps_to'&&e.properties.mapping_role==='generated-code').map(e=>byId.get(e.target_node_id)),...(incoming.get(parent.source_node_id)??[]).filter(e=>e.relation==='contains').map(e=>byId.get(e.source_node_id))].filter(n=>n&&n.kind!=='source-map'&&n.kind!=='package');
    for(const current of generated){if(++work>1_000_000)throw Object.assign(new Error('Source partition analysis budget exceeded'),{code:'capacity'});rows.push({original,current,span:properties(original).source_map_original_span});const paths=generatedSources.get(current.node_id)??new Set();paths.add(entry.path);generatedSources.set(current.node_id,paths);}
   }
  }
  associations.set(JSON.stringify([entry.path,entry.sha256??null]),rows);
 }
 const compare=(a,b)=>a.line-b.line||a.column-b.column,results=new Map();
 for(const [source,rows]of associations){
  const unique=[...new Map(rows.map(r=>[r.current.node_id,r])).values()],sorted=[...unique].sort((a,b)=>a.span&&b.span?compare(a.span.first,b.span.first):0);
  const partitioned=unique.length>1&&sorted.every((r,i)=>r.span?.count>0&&(!i||compare(sorted[i-1].span.last,r.span.first)<0));
  const duplicated=unique.length>1&&unique.every(r=>r.span?.count>0&&JSON.stringify(r.span)===JSON.stringify(unique[0].span));
  const merged=unique.length===1&&(generatedSources.get(unique[0].current.node_id)?.size??0)>1;
  if(partitioned||duplicated||merged)results.set(source,{status:partitioned?'split':duplicated?'duplicated':'merged',current_nodes:unique.map(r=>r.current),limitation:'Classification describes declared source-map coordinate partitions or multiple byte-bound originals in one generated module; execution, complete mapped extents and behavioral equivalence are unverified.'});
 }
 return results;
}
