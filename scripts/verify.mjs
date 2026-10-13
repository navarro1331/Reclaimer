import { spawn } from 'node:child_process';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { api } from '../lib/contracts.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const runId=randomUUID(),started=new Date().toISOString();
const output=join(root,'docs','verification');await mkdir(output,{recursive:true});
const env={...process.env,REAL_VERIFICATION_RUN_ID:runId,NODE_OPTIONS:'--import='+new URL('./test-coverage.mjs',import.meta.url).href};
for(const key of ['REAL_CONFIG','REAL_GHIDRA_ARGV','REAL_HOPPER_ARGV','REAL_IDA_MCP_URL','REAL_NATIVE_PROVIDER_ARGV'])delete env[key];
function execute(args,timeout=1_200_000){return new Promise(resolve=>{
 const child=spawn(process.execPath,args,{cwd:root,env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
 const chunks=[];let bytes=0,timedOut=false,spawnError=null;
 const capture=value=>{bytes+=value.length;if(bytes<=32*1024*1024)chunks.push(value);else child.kill();};
 child.stdout.on('data',capture);child.stderr.on('data',capture);child.on('error',error=>{spawnError=error.message;});
 const timer=setTimeout(()=>{timedOut=true;child.kill();},timeout);
 child.on('close',(code,signal)=>{clearTimeout(timer);resolve({code,signal,timedOut,spawnError,output:Buffer.concat(chunks).toString('utf8')});});
 });}
const build=await execute(['scripts/check.mjs'],180_000);
console.log(JSON.stringify({phase:'build',run_id:runId,exit_code:build.code}));
const testFiles=(await readdir(join(root,'test'))).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>'test/'+name);
console.log(JSON.stringify({phase:'tests',run_id:runId,files:testFiles.length,native_variations:env.REAL_RUN_NATIVE_VARIATIONS==='1',swift_variations:env.REAL_RUN_SWIFT_VARIATIONS==='1',runtime_variations:env.REAL_RUN_RUNTIME_VARIATIONS==='1'}));
const tests=build.code===0?await execute(['--test','--test-reporter=tap','--test-concurrency=1',...testFiles]):{code:null,output:'Tests withheld because the build check failed.\n'};
const log='Build:\n'+build.output+'\nTests:\n'+tests.output;
await writeFile(join(output,'TEST_OUTPUT.txt'),log);
const operations=new Set();
for(const file of await readdir(join(root,'.cache')))if(file.startsWith('operations-'+runId+'-')&&file.endsWith('.jsonl')){
 for(const line of (await readFile(join(root,'.cache',file),'utf8')).trim().split('\n').filter(Boolean))operations.add(JSON.parse(line).operation);
}
const count=name=>Number(tests.output.match(new RegExp('^# '+name+' (\\d+)','m'))?.[1]??0);
const observed=[...operations].sort(),unobserved=api.tools.map(t=>t.name).filter(name=>!operations.has(name)).sort();
const report={run_id:runId,started_at:started,finished_at:new Date().toISOString(),root,node:process.version,platform:process.platform,
 verification_options:{native_variations:env.REAL_RUN_NATIVE_VARIATIONS==='1',swift_variations:env.REAL_RUN_SWIFT_VARIATIONS==='1',runtime_variations:env.REAL_RUN_RUNTIME_VARIATIONS==='1',build_timeout_ms:180000,test_timeout_ms:1200000},
 result:build.code===0&&tests.code===0?'pass':'fail',build:{exit_code:build.code,timed_out:build.timedOut??false,spawn_error:build.spawnError??null},
 tests:{files:testFiles.length,exit_code:tests.code,summary_available:/^# tests \d+$/m.test(tests.output),total:count('tests'),passed:count('pass'),failed:count('fail'),cancelled:count('cancelled'),skipped:count('skipped'),todo:count('todo'),timed_out:tests.timedOut??false},
 catalog:{mcp_operations:api.tools.length,prompts:api.prompts.length},coverage:{validated_operations:observed.length,observed,unobserved},
 output_sha256:createHash('sha256').update(log).digest('hex'),
 limits:['Coverage lists successful schema-validated operation calls during this test run. It does not establish complete behavior coverage or parity.','Authored fixtures and owned local runtimes cover specific cases. Platform and provider variations require separate evidence.','Live provider receipts describe their actual fixture scope; provider configuration alone does not prove execution.']};
await writeFile(join(output,'TEST_REPORT.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({run_id:runId,result:report.result,tests:report.tests,validated_operations:observed.length,unobserved_operations:unobserved.length}));
if(report.result!=='pass')process.exitCode=1;
