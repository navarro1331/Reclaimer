import { canonical, InvestigationError } from './core.mjs';
import { chargeJsonBytes } from './bounded-json.mjs';

const collections = { terminal_raw:'frames', terminal_rendered:'rendered_frames', interaction:'interaction_events', lifecycle:'lifecycle', process:'process_samples', filesystem:'filesystem_checkpoints' };
const maxWork = 1_000_000;
const validId = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(value);
const invalid = message => { throw new InvestigationError('input','compare_process_captures',message); };
const stripped = (value, ignore) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(([key])=>!ignore.includes(key))) : value;
const sameMultiset = (left,right) => canonical([...left].sort()) === canonical([...right].sort());

/** Evaluate only the captured journal. No target is launched and no omitted event is invented. */
export function compareTrace(spec, left, right, signal) {
  if (spec.events.length > 4096) throw new InvestigationError('capacity','compare_process_captures','Trace specification exceeds 4096 event predicates');
  const ids = new Set();
  for (const event of spec.events) {
    if (!validId(event.id) || ids.has(event.id)) invalid('Trace event IDs must be unique portable identifiers');
    if (event.cardinality?.kind === 'range' && event.cardinality.min > event.cardinality.max) invalid('Trace cardinality minimum exceeds maximum');
    ids.add(event.id);
  }
  const language=spec.language;
  let references=0;const reference=id=>{if(++references>100000)throw new InvestigationError('capacity','compare_process_captures','Trace reference bound exceeded');if(!ids.has(id))invalid('Trace language references an undeclared event');};
  if(language.kind==='finite_traces'){if(language.variants.length>4096)throw new InvestigationError('capacity','compare_process_captures','Finite trace variant bound exceeded');for(const variant of language.variants)for(const token of variant.trace)if(typeof token==='string')reference(token);else for(const id of token.unordered)reference(id);}
  else {for(const id of [...(language.prefix??[]),...(language.suffix??[])])reference(id);for(const e of language.happens_before??[]){reference(e.before);reference(e.after);}for(const e of language.not_before??[]){reference(e.event);reference(e.anchor);}for(const group of language.unordered_groups??[])for(const id of group.events)reference(id);}
  if (language.kind==='finite_traces' && (new Set(language.variants.map(v=>v.id)).size!==language.variants.length || language.variants.some(v=>!validId(v.id)))) invalid('Finite trace variant IDs must be unique portable identifiers');
  let work=0;
  const tick=()=>{ signal?.throwIfAborted(); if(++work>maxWork) throw new InvestigationError('capacity','compare_process_captures','Trace evaluation exceeds one million bounded work steps'); };
  let jsonBytes=0;
  const encoded=value=>{chargeJsonBytes(value,size=>{jsonBytes+=size;if(jsonBytes>16*1024*1024)throw new InvestigationError('capacity','compare_process_captures','Trace JSON comparison exceeds sixteen MiB');},tick);const pending=[[value,0]];while(pending.length){tick();const [current,depth]=pending.pop();if(depth>128)throw new InvestigationError('capacity','compare_process_captures','Trace JSON nesting exceeds 128 levels');if(current&&typeof current==='object')for(const child of Object.values(current))if(child&&typeof child==='object')pending.push([child,depth+1]);}return canonical(value);};
  const expected=new Map(spec.events.map(e=>[e.id,encoded(stripped(e.exact,e.ignore_fields??[]))]));
  function evaluate(capture,side) {
    const result={satisfied_constraints:[],raw_trace:[],status:'pass',matched_variant:null};
    let diagnostic=null;
    const reject=(kind,message,event_ids=[],locations=[],status='fail')=>{result.status=status;result.matched_variant=null;diagnostic={kind,side,message,event_ids,locations};return {result,diagnostic};};
    const journal=capture.event_journal;
    if (!Array.isArray(journal)) return reject('journal','Capture has no event journal',[],[],'unknown');
    for(const collection of new Set(spec.events.map(e=>collections[e.source])))if(!Array.isArray(capture[collection]))return reject('journal',`Requested event collection ${collection} was not captured`,[],[],'unknown');
    if (journal.length>100_000) throw new InvestigationError('capacity','compare_process_captures','Capture journal exceeds one hundred thousand records');
    const seen=new Set(),byEvent=new Map();let previous=-1;
    for (const location of journal) {
      tick(); const {collection,index,capture_order}=location;
      if (!Object.values(collections).includes(collection) || !Number.isSafeInteger(index) || index<0 || !Number.isSafeInteger(capture_order) || capture_order<=previous || !Array.isArray(capture[collection]) || index>=capture[collection].length || seen.has(`${collection}:${index}`)) return reject('journal','Capture journal is inconsistent or ambiguous',[],[],'unknown');
      seen.add(`${collection}:${index}`); previous=capture_order;
      const value=capture[collection][index],matches=[],encodings=new Map();
      for (const event of spec.events) { tick();if(collections[event.source]!==collection)continue;const key=[...(event.ignore_fields??[])].sort().join(',');if(!encodings.has(key))encodings.set(key,encoded(stripped(value,event.ignore_fields??[])));if(encodings.get(key)===expected.get(event.id))matches.push(event.id); }
      if (matches.length>1) return reject('predicate','More than one event predicate matches the same captured record',matches,[location],'unknown');
      if(matches.length){result.raw_trace.push({event_id:matches[0],location:{collection,index,capture_order}});const positions=byEvent.get(matches[0])??[];positions.push(capture_order);byEvent.set(matches[0],positions);}
    }
    // A missing journal entry cannot establish absence or ordering.
    for (const collection of new Set(spec.events.map(e=>collections[e.source]))) for(let index=0;index<(capture[collection]?.length??0);index++){tick();if(!seen.has(`${collection}:${index}`))return reject('journal','Relevant captured records are missing from the journal',[],[],'unknown');}
    const trace=result.raw_trace.map(e=>e.event_id), positions=id=>byEvent.get(id)??[];
    for(const event of spec.events){
      tick(); const count=positions(event.id).length,c=event.cardinality??{kind:'required'},min=c.kind==='optional'?0:c.kind==='exact'?c.count:c.kind==='range'?c.min:1,max=c.kind==='exact'?c.count:c.kind==='range'?c.max:1;
      if(count<min||count>max)return reject('cardinality',`Event ${event.id} occurred ${count} times; expected ${min}..${max}`,[event.id],result.raw_trace.filter(e=>e.event_id===event.id).map(e=>e.location),capture.truncated&&count<min?'unknown':'fail');
      result.satisfied_constraints.push(`cardinality:${event.id}`);
    }
    if(language.kind==='finite_traces') {
      const matches=language.variants.filter(variant=>{
        let offset=0;
        for(const token of variant.trace){tick();const expected=typeof token==='string'?[token]:token.unordered,actual=trace.slice(offset,offset+expected.length);if(!sameMultiset(actual,expected))return false;offset+=expected.length;}
        return offset===trace.length;
      });
      if(!matches.length)return reject('trace','Captured event trace matches no allowed finite variant',trace,result.raw_trace.map(e=>e.location),capture.truncated?'unknown':'fail');
      result.matched_variant=matches[0].id;result.satisfied_constraints.push(`variant:${matches[0].id}`);
    } else {
      for(const [i,edge] of (language.happens_before??[]).entries()) {
        tick();const before=positions(edge.before),after=positions(edge.after);
        if(before.length&&after.length&&before.at(-1)>=after[0])return reject('edge','A happens-before constraint is violated',[edge.before,edge.after],result.raw_trace.filter(e=>[edge.before,edge.after].includes(e.event_id)).map(e=>e.location));
        result.satisfied_constraints.push(`happens_before:${i}`);
      }
      for(const [i,edge] of (language.not_before??[]).entries()) {
        tick();const event=positions(edge.event),anchor=positions(edge.anchor);
        if(event.length&&(!anchor.length||event[0]<anchor[0]))return reject('edge','A not-before constraint is violated',[edge.event,edge.anchor]);
        result.satisfied_constraints.push(`not_before:${i}`);
      }
      for(const key of ['prefix','suffix']) {const expected=language[key]??[],actual=key==='prefix'?trace.slice(0,expected.length):expected.length?trace.slice(-expected.length):[];if(canonical(actual)!==canonical(expected))return reject(key,`Captured event trace violates the required ${key}`,expected,[],capture.truncated?'unknown':'fail');result.satisfied_constraints.push(key);}
      // Unordered groups do not imply extra ordering. Membership remains governed by cardinality.
      for(const [i] of (language.unordered_groups??[]).entries())result.satisfied_constraints.push(`unordered_group:${i}`);
    }
    if(capture.truncated)return reject('journal','A truncated capture cannot establish complete trace conformance',[],[],'unknown');
    return {result,diagnostic};
  }
  const l=evaluate(left,'left'),r=evaluate(right,'right');
  const verdict=[l.result.status,r.result.status].includes('fail')?'nonconforming':[l.result.status,r.result.status].includes('unknown')?'unknown':language.kind==='finite_traces'&&l.result.matched_variant!==r.result.matched_variant?'different':'equivalent';
  return {verdict,left:l.result,right:r.result,diagnostic:l.diagnostic??r.diagnostic};
}
