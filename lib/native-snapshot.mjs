import {canonical, InvestigationError} from './core.mjs';
import {checkBundle} from './evidence.mjs';

const keys=['names','comments','inlineComments','bookmarks'];
const invalid=message=>{throw new InvestigationError('input','open_binary',message);};

// Validate and own all restore values before the selected target, session or
// ledger changes. Content checks reuse the existing evidence import rules;
// historical identifiers retain their existing opaque-reference treatment.
export function stageNativeSnapshot(snapshot,target,ctx,checkAddress) {
  ctx.signal?.throwIfAborted();
  if(snapshot?.protocol!=='real-independent-native-snapshot-v1'||snapshot.target?.sha256!==target.sha256)
    throw new Error('Snapshot does not match selected artifact');
  const input=snapshot.annotations??{};
  if(typeof input!=='object'||Array.isArray(input))invalid('Snapshot annotations must be an object');
  const annotations=Object.fromEntries(keys.map(key=>[key,new Map()]));
  for(const key of keys){
    if(!Object.hasOwn(input,key))continue;
    const entries=input[key];
    if(!Array.isArray(entries))invalid('Snapshot annotation entries must be arrays');
    for(const entry of entries){
      ctx.signal?.throwIfAborted();
      if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='string'||entry[1]!==null&&typeof entry[1]!=='string')
        invalid('Snapshot annotation entries must contain an address and text or null');
      try{checkAddress(entry[0]);}catch{invalid('Snapshot annotation address is invalid');}
      if(annotations[key].has(entry[0]))invalid('Snapshot contains a duplicate annotation key');
      annotations[key].set(entry[0],entry[1]);
    }
  }
  const records=snapshot.evidence??[];
  if(!Array.isArray(records))invalid('Snapshot evidence must be an array');
  try{
    // Snapshots carry records only; the bundle's derived inventories and unknown
    // ledger are neither part of this format nor imported through this path.
    checkBundle({artifacts:[],providers:[],environments:[],scenarios:[],captures:[],unknowns:[],records});
  }catch(error){invalid('Snapshot evidence is invalid: '+error.message);}
  for(const record of records){
    ctx.signal?.throwIfAborted();
    const retained=ctx.ledger.get(record.evidence_id);
    if(retained&&canonical(retained)!==canonical(record))invalid('Snapshot evidence identifier conflicts with retained content');
  }
  ctx.signal?.throwIfAborted();
  return {annotations,records:structuredClone(records)};
}
