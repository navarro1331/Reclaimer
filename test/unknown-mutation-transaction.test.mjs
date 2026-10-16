import test from 'node:test';
import assert from 'node:assert/strict';
import {Context,InvestigationError} from '../lib/core.mjs';
import {handlers,bundle,checkBundle} from '../lib/evidence.mjs';

const question=label=>({question:'Owned mutation transaction '+label,severity:'high',domain:'behavior',
  required_authority:'controlled-replay',required_confidence:'observed',required_environment:null,
  recommended_probes:[],relationships:[]});
const update=u=>({unknown_id:u.unknown_id,expected_revision:u.revision,status:'investigating',severity:'high',
  supporting_evidence_ids:[],contradicting_evidence_ids:[],required_authority:'controlled-replay',
  required_confidence:'observed',required_environment:null,recommended_probes:[],relationships:[],resolution:null});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function fixture(t,operation){
  const ctx=new Context({signal:t.signal});ctx.handlers=handlers;
  ctx.run=async()=>assert.fail('Owned ledger fixtures must not launch a provider or target');
  await ctx.evidence('owned_mutation_marker',{}, {value:61},{subject:null,authority:'analyst-inference'});
  await ctx.call('record_unknown',question('unrelated'));
  const old=operation==='update_unknown'?(await ctx.call('record_unknown',question('subject'))).result:null;
  const args=old?update(old):question('subject');
  const capture=()=>({ledger:ctx.ledger,records:structuredClone([...ctx.ledger]),unknowns:ctx.unknowns,
    entries:structuredClone([...ctx.unknowns]),history:structuredClone(ctx.history),target:ctx.target});
  function unchanged(before){assert.equal(ctx.ledger,before.ledger);assert.deepEqual([...ctx.ledger],before.records);
    assert.equal(ctx.unknowns,before.unknowns);assert.deepEqual([...ctx.unknowns],before.entries);
    assert.deepEqual(ctx.history,before.history);assert.equal(ctx.target,before.target);checkBundle(bundle(ctx));}
  return {ctx,args,old,capture,unchanged};
}

for(const operation of ['record_unknown','update_unknown']){
  for(const mode of ['capacity after preparation','cancel before preparation','cancel after preparation']){
    test(operation+' '+mode+' retains the complete prior ledger and permits retry',async t=>{
      const f=await fixture(t,operation),controller=new AbortController();f.ctx.signal=controller.signal;
      const evidence=f.ctx.evidence.bind(f.ctx);f.ctx.evidence=async(op,...args)=>{
        if(op!=='unknown_mutation')return evidence(op,...args);
        if(mode==='cancel before preparation')controller.abort();
        const event=await evidence(op,...args);
        if(mode==='capacity after preparation')throw new InvestigationError('capacity',op,'Owned prepared-event failure');
        controller.abort();return event;
      };
      const before=f.capture();await assert.rejects(f.ctx.call(operation,f.args),e=>mode.startsWith('capacity')?
        e.code==='capacity':e.name==='AbortError'||e.code==='cancelled');f.unchanged(before);
      f.ctx.evidence=evidence;f.ctx.signal=t.signal;const out=(await f.ctx.call(operation,f.args)).result;
      assert.equal(out.revision,(f.old?.revision??0)+1);assert.equal(f.ctx.ledger.size,before.records.length+1);
      checkBundle(bundle(f.ctx));
    });
  }

  test(operation+' exposes no prepared event or revision before synchronous commit',async t=>{
    const f=await fixture(t,operation),entered=deferred(),release=deferred(),evidence=f.ctx.evidence.bind(f.ctx);
    f.ctx.evidence=async(op,...args)=>{const event=await evidence(op,...args);
      if(op==='unknown_mutation'){entered.resolve();await release.promise;}return event;};
    const before=f.capture(),outcome=f.ctx.call(operation,f.args).then(value=>({value}),error=>({error}));
    try{await Promise.race([entered.promise,outcome.then(r=>assert.fail('Mutation ended before owned pause: '+r.error?.message))]);
      f.unchanged(before);}
    finally{release.resolve();await outcome;}
    assert.ok((await outcome).value);assert.equal(f.ctx.ledger.size,before.records.length+1);checkBundle(bundle(f.ctx));
  });

  test(operation+' rejects a competing commit without an orphan event or lost revision',async t=>{
    const f=await fixture(t,operation),entered=deferred(),release=deferred(),evidence=f.ctx.evidence.bind(f.ctx);let held=false;
    f.ctx.evidence=async(op,...args)=>{const event=await evidence(op,...args);
      if(op==='unknown_mutation'&&!held){held=true;entered.resolve();await release.promise;}return event;};
    const before=f.capture(),outcome=f.ctx.call(operation,f.args).then(value=>({value}),error=>({error}));let after,winner;
    try{await Promise.race([entered.promise,outcome.then(r=>assert.fail('Mutation ended before owned race: '+r.error?.message))]);
      const args=operation==='record_unknown'?{...f.args,severity:'low'}:{...f.args,status:'open'};
      winner=(await f.ctx.call(operation,args)).result;after=f.capture();}
    finally{release.resolve();await outcome;}
    assert.match((await outcome).error?.message??'',/already retained|revision conflict/i);f.unchanged(after);
    assert.equal(f.ctx.ledger.size,before.records.length+1);assert.deepEqual(f.ctx.unknowns.get(winner.unknown_id),winner);
    if(operation==='update_unknown')assert.equal(winner.previous_revision_digest,f.old.revision_digest);
  });

  test(operation+' preserves revision chains, event identity, unrelated state and response ownership',async t=>{
    const f=await fixture(t,operation),before=f.capture(),reply=await f.ctx.call(operation,f.args),out=structuredClone(reply.result);
    assert.equal(out.revision,(f.old?.revision??0)+1);assert.equal(out.previous_revision_digest,f.old?.revision_digest??null);
    assert.equal(f.ctx.ledger.size,before.records.length+1);assert.equal(f.ctx.history.length,before.history.length+1);
    const id=out.mutation_evidence_ids.at(-1),event=f.ctx.ledger.get(id);assert.equal(event.operation,'unknown_mutation');
    assert.equal(event.parameters.operation,operation);assert.deepEqual(event.normalized_result,{unknown_id:out.unknown_id,revision:out.revision,status:out.status});
    assert.deepEqual(out.mutation_evidence_ids.slice(0,-1),f.old?.mutation_evidence_ids??[]);
    for(const [id,r]of before.records)assert.deepEqual(f.ctx.ledger.get(id),r);
    for(const [id,u]of before.entries)if(id!==out.unknown_id)assert.deepEqual(f.ctx.unknowns.get(id),u);
    reply.result.question='Caller-only change';reply.result.mutation_evidence_ids.length=0;
    assert.deepEqual(f.ctx.unknowns.get(out.unknown_id),out);checkBundle(bundle(f.ctx));
    await assert.rejects(f.ctx.call(operation,f.args),/already retained|Revision conflict/);
  });

  test(operation+' pre-aborted request preserves the complete ledger',async t=>{
    const f=await fixture(t,operation),before=f.capture(),controller=new AbortController();controller.abort();f.ctx.signal=controller.signal;
    await assert.rejects(f.ctx.call(operation,f.args),e=>e.code==='cancelled');f.unchanged(before);
  });
}
