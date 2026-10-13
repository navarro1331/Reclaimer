import { readFile, writeFile, mkdir, copyFile, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { digest, InvestigationError } from './core.mjs';
const project=fileURLToPath(new URL('../',import.meta.url));
const fail=message=>{throw new InvestigationError('input','setup',message);};
async function bytes(path){try{return await readFile(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function atomic(path,content,expected){
 const current=await bytes(path);if(digest(current??'')!==digest(expected??''))fail('Configuration changed while the installation plan was being applied');
 await mkdir(dirname(path),{recursive:true});const temp=path+'.real-write-'+randomUUID();await writeFile(temp,content,{flag:'wx',mode:0o600});try{await rename(temp,path);}catch(error){await unlink(temp);throw error;}
}
function registry(home,platform){
 const appdata=platform==='win32'?resolve(home,'AppData/Roaming'):platform==='darwin'?resolve(home,'Library/Application Support'):resolve(home,'.config');
 return {
  'claude-desktop':{path:resolve(appdata,'Claude/claude_desktop_config.json'),key:'mcpServers'},
  'claude-code':{path:resolve(home,'.claude.json'),key:'mcpServers'},
  cursor:{path:resolve(home,'.cursor/mcp.json'),key:'mcpServers'},
  codex:{path:resolve(home,'.codex/config.toml'),key:'mcp_servers',toml:true},
  vscode:{path:resolve(appdata,platform==='win32'?'Code/User/mcp.json':'Code/User/mcp.json'),key:'servers'},
 };
}
function parse(entry,data){const config=data?entry.toml?parseToml(data.toString('utf8')):JSON.parse(data):{};
 if(!config||typeof config!=='object'||Array.isArray(config))fail('Client configuration must be an object');
 const namespace=config[entry.key];if(namespace!==undefined&&(!namespace||typeof namespace!=='object'||Array.isArray(namespace)))fail('Client server namespace must be an object');
 return config;
}
function serialize(entry,data){return entry.toml?stringifyToml(data):JSON.stringify(data,null,2)+'\n';}
export async function configure(command,options,ctx,{root=project,home=homedir(),platform=process.platform}={}){
 const manifestPath=resolve(root,'.cache/installation.json'),clients=registry(home,platform);
 const server={command:process.execPath,args:[resolve(root,'scripts/real.mjs'),'mcp']};
 if(command==='update')return {status:'local-source',version:'0.2.0',root,remediation:'This private project has no published release channel; update from an operator-selected source release'};
 if(command==='uninstall'){
  const data=await bytes(manifestPath);if(!data)return {status:'not-installed',removed:[],preserved:[]};
  const manifest=JSON.parse(data),removed=[],preserved=[];
  for(const entry of manifest.clients){
   const current=await bytes(entry.path),config=parse(entry,current);
   if(digest(config[entry.key]?.real??null)!==entry.installed_digest){preserved.push({path:entry.path,reason:'Entry changed after setup'});continue;}
   let previous=null;if(entry.backup){const saved=parse(entry,await bytes(entry.backup));previous=saved[entry.key]?.real??null;}
   if(previous!==null)config[entry.key].real=previous;else delete config[entry.key].real;
   await atomic(entry.path,serialize(entry,config),current);removed.push({path:entry.path,restored_previous:previous!==null});
  }
  if(manifest.skill){const current=await bytes(manifest.skill.path);if(current&&digest(current)===manifest.skill.sha256){if(manifest.skill.backup)await atomic(manifest.skill.path,await bytes(manifest.skill.backup),current);else await unlink(manifest.skill.path);removed.push({path:manifest.skill.path});}else preserved.push({path:manifest.skill.path,reason:'Skill changed after setup'});}
  if(options.purgeData&&!preserved.length)await unlink(manifestPath);
  return {status:preserved.length?'partially-uninstalled':'uninstalled',removed,preserved,purged_installation_manifest:!!options.purgeData&&!preserved.length};
 }
 const selected=new Set(options.client??[]);
 if(options.allDetected)for(const [name,entry]of Object.entries(clients))if(await bytes(entry.path))selected.add(name);
 const plan=[];
 for(const name of selected){if(!clients[name])fail('Unsupported client '+name);const entry=clients[name],original=await bytes(entry.path);parse(entry,original);plan.push({...entry,client:name,original});}
 let skillPath=null;if(options.skill){skillPath=['codex','claude','cursor'].includes(options.skill)?resolve(home,options.skill==='codex'?'.codex/skills/real':options.skill==='claude'?'.claude/skills/real':'.cursor/skills/real','SKILL.md'):resolve(options.skill,'SKILL.md');}
 const publicPlan=plan.map(({original,...entry})=>({...entry,server}));
 if(options.dryRun||!options.yes)return {status:'planned',requires_confirmation:!options.yes,clients:publicPlan,skill:skillPath,install_hopper:!!options.installHopper};
 if(options.installHopper){
  if(platform!=='darwin')ctx.unavailable('setup','Hopper installation is supported only on macOS','Install an operator-selected Ghidra or IDA provider on this host');
  await ctx.run([ctx.config.brew??'brew','install','--cask','hopper-disassembler'],{timeout:300000});
 }
 const previousBytes=await bytes(manifestPath),previous=previousBytes?JSON.parse(previousBytes):{clients:[],skill:null},applied=[];
 for(const entry of plan){
  const config=parse(entry,entry.original);config[entry.key]??={};
  const value=entry.client==='vscode'?{type:'stdio',...server}:server;
  const prior=previous.clients.find(p=>p.path===entry.path);
  if(digest(config[entry.key].real??null)===digest(value)){if(prior)applied.push(prior);continue;}
  const owned=prior&&digest(config[entry.key].real??null)===prior.installed_digest;
  const backup=owned?prior.backup:entry.original?entry.path+'.real-backup-'+randomUUID():null;if(backup&&!owned)await copyFile(entry.path,backup);
  config[entry.key].real=value;await atomic(entry.path,serialize(entry,config),entry.original);
  applied.push({client:entry.client,path:entry.path,key:entry.key,toml:!!entry.toml,backup,installed_digest:digest(value)});
 }
 let skill=previous.skill;
 if(skillPath){const content=await readFile(resolve(root,'skills/real/SKILL.md')),original=await bytes(skillPath);
  if(!(previous.skill?.path===skillPath&&original&&digest(original)===digest(content))){
   const owned=previous.skill?.path===skillPath&&original&&digest(original)===previous.skill.sha256;
   const backup=owned?previous.skill.backup:original?skillPath+'.real-backup-'+randomUUID():null;if(backup&&!owned)await copyFile(skillPath,backup);await atomic(skillPath,content,original);skill={path:skillPath,backup,sha256:digest(content)};
  }
 }
 const next={clients:[...previous.clients.filter(p=>!applied.some(a=>a.path===p.path)),...applied],skill};
 await atomic(manifestPath,JSON.stringify(next,null,2)+'\n',previousBytes);
 return {status:'installed',clients:applied.map(({installed_digest,...entry})=>entry),skill:skill?.path??null};
}
