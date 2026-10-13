import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Context } from '../lib/core.mjs';
import { engine } from '../lib/engine.mjs';
import { handlers } from '../lib/native.mjs';
import { digest } from '../lib/artifact-binary.mjs';
import { elfFixture } from './artifact-fixtures.mjs';

const base=process.env.REAL_TEST_EVIDENCE_ROOT??path.resolve('test/provider-fixtures');
const compiler=base+'/vendors/llvm-23.1.3/runtime/clang+llvm-23.1.3-x86_64-pc-windows-msvc/bin';
const jdk=base+'/providers/jdk/jdk-25.0.4.1+1',ghidra=base+'/providers/ghidra/ghidra_12.1.4_PUBLIC';
const source=fileURLToPath(new URL('./fixtures/native-return-branches.c',import.meta.url));
const flow=operations=>({available:true,provenance:'ghidra-high-pcode',operations,def_use:[],effects:[],parameters:[],parameter_uses:[],truncated:false,omitted_operations_lower_bound:0,known_omitted_inputs:0,known_omitted_edges:0,limitations:[]});
const value=(size=4)=>({kind:'unique',size_bytes:size,location:'unique:100',constant_hex:null});
const op=(id,address,opcode,inputs,output=null)=>({id,address,sequence:0,opcode,is_dead:false,block_membership:'member',inputs,output});
function observedModel({computed=false,width=4,indirect=false}={}) {
 const functions=[['caller','0x1000'],['callee','0x1010']].map(([name,address])=>({name,address,external:false,thunk:false,thunk_target:null,ranges:[{start:address,end:address==='0x1000'?'0x1008':'0x1018'}],total_bytes:8,signature:'unsigned int '+name+'(void)',locals:[],basic_blocks:[],pseudocode:'/* owned provider observation */'}));
 functions[0].native_value_flow=flow([op('call','0x1000',computed||indirect?'CALLIND':'CALL',[{kind:'address',size_bytes:8,location:'0x1010',constant_hex:null}],value())]);
 functions[1].native_value_flow=flow([op('return','0x1010','RETURN',[{kind:'constant',size_bytes:8,location:null,constant_hex:'0'},value(width)])]);
 return {protocol:'real-native-model-v1',source_sha256:null,provider:'ghidra',architecture:'x86_64',language_id:'x86:LE:64:default',compiler_spec_id:'gcc',functions,symbols:[],segments:[{name:'text',start:'0x1000',end:'0x1020',file_offset:0,file_size:32}],strings:[],references:[{source:'0x1000',target:'0x1010',type:'UNCONDITIONAL_CALL',call:true,computed,flow:true,jump:false,indirect,operand_index:0}],instructions:[{address:'0x1000',procedure:'0x1000',bytes:'e800000000',length:5,mnemonic:'CALL',text:'CALL 0x1010',operands:[{index:0,raw:'0x1010',provider_type:1,components:[{kind:'address',text:'0x1010',value:'0x1010',bit_width:64}],memory_addressing:'provider-rendered'}],flow:{kind:'call',conditional:false,computed,direct_destinations:['0x1010']}}],limitations:[]};
}
async function synthetic(t,model) {
 const root=await fs.mkdtemp(path.resolve('.native-parity-')),file=path.join(root,'input.elf'),ctx=new Context({signal:t.signal});ctx.handlers=handlers;
 t.after(async()=>{if(ctx.target)await ctx.call('close_binary',{});assert.ok(root.startsWith(path.resolve('.')+path.sep)&&path.basename(root).startsWith('.native-parity-'));await fs.rm(root,{recursive:true,force:true});});
 await fs.writeFile(file,elfFixture());await ctx.call('open_binary',{path:file});ctx.nativeSession.model=model;return ctx;
}
test('typed native operand facts survive the fixed unavailable memory-addressing contract',async t=>{
 const model=observedModel();model.references[0].operand_index=0;const ctx=await synthetic(t,model),result=(await ctx.call('inspect_native_instruction',{address:'0x1000'})).normalized_result;
 assert.equal(result.status,'decoded');assert.equal(result.operands[0].memory_addressing,'unavailable');assert.deepEqual(result.operands[0].components,[{kind:'address',text:'0x1010',value:'0x1010',bit_width:64}]);
});
test('native return binding retains direct and computed candidates and refuses unequal widths',async t=>{
 for(const settings of [{},{computed:true},{indirect:true},{width:8}]) {
  const ctx=await synthetic(t,observedModel(settings)),result=(await ctx.call('trace_native_values',{procedure:'caller'})).normalized_result,returns=result.edges.filter(e=>e.kind==='return-binding');
  if(settings.width===8){assert.equal(returns.length,0);assert.ok(result.unknowns.some(u=>u.reason.includes('widths differ')));}
  else{assert.equal(returns.length,1);assert.equal(returns[0].source,'return');assert.equal(returns[0].target,'call');assert.equal(returns[0].status,settings.computed||settings.indirect?'candidate':'direct');assert.ok(ctx.ledger.get(returns[0].evidence_id));}
 }
});
test('native return binding follows depth/node/edge bounds and never retains dangling endpoints',async t=>{
 const ctx=await synthetic(t,observedModel());
 const depth=(await ctx.call('trace_native_values',{procedure:'caller',max_depth:0})).normalized_result;assert.equal(depth.procedures.length,1);assert.equal(depth.edges.length,0);
 const bounded=(await ctx.call('trace_native_values',{procedure:'caller',max_nodes:1})).normalized_result;assert.equal(bounded.nodes.length,1);assert.equal(bounded.edges.length,0);assert.equal(bounded.truncated,true);
 const page=(await ctx.call('trace_native_values',{procedure:'caller',limit:1})).normalized_result;assert.equal(page.edges.length,0);assert.equal(page.next_offset,1);
});
test('native call-target resolution keeps indirect reference and instruction-only computed targets as candidates',async t=>{
 for(const settings of [{},{computed:true},{indirect:true},{instructionOnly:true}]){
  const model=observedModel(settings);if(settings.instructionOnly)model.instructions[0].flow.computed=true;
  const ctx=await synthetic(t,model),result=(await ctx.call('resolve_native_call_targets',{address:'0x1000'})).normalized_result,candidate=Boolean(settings.computed||settings.indirect||settings.instructionOnly);
  assert.equal(result.status,candidate?'ambiguous':'direct');assert.equal(result.mechanism,candidate?'computed':'direct');assert.equal(result.targets[0].status,candidate?'candidate':'direct');assert.equal(result.targets[0].address,'0x1010');
 }
});

test('real Ghidra x86_64 and ARM64 exports bind owned source bytes, operand components and return flow',{
 skip:process.env.REAL_RUN_NATIVE_VARIATIONS!=='1',timeout:420000,
},async t=>{
 const root=await fs.mkdtemp(path.resolve('.native-parity-'));let ctx=null;
 const report={verified_at:new Date().toISOString(),compiler:'LLVM 23.1.3',ghidra:'12.1.4',jdk:'25.0.4.1+1',source_sha256:digest(await fs.readFile(source)),target_execution:'not-performed',observations:[],success:false};
 t.after(async()=>{if(ctx?.target)await ctx.call('close_binary',{});await fs.writeFile(path.resolve('docs/verification/NATIVE_PARITY_REPORT.json'),JSON.stringify(report,null,2)+'\n');assert.ok(root.startsWith(path.resolve('.')+path.sep)&&path.basename(root).startsWith('.native-parity-'));await fs.rm(root,{recursive:true,force:true});});
 try{for(const [target,architecture]of [['x86_64-unknown-linux-gnu','x86_64'],['aarch64-unknown-linux-gnu','arm64']]) {
  const object=path.join(root,architecture+'.o'),binary=path.join(root,architecture+'.elf'),compile=[compiler+'/clang.exe','--target='+target,'-c','-g','-gdwarf-4','-O1','-fno-inline','-fno-optimize-sibling-calls','-fno-pie','-fno-stack-protector','-ffreestanding','-fno-builtin','-fno-unwind-tables','-fno-asynchronous-unwind-tables',source,'-o',object],link=[compiler+'/ld.lld.exe','-e','owned_entry','-o',binary,object];
  const supervisor=new Context({signal:t.signal});await supervisor.run(compile,{cwd:root,timeout:60000});await supervisor.run(link,{cwd:root,timeout:60000});
  const bytes=await fs.readFile(binary),observation={target,architecture,artifact_sha256:digest(bytes),artifact_bytes:bytes.length,compiler_argv:compile,linker_argv:link,success:false};report.observations.push(observation);
  ctx=await engine({signal:t.signal,config:{javaHome:jdk,ghidraArgv:[jdk+'/bin/java.exe','-Xmx1G','-Djava.system.class.loader=ghidra.GhidraClassLoader','-Djava.awt.headless=true','-Dfile.encoding=UTF8','-cp',ghidra+'/Ghidra/Framework/Utility/lib/Utility.jar','ghidra.GhidraLauncher','ghidra.app.util.headless.AnalyzeHeadless']}});
  await ctx.call('open_binary',{path:binary,provider_id:'ghidra'});await ctx.call('list_procedures',{});const model=ctx.nativeSession.model;
  assert.equal(model.source_sha256,observation.artifact_sha256);assert.equal(model.architecture,architecture);assert.ok(model.functions.some(f=>f.name==='owned_entry'));
  const instructions=model.instructions.filter(i=>i.operands.some(o=>o.components?.length));assert.ok(instructions.length>0);const kinds=new Set();
  for(const instruction of instructions){const result=(await ctx.call('inspect_native_instruction',{address:instruction.address})).normalized_result;for(const operand of result.operands){assert.equal(operand.memory_addressing,'unavailable');for(const component of operand.components)kinds.add(component.kind);}}
  assert.ok(kinds.has('register'));assert.ok(kinds.has('immediate'));assert.ok(kinds.has('address'));observation.operand_component_kinds=[...kinds].sort();observation.typed_instructions=instructions.length;
  const trace=(await ctx.call('trace_native_values',{procedure:'owned_entry'})).normalized_result;assert.equal(trace.procedures.length,3);assert.ok(trace.edges.some(e=>e.kind==='argument-binding'));assert.ok(trace.edges.some(e=>e.kind==='return-binding'&&e.status==='direct'));observation.value_flow={procedures:trace.procedures.length,nodes:trace.nodes.length,edges:trace.edges.length,return_bindings:trace.edges.filter(e=>e.kind==='return-binding').length,argument_bindings:trace.edges.filter(e=>e.kind==='argument-binding').length};
  observation.provider_source_binding=model.source_sha256;assert.equal(digest(await fs.readFile(binary)),observation.artifact_sha256);assert.equal(digest(await fs.readFile(source)),report.source_sha256);observation.source_preserved=true;
  const ownedRoots=[...ctx.nativeSession.ownedRoots];await ctx.call('close_binary',{});ctx=null;for(const owned of ownedRoots)await assert.rejects(fs.stat(owned),{code:'ENOENT'});observation.owned_project_cleanup=true;observation.success=true;
 }report.success=true;}catch(error){report.failure={message:error.message,details:error.details??null};throw error;}
});
