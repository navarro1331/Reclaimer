import { readdir, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { engine } from '../lib/engine.mjs';
import { api, validate } from '../lib/contracts.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
async function files(directory){const results=[];for(const e of await readdir(directory,{withFileTypes:true})){if(['node_modules','.git','.cache','third-party'].includes(e.name)||e.isDirectory()&&e.name.startsWith('runtime-'))continue;const p=join(directory,e.name);if(e.isDirectory())results.push(...await files(p));else results.push(p);}return results;}
// Syntax-only children are independent. Bound concurrency and each child's
// time/capture so cold starts cannot serialize the entire repository check.
const syntax=(await files(root)).filter(p=>p.endsWith('.mjs')).sort();let next=0,count=0;
const check=p=>new Promise((resolve,reject)=>execFile(process.execPath,['--check',p],{encoding:'utf8',shell:false,windowsHide:true,timeout:30000,maxBuffer:1048576},(error,stdout,stderr)=>error?reject(new Error(stderr||error.message)):resolve()));
const workers=await Promise.allSettled(Array.from({length:Math.min(16,syntax.length)},async()=>{while(next<syntax.length){const p=syntax[next++];await check(p);count++;}}));
const failed=workers.find(result=>result.status==='rejected');if(failed)throw failed.reason;
const ctx=await engine(),missing=api.tools.filter(t=>!ctx.handlers[t.name]).map(t=>t.name);
for(const t of api.tools){validate(t.name,'input',{});validate(t.name,'output',{});}
if(missing.length)throw new Error('Incomplete handler inventory: '+missing.join(', '));
console.log(JSON.stringify({syntax_files:count,mcp_operations:api.tools.length,prompts:api.prompts.length,missing_handlers:missing}));
