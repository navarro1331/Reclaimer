import {digest} from './core.mjs';
import {stagedResult} from './operation-commit.mjs';

export const annotationOperations = new Set(['annotate_native_function','set_comment','set_inline_comment','set_address_name','set_addresses_names','set_bookmark','unset_bookmark']);
const mapKeys = ['names','comments','inlineComments','bookmarks'];
class DraftMap extends Map {
  constructor(source) {
    super(); this.written = new Set();
    for (const [key,value] of source) super.set(key,value);
  }
  set(key,value) { this.written.add(key); return super.set(key,value); }
  delete(key) { this.written.add(key); return super.delete(key); }
}
function sameEntries(left,right) {
  if (left.size !== right.size) return false;
  const entries = right.entries();
  for (const [key,value] of left) {
    const next = entries.next();
    if (next.done || key !== next.value[0] || !Object.is(value,next.value[1])) return false;
  }
  return true;
}
export async function stageAnnotations(operation,args,ctx,prepare) {
  const target = ctx.target, session = ctx.nativeSession, signal = ctx.signal;
  const ledger = ctx.ledger, history = ctx.history, maps = {}, originals = {}, drafts = {};
  if (session) for (const key of mapKeys) {
    maps[key] = session[key]; originals[key] = new Map(maps[key]); drafts[key] = new DraftMap(originals[key]);
  }
  let observedModel;
  const scope = Object.create(ctx);
  Object.defineProperty(scope,'target',{get() {
    if (ctx.target !== target || ctx.nativeSession !== session) throw new Error('Native annotation session changed during preparation');
    return target;
  }});
  scope.signal = signal; scope.ledger = new Map(); scope.history = [];
  scope.call = (op,parameters) => ctx.call(op,parameters);
  // Analysis caches and owned provider roots keep their existing session owner.
  // Only the four manual annotation maps are request-local drafts.
  scope.nativeSession = session ? new Proxy(session, {
    get(selected,key) {
      if (Object.hasOwn(drafts,key)) return drafts[key];
      const value = Reflect.get(selected,key);
      if (key === 'model' && value) {
        if (observedModel && observedModel !== value) throw new Error('Native annotation model changed during preparation');
        observedModel = value;
      }
      return value;
    },
    set(selected,key,value) {
      if (mapKeys.includes(key)) throw new Error('Native annotation draft map cannot be replaced');
      if (key === 'model' && value) {
        if (observedModel && observedModel !== value) throw new Error('Native annotation model changed during preparation');
        observedModel = value;
      }
      return Reflect.set(selected,key,value);
    },
  }) : session;
  scope.evidence = (op,parameters,value,options = {}) => ctx.evidence.call(scope,op,parameters,value,{...options,publish:false});
  // Detach both the caller reply and retained record from model/draft aliases.
  const result = structuredClone(await prepare(scope)), held = structuredClone(result), preparedDigest = digest(held);
  return stagedResult(result,ctx,operation,signal,() => {
    signal?.throwIfAborted();
    if (ctx.target !== target || ctx.nativeSession !== session || ctx.ledger !== ledger || ctx.history !== history) throw new Error('Native annotation session changed during preparation');
    if (digest(result) !== preparedDigest) throw new Error('Prepared native annotation response changed');
    if (observedModel && session.model !== observedModel) throw new Error('Native annotation model changed during preparation');
    for (const key of mapKeys) if (session && session[key] !== maps[key]) throw new Error('Native annotation map changed during preparation');
    if (operation === 'annotate_native_function') for (const key of ['names','comments','inlineComments']) {
      if (!sameEntries(originals[key],maps[key])) throw new Error('Native annotation dossier changed during preparation');
    }
    for (const key of mapKeys) for (const address of drafts[key]?.written ?? []) {
      if (maps[key].has(address) !== originals[key].has(address) || !Object.is(maps[key].get(address),originals[key].get(address))) throw new Error('Native annotation conflict at '+address);
    }
    if (ledger.has(held.evidence_id) && digest(ledger.get(held.evidence_id)) !== preparedDigest) throw new Error('Native annotation evidence conflicts with retained content');
    // No await separates these deltas, evidence publication, and Context.call's
    // successful history append. Disjoint committed keys/records are retained.
    for (const key of mapKeys) for (const address of drafts[key]?.written ?? []) {
      if (drafts[key].has(address)) maps[key].set(address,drafts[key].get(address));
      else maps[key].delete(address);
    }
    if (!ledger.has(held.evidence_id)) ledger.set(held.evidence_id,held);
  });
}
