import { randomUUID } from 'node:crypto';

const introspection=new Set(['binary_session','list_documents','current_document','current_address']);
const providerOf=(ctx,operation)=>{const native=ctx.nativeOperations?.has(operation),m=native?ctx.nativeSession?.model:null,selected=native?ctx.target?.provider_id:null;return {id:m?.provider??selected??'real-independent',name:m?.provider??selected??'Reclaimer independent implementation',version:m?.provider_version??null};};
export const createObservations=()=>({sequence:0,runId:null,active:new Map(),last:null});
export function beginObservation(ctx,operation){
 if(introspection.has(operation))return null;
 const state=ctx.operationObservations;
 state.runId??=randomUUID();
 const entry={request_id:++state.sequence,operation,provider:providerOf(ctx,operation),started:performance.now(),signal:ctx.signal};
 state.active.set(entry.request_id,entry);return entry;
}
export function finishObservation(ctx,entry,cause,result){
 if(!entry)return;
 const state=ctx.operationObservations;state.active.delete(entry.request_id);
 state.last={request_id:entry.request_id,operation:entry.operation,provider:result?.provider??providerOf(ctx,entry.operation),failed:!!cause,cancelled:!!entry.signal?.aborted||cause?.code==='cancelled'||cause?.name==='AbortError'};
}
export function observedSession(ctx,capabilities,digest){
 const state=ctx.operationObservations,active=[...state.active.values()],providers=new Map();
 for(const entry of active){const p=entry.provider;if(!providers.has(p.id))providers.set(p.id,{provider:p,active:{request_id:entry.request_id,operation:entry.operation,elapsed_ms:Math.max(0,Math.round(performance.now()-entry.started)),caller_state:entry.signal?.aborted?'cancelled':'waiting'},queued_requests:0});}
 if(!active.length&&state.last)providers.set(state.last.provider.id,{provider:state.last.provider,active:null,queued_requests:0});
 const m=ctx.nativeSession?.model,version=m?.provider_version;
 let binding=null;
 if(ctx.target&&m&&typeof version==='string'&&version.length){const provider={id:m.provider,name:m.provider,version},parameters={source_sha256:ctx.target.sha256,format:ctx.target.format,architecture:ctx.target.architecture};binding={provider,selection_source:ctx.nativeSession.selectionSource??'request',analysis_profile:{provider,parameters,digest:digest({provider,parameters})}};}
 const stage=operation=>/decomp|pseudo/.test(operation)?'decompilation':'analysis';
 return {capabilities,analysis_run:state.runId?{run_id:state.runId,process_lineage:{status:'not_observed'}}:null,
  analysis_activity:{status:active.length?'busy':state.last?'idle':'not_observed',providers:[...providers.values()]},
  provider_operation_health:{state:active.length?'busy':state.last?.failed?'unknown':state.last?'idle':'not_started',stage:active.length?stage(active[0].operation):state.last?stage(state.last.operation):null,retry_action:active.length?'wait':state.last?.failed?'retry':null,exit_code:null,requests:active.map(e=>({request_id:e.request_id,operation:e.operation,stage:stage(e.operation)}))},analysis_provider_binding:binding};
}
