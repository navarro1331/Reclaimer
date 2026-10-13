import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { engine } from '../lib/engine.mjs';
import { api, validate } from '../lib/contracts.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
async function files(directory){const results=[];for(const e of await readdir(directory,{withFileTypes:true})){if(['node_modules','.git','.cache','third-party'].includes(e.name)||e.isDirectory()&&e.name.startsWith('runtime-'))continue;const p=join(directory,e.name);if(e.isDirectory())results.push(...await files(p));else results.push(p);}return results;}
let count=0;
for(const p of await files(root))if(p.endsWith('.mjs')){const check=spawnSync(process.execPath,['--check',p],{encoding:'utf8',shell:false,windowsHide:true});if(check.status!==0)throw new Error(check.stderr);count++;}
const ctx=await engine(),missing=api.tools.filter(t=>!ctx.handlers[t.name]).map(t=>t.name);
for(const t of api.tools){validate(t.name,'input',{});validate(t.name,'output',{});}
if(missing.length)throw new Error('Incomplete handler inventory: '+missing.join(', '));
console.log(JSON.stringify({syntax_files:count,mcp_operations:api.tools.length,prompts:api.prompts.length,missing_handlers:missing}));
