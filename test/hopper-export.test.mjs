import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runtimePython} from './runtime-provider-prerequisites.mjs';
import {Context} from '../lib/core.mjs';
import {handlers as nativeHandlers} from '../lib/native.mjs';
const bridge=fileURLToPath(new URL('../bridge/independent/hopper-export.py',import.meta.url));
const fake=String.raw`
import json,runpy,sys,os
mode=sys.argv[3]
class Ref:
 def fromAddress(self):return 0x1000
 def toAddress(self):return 0x1006
 def type(self):return 1
class Variable:
 def name(self):return 'owned_local'
 def displacement(self):return -8
class Block:
 def __init__(self,a,b):self.a=a;self.b=b
 def getStartingAddress(self):return self.a
 def getEndingAddress(self):return self.b
 def getSuccessorCount(self):return 0
class Instruction:
 def __init__(self,address):self.address=address
 def getInstructionLength(self):return 0 if mode=='zero-length' else (5 if self.address==0x1000 else 1)
 def getInstructionString(self):return 'call 0x1006' if self.address==0x1000 else 'ret'
 def getArgumentCount(self):return 1 if self.address==0x1000 else 0
 def getRawArgument(self,i):return '0x1006'
 def isAConditionalJump(self):return False
 def isAnInconditionalJump(self):return False
 def getArchitecture(self):return 2
 @staticmethod
 def stringForArchitecture(value):return 'x86_64'
class Procedure:
 def __init__(self,entry):self.entry=entry
 def getEntryPoint(self):return self.entry
 def getBasicBlockCount(self):return 1
 def getBasicBlock(self,index):return Block(self.entry,0x1006 if self.entry==0x1000 else 0x1007)
 def getLocalVariableList(self):return [Variable()]
 def getAllCallees(self):return [Ref()] if self.entry==0x1000 else []
 def decompile(self):return None if mode=='no-pseudo' else 'return owned_value;'
 def signatureString(self):return 'int owned(void)'
class Segment:
 def getStartingAddress(self):return 0x1000
 def getLength(self):return 10
 def getName(self):return 'owned_text'
 def getProcedureCount(self):return 2
 def getProcedureAtIndex(self,index):return Procedure([0x1000,0x1006][index])
 def getNameAtAddress(self,address):return {0x1000:'owned_caller',0x1006:'owned_callee'}[address]
 def getInstructionAtAddress(self,address):return Instruction(address)
 def getReferencesFromAddress(self,address):return [0x1006] if address==0x1000 else []
 def readBytes(self,address,length):return b'\xe8\x01\x00\x00\x00' if address==0x1000 else (b'' if mode=='short-read' else b'\xc3')
 def getStringCount(self):return 1
 def getStringAtIndex(self,index):return 'hi'
 def getStringAddressAtIndex(self,index):return 0x1007
class Doc:
 def getSegmentCount(self):return -1 if mode=='bad-count' else 1
 def getSegment(self,index):return Segment()
class Document:
 @staticmethod
 def getCurrentDocument():return None if mode=='no-document' else Doc()
runpy.run_path(sys.argv[1],init_globals={'Document':Document,'REAL_OUTPUT':sys.argv[2]})
`;
async function execute(t,mode){const python=await runtimePython(t);if(!python)return null;const dir=await mkdtemp(join(tmpdir(),'reclaimer-hopper-api-'));t.after(()=>rm(dir,{recursive:true,force:true}));const script=join(dir,'owned-public-api.py'),out=join(dir,'model.json');await writeFile(script,fake);const before=await readFile(script);const result=spawnSync(python.executable,[...python.args,script,bridge,out,mode],{shell:false,windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:1024*1024,env:process.platform==='win32'?{SystemRoot:process.env.SystemRoot??'C:\\Windows'}:{}});assert.equal(result.error,undefined);assert.deepEqual(await readFile(script),before);return {result,out,dir};}
test('owned public Hopper API fixture exports instructions, body ranges, calls, locals, signatures and strings',async t=>{const x=await execute(t,'positive');if(!x)return;assert.equal(x.result.status,0,x.result.stderr);const m=JSON.parse(await readFile(x.out,'utf8'));assert.equal(m.provider,'hopper');assert.equal(m.architecture,'x86_64');assert.equal(m.image_base,null);assert.equal(m.functions.length,2);assert.equal(m.instructions.length,3);const f=m.functions[0];assert.deepEqual(f.ranges,[{start:'0x1000',end:'0x1006'}]);assert.equal(f.total_bytes,6);assert.equal(f.signature,'int owned(void)');assert.equal(f.locals[0].stack_displacement,'-8');assert.equal(f.pseudocode,'return owned_value;');assert.equal(f.classification_available,false);assert.equal(m.instructions[0].bytes,'e801000000');assert.equal(m.instructions[0].operands[0].raw,'0x1006');assert(m.references.some(r=>r.source==='0x1000'&&r.target==='0x1006'&&r.call));assert.equal(m.strings[0].value,'hi');assert(m.limitations.some(s=>s.includes('SSA')));});
test('owned Hopper export reaches schema-validated native dossier while unknown classifications remain null',async t=>{const x=await execute(t,'positive');if(!x)return;assert.equal(x.result.status,0,x.result.stderr);const m=JSON.parse(await readFile(x.out,'utf8')),file=join(x.dir,'owned.elf'),bytes=Buffer.alloc(64);bytes.set([0x7f,69,76,70,2,1,1]);bytes.writeUInt16LE(2,16);bytes.writeUInt16LE(62,18);bytes.writeUInt32LE(1,20);bytes.writeUInt16LE(64,52);bytes.writeUInt16LE(56,54);bytes.writeUInt16LE(64,58);await writeFile(file,bytes);const ctx=new Context();ctx.handlers=nativeHandlers;ctx.run=async()=>assert.fail('Owned cached Hopper model fixture must not launch a provider or target');await ctx.call('open_binary',{path:file,provider_id:'hopper'});ctx.nativeSession.model=m;const result=(await ctx.call('analyze_function',{procedure:'owned_caller'})).normalized_result;assert.equal(result.procedure.classification,null);assert.equal(result.procedure.body.available,true);assert.equal(result.procedure.body.total_bytes,6);assert.equal(result.callees[0].name,'owned_callee');assert.equal(result.procedure.locals[0].stack_displacement,'-8');assert.match(result.assembly.join('\n'),/call 0x1006/);assert.deepEqual(await readFile(file),bytes);await ctx.call('close_binary',{});});
test('owned Hopper absent pseudocode remains unknown while actual public instruction metadata survives',async t=>{const x=await execute(t,'no-pseudo');if(!x)return;assert.equal(x.result.status,0,x.result.stderr);const m=JSON.parse(await readFile(x.out,'utf8'));assert.equal(m.functions[0].pseudocode,null);assert.match(m.functions[0].decompiler_error,/no result/);assert.equal(m.instructions.length,3);});
for(const mode of ['zero-length','short-read','bad-count','no-document'])test('owned Hopper '+mode+' fails without publishing a partial model',async t=>{const x=await execute(t,mode);if(!x)return;assert.notEqual(x.result.status,0);assert.match(x.result.stderr,{'zero-length':/Invalid Hopper instruction extent/,'short-read':/instruction bytes are unavailable or short/,'bad-count':/Invalid Hopper segment count/,'no-document':/did not open the owned input copy/}[mode]);await assert.rejects(readFile(x.out),e=>e.code==='ENOENT');});
