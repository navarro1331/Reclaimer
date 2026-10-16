import { sha, node, edge, fact, graph, localIdentity } from './javascript-model.mjs';
import { InvestigationError } from './core.mjs';
import { chargeJsonBytes } from './bounded-json.mjs';

/** Native observations are supplied evidence, never an implicit request to run a provider. */
export function withNativeObservations(application, observations=[], signal) {
 if(!observations.length)return application;
 if(observations.length>1024)throw new InvestigationError('capacity','compare_application_versions','Native observation count exceeds 1024');
 const nodes=[...application.graph.nodes],edges=[...application.graph.edges];let bytes=0,work=0;
 const tick=()=>{signal?.throwIfAborted();if(++work>2_000_000)throw new InvestigationError('capacity','compare_application_versions','Native observation traversal exceeds two million work steps');};
 for(const observation of observations){
  signal?.throwIfAborted();const value=observation.normalized_result??null;
  chargeJsonBytes(value,size=>{bytes+=size;if(bytes>16*1024*1024)throw new InvestigationError('capacity','compare_application_versions','Native comparison payloads exceed sixteen MiB');},tick);
  const pending=[[value,0]];while(pending.length){tick();const [current,depth]=pending.pop();if(depth>128)throw new InvestigationError('capacity','compare_application_versions','Native comparison JSON nesting exceeds 128 levels');if(current&&typeof current==='object')for(const child of Object.values(current))if(child&&typeof child==='object')pending.push([child,depth+1]);}
  const encoded=JSON.stringify(value);
  const content=sha(encoded??'null'),source=observation.subject?.digest?.sha256??null,name=observation.subject?.name??observation.operation,path=`native-observation/${name}`,links=[observation.evidence_id];
  const evidence=fact(source,path,'native-analysis-provider','inferred',null,links);evidence.limitations.push('Caller-supplied native evidence is compared as recorded; this operation does not re-run or attest the provider.');
  const n=node('artifact',localIdentity(source??content,'native-observation',`${name}:${observation.operation}:${content}`),name,{path,sha256:source,normalized_sha256:content,operation:observation.operation,native_observation:true},evidence);
  nodes.push(n);for(const root of application.graph.root_node_ids)edges.push(edge(root,n,'contains',evidence,{caller_supplied_native_observation:true}));
 }
 return {...application,graph:graph(application.graph.root_node_ids,nodes,edges,application.graph.coverage,[...application.graph.limitations,'Native observations are compared within the caller-supplied evidence scope.'])};
}
