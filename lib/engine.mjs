import { Context } from './core.mjs';
import { handlers as evidence } from './evidence.mjs';
import { handlers as session } from './session.mjs';
import { handlers as comparisons } from './comparisons.mjs';
import { handlers as verification } from './verification.mjs';
import { readFile } from 'node:fs/promises';
export async function engine(options={}){
 if(!options.config&&process.env.REAL_CONFIG)options.config=JSON.parse(await readFile(process.env.REAL_CONFIG,'utf8'));
 const ctx=new Context(options);
 for(const group of [evidence,session,comparisons,verification])Object.assign(ctx.handlers,group);
 for(const file of ['artifacts','native','javascript','runtime']){
  let module;
  try{module=await import('./'+file+'.mjs');}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND'&&error.url===new URL('./'+file+'.mjs',import.meta.url).href)continue;throw error;}
  for(const [name,handler]of Object.entries(module.handlers??{})){
   if(ctx.handlers[name])throw new Error('Handler ownership conflict: '+name);
   ctx.handlers[name]=handler;
  }
  if(module.providerCandidates)ctx.providerCandidates=module.providerCandidates;
  if(file==='native'&&module.availability)ctx.nativeAvailability=module.availability;
  if(file==='runtime'&&module.debuggerPrerequisite)ctx.debuggerPrerequisite=module.debuggerPrerequisite;
 }
 return ctx;
}
