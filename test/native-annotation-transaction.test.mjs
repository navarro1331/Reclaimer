import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Context,InvestigationError} from '../lib/core.mjs';
import {handlers} from '../lib/native.mjs';
import {digest} from '../lib/artifact-binary.mjs';
import {elfFixture} from './artifact-fixtures.mjs';

// Independently authored cached metadata exercises local annotations. No vendor,
// selected executable, transaction implementation helper or private hook runs.
const entry='0x400000',leaf='0x400010',other='0x400009';
const mapKeys=['names','comments','inlineComments','bookmarks'];
const removed=Symbol('removed');
const options={timeout:15000};
const specs=[
  {op:'annotate_native_function',args:{procedure:'owned_entry',name:'after-entry',comment:'after-comment',inline_comment:'after-inline'},
    changes:[['names',entry,'after-entry'],['comments',entry,'after-comment'],['inlineComments',entry,'after-inline']]},
  {op:'set_comment',args:{address:entry,comment:'after-comment'},changes:[['comments',entry,'after-comment']]},
  {op:'set_inline_comment',args:{address:entry,comment:'after-inline'},changes:[['inlineComments',entry,'after-inline']]},
  {op:'set_address_name',args:{address:entry,name:'after-entry'},changes:[['names',entry,'after-entry']]},
  {op:'set_addresses_names',args:{names:{'ram:400000':'after-entry','0x400005':'after-batch'}},
    changes:[['names',entry,'after-entry'],['names','0x400005','after-batch']]},
  {op:'set_bookmark',args:{address:entry,name:'after-bookmark'},changes:[['bookmarks',entry,'after-bookmark']]},
  {op:'unset_bookmark',args:{address:entry},changes:[['bookmarks',entry,removed]]},
];
const specFor=op=>specs.find(s=>s.op===op);
function model(source){
  return {protocol:'real-native-model-v1',provider:'ghidra',source_sha256:digest(source),
    architecture:'x86_64',language_id:'x86:LE:64:default',compiler_spec_id:'gcc',image_base:entry,format:'ELF',
    segments:[{name:'owned-text',start:entry,end:'0x400020',read:true,write:false,execute:true,
      initialized:true,overlay:false,address_space:'ram',file_offset:256,file_size:32}],
    functions:[['owned_entry',entry,'0x400010'],['owned_leaf',leaf,'0x400020']].map(([name,address,end])=>({
      name,address,external:false,thunk:false,thunk_target:null,ranges:[{start:address,end}],total_bytes:16,
      signature:'void '+name+'(void)',locals:[],basic_blocks:[{start:address,end,successors:[]}],
      pseudocode:'void '+name+'(void) { /* independently authored packet */ }'})),
    symbols:[{address:entry,name:'owned_entry'},{address:leaf,name:'owned_leaf'}],
    instructions:[{address:entry,procedure:entry,bytes:'c3',length:1,mnemonic:'RET',text:'RET',operands:[],
      flow:{kind:'return',conditional:false,computed:false,direct_destinations:[]}}],
    references:[{source:entry,target:leaf,type:'UNCONDITIONAL_CALL',call:true,jump:false,data:false,
      read:false,write:false,flow:true,indirect:false,computed:false,conditional:false,terminal:false,
      primary:true,operand_index:0,external:false}],strings:[],
    limitations:['Independently authored cached provider-shaped packet; no live vendor or target proof.']};
}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
const outcome=promise=>promise.then(value=>({value}),error=>({error}));
const cancelled=(error,reason)=>error?.code==='cancelled'||error?.name==='AbortError'||error===reason;
// New conflict diagnostics retain the existing operation-failure route; tests
// require rejection and exact surviving state without fixing private wording.
const stale=error=>error instanceof Error&&error.code!=='input';
async function bounded(promise,label){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label)),5000);})]);}
  finally{clearTimeout(timer);}
}
async function fixture(t){
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'reclaimer-annotation-transaction-'));
  const file=path.join(folder,'owned.elf'),source=elfFixture();
  await fs.writeFile(file,source,{flag:'wx'});
  const ctx=new Context({signal:t.signal,config:{nativeProvider:'custom'}});ctx.handlers={...handlers};
  ctx.run=async()=>assert.fail('Owned annotation transactions must not launch a provider or target');
  await ctx.call('open_binary',{path:file});
  ctx.nativeSession.model=model(source);
  ctx.nativeSession.names.set(entry,'prior-entry');ctx.nativeSession.names.set(leaf,'prior-leaf');
  ctx.nativeSession.names.set('register:0xA','unrelated-name');
  ctx.nativeSession.comments.set(entry,'prior-comment');ctx.nativeSession.comments.set('0x400001','wider-comment');
  ctx.nativeSession.inlineComments.set(entry,'prior-inline');ctx.nativeSession.inlineComments.set('0x400002','wider-inline');
  ctx.nativeSession.bookmarks.set(entry,'prior-bookmark');ctx.nativeSession.bookmarks.set(leaf,null);
  await ctx.evidence('owned_annotation_marker',{}, {marker:23},{subject:null,authority:'analyst-inference'});
  const capture=()=>({target:ctx.target,session:ctx.nativeSession,
    maps:Object.fromEntries(mapKeys.map(k=>[k,{ref:ctx.nativeSession[k],entries:structuredClone([...ctx.nativeSession[k]])}])),
    modelRef:ctx.nativeSession.model,model:structuredClone(ctx.nativeSession.model),
    ledger:ctx.ledger,records:structuredClone([...ctx.ledger]),unknowns:ctx.unknowns,
    unknownEntries:structuredClone([...ctx.unknowns]),historyRef:ctx.history,history:structuredClone(ctx.history)});
  function unchanged(before){
    assert.equal(ctx.target,before.target);assert.equal(ctx.nativeSession,before.session);
    for(const [key,value]of Object.entries(before.maps)){
      assert.equal(ctx.nativeSession[key],value.ref,key+' map identity');
      assert.deepEqual([...ctx.nativeSession[key]],value.entries,key+' contents');
    }
    assert.equal(ctx.nativeSession.model,before.modelRef);assert.deepEqual(ctx.nativeSession.model,before.model);
    assert.equal(ctx.ledger,before.ledger);assert.deepEqual([...ctx.ledger],before.records);
    assert.equal(ctx.unknowns,before.unknowns);assert.deepEqual([...ctx.unknowns],before.unknownEntries);
    assert.equal(ctx.history,before.historyRef);assert.deepEqual(ctx.history,before.history);
  }
  const sourceUnchanged=async()=>assert.equal(digest(await fs.readFile(file)),digest(source));
  t.after(async()=>{
    ctx.signal=undefined;ctx.evidence=Context.prototype.evidence;ctx.read=Context.prototype.read;ctx.handlers={...handlers};
    if(ctx.target)await ctx.call('close_binary',{});
    await sourceUnchanged();
    assert.equal(await fs.realpath(path.dirname(folder)),await fs.realpath(os.tmpdir()));
    assert.ok(path.basename(folder).startsWith('reclaimer-annotation-transaction-'));
    await fs.rm(folder,{recursive:true,force:true});
  });
  return {ctx,file,source,capture,unchanged,sourceUnchanged};
}
function expectedMaps(before,changes){
  const maps=Object.fromEntries(mapKeys.map(k=>[k,{ref:before.maps[k].ref,entries:before.maps[k].entries}]));
  const values=Object.fromEntries(mapKeys.map(k=>[k,new Map(before.maps[k].entries)]));
  for(const [key,address,value]of changes)value===removed?values[key].delete(address):values[key].set(address,value);
  for(const key of mapKeys)maps[key].entries=[...values[key]];
  return maps;
}
function afterSuccessful(f,before,spec,reply){
  const records=new Map(before.records);records.set(reply.evidence_id,structuredClone(f.ctx.ledger.get(reply.evidence_id)));
  const history=structuredClone(f.ctx.history.at(-1));
  assert.equal(history.operation,spec.op);assert.equal(history.evidence_id,reply.evidence_id);
  return {...before,maps:expectedMaps(before,spec.changes),records:[...records],history:[...before.history,history]};
}
async function success(f,spec,before=f.capture()){
  const reply=await f.ctx.call(spec.op,spec.args);
  assert.equal(reply.operation,spec.op);
  if(spec.op==='annotate_native_function'){
    assert.deepEqual(reply.normalized_result.annotations,{address:entry,name:'after-entry',comment:'after-comment',inline_comment:'after-inline'});
    assert.equal(reply.normalized_result.dossier.procedure.name,'after-entry');
    assert.ok(reply.normalized_result.dossier.comments.some(c=>c.address===entry&&c.kind==='comment'&&c.text==='after-comment'));
    assert.ok(reply.normalized_result.dossier.comments.some(c=>c.address===entry&&c.kind==='inline'&&c.text==='after-inline'));
    assert.deepEqual(reply.normalized_result.effects,{scope:'session-analysis-database',source_bytes_modified:false,persists_after_close:false});
  }else if(spec.op==='set_addresses_names'){
    assert.deepEqual(reply.normalized_result,Object.fromEntries(Object.keys(spec.args.names).map(key=>[key,true])));
  }else assert.equal(reply.normalized_result,true);
  assert.deepEqual(f.ctx.ledger.get(reply.evidence_id),reply);
  f.unchanged(afterSuccessful(f,before,spec,reply));await f.sourceUnchanged();
  return reply;
}
function pauseEvidence(f,operation){
  const original=f.ctx.evidence,entered=deferred(),release=deferred();let used=false,prepared;
  f.ctx.evidence=async function(op,...args){
    const value=await original.call(this,op,...args);
    if(op===operation&&!used){used=true;prepared=value;entered.resolve();await release.promise;}
    return value;
  };
  return {release:release.resolve,restore(){f.ctx.evidence=original;},get prepared(){return prepared;},
    async entered(pending){await bounded(Promise.race([entered.promise,pending.then(result=>{
      if(!used)assert.fail('Owned pause was not reached: '+(result.error?.message??'unexpected success'));
    })]),'Owned annotation evidence pause was not reached');}};
}
async function settleGate(gate,pending){gate.release();return bounded(pending,'Owned annotation call did not settle after release');}

for(const spec of specs)for(const phase of ['before preparation','after preparation','abort after preparation']){
  test(spec.op+' '+phase+' preserves the complete prior state and permits retry',options,async t=>{
    const f=await fixture(t),controller=new AbortController(),reason=new Error('Owned annotation cancellation');
    f.ctx.signal=controller.signal;
    const original=f.ctx.evidence,failure=new InvestigationError('capacity',spec.op,'Owned annotation preparation failure');
    f.ctx.evidence=async function(op,...args){
      if(op!==spec.op)return original.call(this,op,...args);
      if(phase==='before preparation')throw failure;
      const value=await original.call(this,op,...args);
      if(phase==='after preparation')throw failure;
      controller.abort(reason);return value;
    };
    const before=f.capture();
    try{
      await assert.rejects(f.ctx.call(spec.op,spec.args),error=>phase==='abort after preparation'?cancelled(error,reason):error===failure);
      f.unchanged(before);await f.sourceUnchanged();
    }finally{f.ctx.evidence=original;f.ctx.signal=t.signal;}
    await success(f,spec,before);
  });
}

for(const op of ['set_comment','set_addresses_names','unset_bookmark','annotate_native_function']){
  test(op+' exposes neither draft annotations nor prepared evidence while paused',options,async t=>{
    const f=await fixture(t),spec=specFor(op),before=f.capture(),gate=pauseEvidence(f,op);
    const pending=outcome(f.ctx.call(op,spec.args));let result;
    try{await gate.entered(pending);assert.ok(gate.prepared.evidence_id);f.unchanged(before);await f.sourceUnchanged();}
    finally{result=await settleGate(gate,pending);gate.restore();}
    assert.equal(result.error,undefined);f.unchanged(afterSuccessful(f,before,spec,result.value));
  });
}

for(const op of ['set_comment','annotate_native_function']){
  test(op+' cancellation at the public handler handoff preserves prior state',options,async t=>{
    const f=await fixture(t),spec=specFor(op),controller=new AbortController(),reason=new Error('Owned final handoff cancellation');
    f.ctx.signal=controller.signal;const original=f.ctx.handlers[op];
    f.ctx.handlers[op]=async(args,ctx)=>{const reply=await original(args,ctx);controller.abort(reason);return reply;};
    const before=f.capture();
    try{await assert.rejects(f.ctx.call(op,spec.args),error=>cancelled(error,reason));f.unchanged(before);}
    finally{f.ctx.handlers[op]=original;f.ctx.signal=t.signal;}
    await success(f,spec,before);
  });
  test(op+' invalid final response cannot commit annotations or prepared evidence',options,async t=>{
    const f=await fixture(t),spec=specFor(op),original=f.ctx.handlers[op],before=f.capture();
    f.ctx.handlers[op]=async(args,ctx)=>{const reply=await original(args,ctx);reply.normalized_result='Owned invalid final response';return reply;};
    try{await assert.rejects(f.ctx.call(op,spec.args),error=>error.code==='contract');f.unchanged(before);}
    finally{f.ctx.handlers[op]=original;}
    await success(f,spec,before);
  });
}

test('valid-shaped final response mutation is rejected without committing',options,async t=>{
  const f=await fixture(t),spec=specFor('set_comment'),original=f.ctx.handlers[spec.op],before=f.capture();
  f.ctx.handlers[spec.op]=async(args,ctx)=>{const reply=await original(args,ctx);reply.normalized_result=false;return reply;};
  try{await assert.rejects(f.ctx.call(spec.op,spec.args),stale);f.unchanged(before);}
  finally{f.ctx.handlers[spec.op]=original;}
  await success(f,spec,before);
});

test('a successful nested annotation survives failure of its outer preparation',options,async t=>{
  const f=await fixture(t),outer=specFor('set_comment'),before=f.capture(),original=f.ctx.evidence;
  const winner={op:'set_inline_comment',args:{address:leaf,comment:'nested-winner'},changes:[['inlineComments',leaf,'nested-winner']]};
  const failure=new Error('Owned outer preparation failure');let nested,used=false;
  f.ctx.evidence=async function(op,...args){
    const value=await original.call(this,op,...args);
    if(op===outer.op&&!used){used=true;nested=await f.ctx.call(winner.op,winner.args);throw failure;}
    return value;
  };
  try{await assert.rejects(f.ctx.call(outer.op,outer.args),error=>error===failure);}
  finally{f.ctx.evidence=original;}
  assert.ok(nested);f.unchanged(afterSuccessful(f,before,winner,nested));await f.sourceUnchanged();
  await success(f,outer);
});

for(const outerFails of [true,false])test('disjoint successful writes survive a paused outer '+(outerFails?'failure':'success'),options,async t=>{
  const f=await fixture(t),outer=specFor('set_comment'),before=f.capture(),gate=pauseEvidence(f,outer.op);
  const winner={op:'set_comment',args:{address:leaf,comment:'disjoint-winner'},changes:[['comments',leaf,'disjoint-winner']]};
  const failure=new Error('Owned paused outer failure'),originalHandler=f.ctx.handlers[outer.op];let first=true;
  if(outerFails)f.ctx.handlers[outer.op]=async(args,ctx)=>{
    const chosen=first;first=false;const value=await originalHandler(args,ctx);if(chosen)throw failure;return value;
  };
  const pending=outcome(f.ctx.call(outer.op,outer.args));let expected,result;
  try{await gate.entered(pending);const reply=await f.ctx.call(winner.op,winner.args);expected=afterSuccessful(f,before,winner,reply);}
  finally{result=await settleGate(gate,pending);gate.restore();f.ctx.handlers[outer.op]=originalHandler;}
  if(outerFails){assert.equal(result.error,failure);f.unchanged(expected);}
  else{assert.equal(result.error,undefined);f.unchanged(afterSuccessful(f,expected,outer,result.value));}
  await f.sourceUnchanged();
});

for(const noOp of [false,true])test('a stale '+(noOp?'no-op ':'')+'same-key write cannot overwrite a successful competitor',options,async t=>{
  const f=await fixture(t),base=specFor('set_comment'),outer=noOp?{...base,args:{address:entry,comment:'prior-comment'}}:base;
  const before=f.capture(),gate=pauseEvidence(f,outer.op),pending=outcome(f.ctx.call(outer.op,outer.args));let expected,result;
  const winner={op:'set_comment',args:{address:entry,comment:'same-key-winner'},changes:[['comments',entry,'same-key-winner']]};
  try{await gate.entered(pending);expected=afterSuccessful(f,before,winner,await f.ctx.call(winner.op,winner.args));}
  finally{result=await settleGate(gate,pending);gate.restore();}
  assert.ok(result.error&&stale(result.error),'A stale same-key write must reject');f.unchanged(expected);await f.sourceUnchanged();
});

test('a paused absent-bookmark deletion cannot erase a newly present null bookmark',options,async t=>{
  const f=await fixture(t),before=f.capture(),gate=pauseEvidence(f,'unset_bookmark');
  const pending=outcome(f.ctx.call('unset_bookmark',{address:other}));let expected,result;
  const winner={op:'set_bookmark',args:{address:other},changes:[['bookmarks',other,null]]};
  try{await gate.entered(pending);expected=afterSuccessful(f,before,winner,await f.ctx.call(winner.op,winner.args));}
  finally{result=await settleGate(gate,pending);gate.restore();}
  assert.ok(result.error&&stale(result.error),'The absent-key deletion intent must reject a competing insertion');
  f.unchanged(expected);assert.equal(f.ctx.nativeSession.bookmarks.has(other),true);await f.sourceUnchanged();
});

for(const op of ['set_comment','annotate_native_function'])test(op+' rejects close/reopen of the same source while prepared',options,async t=>{
  const f=await fixture(t),spec=specFor(op),gate=pauseEvidence(f,op),pending=outcome(f.ctx.call(op,spec.args));let expected,result;
  try{
    await gate.entered(pending);await f.ctx.call('close_binary',{});await f.ctx.call('open_binary',{path:f.file});
    f.ctx.nativeSession.model=model(f.source);expected=f.capture();
  }finally{result=await settleGate(gate,pending);gate.restore();}
  assert.ok(result.error&&stale(result.error),'A replaced session must reject a stale annotation');
  f.unchanged(expected);await f.sourceUnchanged();
});

for(const originalAborted of [true,false])test('prepared annotations follow the original caller signal when the Context signal is replaced '+originalAborted,options,async t=>{
  const f=await fixture(t),spec=specFor('set_comment'),caller=new AbortController(),replacement=new AbortController();
  const reason=new Error('Owned original caller cancellation');f.ctx.signal=caller.signal;
  const before=f.capture(),gate=pauseEvidence(f,spec.op),pending=outcome(f.ctx.call(spec.op,spec.args));let result;
  try{
    await gate.entered(pending);f.ctx.signal=replacement.signal;
    if(originalAborted)caller.abort(reason);else replacement.abort(new Error('Unrelated replacement signal'));
  }finally{result=await settleGate(gate,pending);gate.restore();f.ctx.signal=t.signal;}
  if(originalAborted){assert.ok(result.error&&cancelled(result.error,reason));f.unchanged(before);await success(f,spec,before);}
  else{assert.equal(result.error,undefined);f.unchanged(afterSuccessful(f,before,spec,result.value));}
  await f.sourceUnchanged();
});

test('annotate second completed provider-model read failure preserves all prior annotations',options,async t=>{
  const f=await fixture(t),spec=specFor('annotate_native_function'),original=f.ctx.read,before=f.capture();
  const failure=new InvestigationError('capacity',spec.op,'Owned second dossier read failure');let reads=0;
  f.ctx.read=async function(file,...args){const value=await original.call(this,file,...args);if(path.resolve(file)===path.resolve(f.file)&&++reads===2)throw failure;return value;};
  try{await assert.rejects(f.ctx.call(spec.op,spec.args),error=>error===failure);assert.equal(reads,2);f.unchanged(before);}
  finally{f.ctx.read=original;}
  await success(f,spec,before);
});

for(const facet of ['names','comments'])test('annotate rejects a changed wider dossier '+facet+' read set and preserves the winner',options,async t=>{
  const f=await fixture(t),spec=specFor('annotate_native_function'),before=f.capture(),gate=pauseEvidence(f,spec.op);
  const pending=outcome(f.ctx.call(spec.op,spec.args));let expected,result;
  const winner=facet==='names'?{op:'set_address_name',args:{address:leaf,name:'wider-leaf'},changes:[['names',leaf,'wider-leaf']]}:
    {op:'set_comment',args:{address:'0x400001',comment:'wider-winner'},changes:[['comments','0x400001','wider-winner']]};
  try{await gate.entered(pending);expected=afterSuccessful(f,before,winner,await f.ctx.call(winner.op,winner.args));}
  finally{result=await settleGate(gate,pending);gate.restore();}
  assert.ok(result.error&&stale(result.error),'A changed dossier read set must reject stale annotation evidence');
  f.unchanged(expected);await f.sourceUnchanged();
});

test('replacement of an untouched annotation Map rejects the prepared call without replacing it again',options,async t=>{
  const f=await fixture(t),spec=specFor('set_comment'),gate=pauseEvidence(f,spec.op),pending=outcome(f.ctx.call(spec.op,spec.args));let expected,result;
  try{await gate.entered(pending);f.ctx.nativeSession.names=new Map(f.ctx.nativeSession.names);expected=f.capture();}
  finally{result=await settleGate(gate,pending);gate.restore();}
  assert.ok(result.error&&stale(result.error),'A replaced annotation Map must reject stale preparation');
  f.unchanged(expected);await f.sourceUnchanged();
});

test('primitive empty strings retain existing Map identities and exact source bytes',options,async t=>{
  const f=await fixture(t);
  for(const [op,key,field]of [['set_address_name','names','name'],['set_comment','comments','comment'],['set_inline_comment','inlineComments','comment']]){
    const before=f.capture(),spec={op,args:{address:entry,[field]:''},changes:[[key,entry,'']]};
    const reply=await f.ctx.call(op,spec.args);assert.equal(reply.normalized_result,true);f.unchanged(afterSuccessful(f,before,spec,reply));
  }
  await f.sourceUnchanged();
});

test('bookmark omission stores present null and unset preserves true/false absence semantics',options,async t=>{
  const f=await fixture(t),before=f.capture(),set={op:'set_bookmark',args:{address:other},changes:[['bookmarks',other,null]]};
  const added=await f.ctx.call(set.op,set.args);assert.equal(added.normalized_result,true);f.unchanged(afterSuccessful(f,before,set,added));
  assert.equal(f.ctx.nativeSession.bookmarks.has(other),true);assert.equal(f.ctx.nativeSession.bookmarks.get(other),null);
  const held=f.capture(),unset={op:'unset_bookmark',args:{address:other},changes:[['bookmarks',other,removed]]};
  const deleted=await f.ctx.call(unset.op,unset.args);assert.equal(deleted.normalized_result,true);f.unchanged(afterSuccessful(f,held,unset,deleted));
  const empty=f.capture(),absent=await f.ctx.call(unset.op,unset.args);assert.equal(absent.normalized_result,false);
  f.unchanged(afterSuccessful(f,empty,{...unset,changes:[]},absent));await f.sourceUnchanged();
});

test('batch success retains ordered aliases original keys named spaces unmapped addresses and empty values',options,async t=>{
  const f=await fixture(t),before=f.capture(),names={'10':'first','0x10':'second','ram:10':'last','register:0xA':'register-value','0xffff':''};
  const spec={op:'set_addresses_names',args:{names,document:'ignored-owned-document'},
    changes:[['names','0x10','last'],['names','register:0xA','register-value'],['names','0xffff','']]};
  const reply=await f.ctx.call(spec.op,spec.args);assert.deepEqual(reply.normalized_result,Object.fromEntries(Object.keys(names).map(k=>[k,true])));
  f.unchanged(afterSuccessful(f,before,spec,reply));const held=f.capture();
  const empty={op:spec.op,args:{names:{}},changes:[]},emptyReply=await f.ctx.call(empty.op,empty.args);
  assert.deepEqual(emptyReply.normalized_result,{});f.unchanged(afterSuccessful(f,held,empty,emptyReply));await f.sourceUnchanged();
});

test('targetless empty batches missing-session precedence and pre-aborted calls retain their contracts',options,async t=>{
  const ctx=new Context({signal:t.signal});ctx.handlers={...handlers};ctx.run=async()=>assert.fail('Targetless controls must not run a provider');
  const empty=await ctx.call('set_addresses_names',{names:{}});assert.deepEqual(empty.normalized_result,{});
  assert.equal(ctx.target,null);assert.equal(ctx.nativeSession,undefined);
  const records=structuredClone([...ctx.ledger]),history=structuredClone(ctx.history);
  await assert.rejects(ctx.call('set_addresses_names',{names:{'not-address':'ignored'}}),error=>error.code==='unavailable'&&/No binary is open/.test(error.message));
  assert.deepEqual([...ctx.ledger],records);assert.deepEqual(ctx.history,history);
  const controller=new AbortController();controller.abort();ctx.signal=controller.signal;
  await assert.rejects(ctx.call('set_comment',{address:entry,comment:'ignored'}),error=>error.code==='cancelled');
  assert.deepEqual([...ctx.ledger],records);assert.deepEqual(ctx.history,history);
});

test('annotate no-op and empty comments preserve response ownership model ownership and existing annotations',options,async t=>{
  const f=await fixture(t),before=f.capture(),noOp={op:'annotate_native_function',args:{procedure:'owned_entry'},changes:[]};
  const reply=await f.ctx.call(noOp.op,noOp.args);assert.deepEqual(reply.normalized_result.annotations,
    {address:entry,name:'prior-entry',comment:'prior-comment',inline_comment:'prior-inline'});
  f.unchanged(afterSuccessful(f,before,noOp,reply));
  const retained=structuredClone(f.ctx.ledger.get(reply.evidence_id)),state=f.capture();
  reply.normalized_result.annotations.name='caller-only';
  reply.normalized_result.dossier.procedure.name='caller-only';
  reply.normalized_result.dossier.comments[0].text='caller-only';
  reply.normalized_result.dossier.basic_blocks[0].start='0xdead';
  assert.deepEqual(f.ctx.ledger.get(retained.evidence_id),retained);f.unchanged(state);
  const blank={op:noOp.op,args:{procedure:entry,comment:'',inline_comment:''},changes:[['comments',entry,''],['inlineComments',entry,'']]};
  const cleared=await f.ctx.call(blank.op,blank.args);assert.equal(cleared.normalized_result.annotations.name,'prior-entry');
  assert.equal(cleared.normalized_result.annotations.comment,'');assert.equal(cleared.normalized_result.annotations.inline_comment,'');
  f.unchanged(afterSuccessful(f,state,blank,cleared));await f.sourceUnchanged();
});

// This adapter seam writes a real bounded JSON model into the provider's owned
// output directory. Its argv is observed as data; no process or target executes.
function ownedColdAdapter(f,packet=()=>model(f.source)){
  const folder=path.dirname(f.file),calls=[];
  f.ctx.nativeSession.model=null;
  f.ctx.config.temporaryRoot=folder;
  f.ctx.config.nativeProviderArgv=['owned-annotation-json-producer'];
  f.ctx.run=async argv=>{
    assert.equal(argv[0],'owned-annotation-json-producer');
    const requestPath=argv[argv.indexOf('--request')+1],responsePath=argv[argv.indexOf('--response')+1];
    assert.equal(path.basename(requestPath),'request.json');assert.equal(path.basename(responsePath),'model.json');
    assert.equal(path.dirname(requestPath),path.dirname(responsePath));
    assert.ok(path.resolve(responsePath).startsWith(path.resolve(folder)+path.sep+'real-native-'));
    const request=JSON.parse(await fs.readFile(requestPath,'utf8'));
    assert.equal(request.protocol,'real-native-model-v1');assert.equal(request.source_sha256,digest(f.source));
    assert.equal(path.dirname(request.artifact),path.dirname(responsePath));
    assert.equal(digest(await fs.readFile(request.artifact)),digest(f.source));
    const value=packet();
    await fs.writeFile(responsePath,JSON.stringify(value),{flag:'wx'});
    calls.push({root:path.dirname(responsePath),responsePath,source_sha256:request.source_sha256});
    return {stdout:'',stderr:'',exitCode:0};
  };
  return calls;
}

test('cold provider acquisition rejects a closed session without leaving an unattached owned root',options,async t=>{
  const f=await fixture(t),spec=specFor('annotate_native_function'),calls=ownedColdAdapter(f);
  const selected=f.ctx.nativeSession,before=f.capture(),entered=deferred(),release=deferred();
  const original=fs.mkdtemp,prefix=path.join(path.dirname(f.file),'real-native-');let root,used=false;
  const mocked=t.mock.method(fs,'mkdtemp',async function(value,...args){
    const created=await original.call(this,value,...args);
    if(value===prefix&&!used){used=true;root=created;entered.resolve();await release.promise;}
    return created;
  });
  const pending=outcome(f.ctx.call(spec.op,spec.args));let closed,result;
  try{
    await bounded(Promise.race([entered.promise,pending.then(r=>assert.fail('Cold root pause not reached: '+r.error?.message))]),'Owned cold root was not created');
    assert.equal(await fs.realpath(path.dirname(root)),await fs.realpath(path.dirname(f.file)));
    assert.ok(path.basename(root).startsWith('real-native-'));
    assert.equal(selected.ownedRoots.includes(root),false,'The real directory is held before attachment to its session');
    await f.ctx.call('close_binary',{});
    closed={target:f.ctx.target,session:f.ctx.nativeSession,records:structuredClone([...f.ctx.ledger]),history:structuredClone(f.ctx.history)};
  }finally{
    release.resolve();
    try{result=await bounded(pending,'Closed-session cold provider did not settle');}
    finally{mocked.mock.restore();}
  }
  assert.ok(result.error&&stale(result.error),'Cold analysis must reject a session closed during directory acquisition');
  assert.equal(f.ctx.target,closed.target);assert.equal(f.ctx.nativeSession,closed.session);
  assert.deepEqual([...f.ctx.ledger],closed.records);assert.deepEqual(f.ctx.history,closed.history);
  for(const key of mapKeys)assert.deepEqual([...selected[key]],before.maps[key].entries);
  t.diagnostic('Owned cold acquisition '+JSON.stringify({root,adapter_calls:calls.length,retained_old_roots:selected.ownedRoots}));
  await assert.rejects(fs.lstat(root),error=>error.code==='ENOENT','The application must remove its actual acquired root');
  assert.equal(selected.ownedRoots.includes(root),false,'The closed session must not retain an unreachable root');
  assert.equal(calls.length,0,'A closed session must reject before requesting the owned model packet');
  await f.ctx.call('open_binary',{path:f.file});f.ctx.nativeSession.model=model(f.source);
  await success(f,spec);await f.sourceUnchanged();
});

test('cold provider first cache installation cannot be replaced before subsequent dossier reads',options,async t=>{
  const f=await fixture(t),spec=specFor('annotate_native_function');
  const firstLabel='Owned first cold cache A',secondLabel='Owned concurrent cache B';
  const calls=ownedColdAdapter(f,()=>{const packet=model(f.source);packet.functions[0].pseudocode=firstLabel;return packet;});
  const selected=f.ctx.nativeSession,replacement=model(f.source),reads=[];replacement.functions[0].pseudocode=secondLabel;
  let cached=null,installed,replaced=false;
  Object.defineProperty(selected,'model',{configurable:true,enumerable:true,
    get(){if(cached)reads.push(cached===installed?'A':cached===replacement?'B':'other');return cached;},
    set(value){
      cached=value;
      if(!installed&&value){installed=value;queueMicrotask(()=>{cached=replacement;replaced=true;});}
    }});
  const before=f.capture();let result;
  try{
    result=await outcome(f.ctx.call(spec.op,spec.args));
    assert.equal(calls.length,1);assert.ok(installed);assert.equal(installed.functions[0].pseudocode,firstLabel);
    assert.equal(replaced,true);assert.ok(reads.includes('B'),'The public cache replacement must reach a later model read');
    if(result.value){
      t.diagnostic('Observed unbound cold model '+JSON.stringify({first:installed.functions[0].pseudocode,
        returned_dossier:result.value.normalized_result.dossier.pseudocode,current_cache:cached.functions[0].pseudocode}));
      assert.equal(result.value.normalized_result.dossier.pseudocode,secondLabel);
    }
    assert.ok(result.error&&stale(result.error),'The first actual cold-model installation must bind annotation preparation');
    f.unchanged({...before,modelRef:replacement,model:structuredClone(replacement)});await f.sourceUnchanged();
  }finally{Object.defineProperty(selected,'model',{configurable:true,enumerable:true,writable:true,value:cached});}
});

test('nested evidence this.call preserves an independent successful winner after outer failure',options,async t=>{
  const f=await fixture(t),outer=specFor('set_comment'),before=f.capture(),original=f.ctx.evidence;
  const winner={op:'set_inline_comment',args:{address:leaf,comment:'receiver-nested-winner'},changes:[['inlineComments',leaf,'receiver-nested-winner']]};
  const failure=new Error('Owned receiver-based outer failure');let nested,used=false;
  f.ctx.evidence=async function(op,...args){
    const value=await original.call(this,op,...args);
    if(op===outer.op&&!used){used=true;nested=await this.call(winner.op,winner.args);throw failure;}
    return value;
  };
  try{await assert.rejects(f.ctx.call(outer.op,outer.args),error=>error===failure);}
  finally{f.ctx.evidence=original;}
  assert.ok(nested);assert.equal(f.ctx.nativeSession.inlineComments.get(leaf),'receiver-nested-winner');
  assert.deepEqual(f.ctx.ledger.get(nested.evidence_id),nested,'Nested receiver-based calls must publish to their owning Context');
  f.unchanged(afterSuccessful(f,before,winner,nested));await f.sourceUnchanged();
  await success(f,outer);
});
