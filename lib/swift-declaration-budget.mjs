import {InvestigationError} from './core.mjs';

export const SWIFT_DECLARATION_LIMITS=Object.freeze({maxBytes:64*1024*1024,maxOperands:1000000,maxOutputBytes:16*1024*1024,maxDepth:128});
export function declarationBudget({maxRecords=20000,signal,tick}={}) {
 const used={bytes:0,records:0,operands:0,output:0,work:0};
 const limits={bytes:SWIFT_DECLARATION_LIMITS.maxBytes,records:maxRecords,operands:SWIFT_DECLARATION_LIMITS.maxOperands,output:SWIFT_DECLARATION_LIMITS.maxOutputBytes,work:maxRecords*256};
 const charge=(dimension,n=1)=>{signal?.throwIfAborted();used[dimension]+=n;if(used[dimension]>limits[dimension])throw new InvestigationError('capacity','swift-declarations','Aggregate serialized declaration budget exceeded',{dimension,limit:limits[dimension],observed:used[dimension]});};
 return {used,limits,charge,record(){charge('records');tick?.();},work(){charge('work');},output(value){charge('output',Buffer.byteLength(JSON.stringify(value),'utf8'));},text(value){if(Buffer.byteLength(value,'utf8')>65536)throw new InvestigationError('capacity','swift-declarations','Expanded declaration expression exceeds string budget',{limit:65536});return value;}};
}
