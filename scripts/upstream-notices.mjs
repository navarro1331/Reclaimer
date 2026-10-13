import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from '../lib/core.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const specs=[
 ['@cfworker/json-schema','cfworker/cfworker',['LICENSE','LICENSE.md','LICENSE.txt','packages/json-schema/LICENSE','packages/json-schema/LICENSE.md']],
 ['@xterm/headless','xtermjs/xterm.js',['LICENSE']],
 ['@xterm/addon-serialize','xtermjs/xterm.js',['LICENSE']],
 ['@scalar/openapi-types','scalar/scalar',['LICENSE']],
 ['evmole','cdump/evmole',['LICENSE','LICENSE.md','LICENSE.txt','LICENSE-MIT']],
];
const receipts=[];
await mkdir(resolve(root,'third-party','upstream'),{recursive:true});
for(const [name,repo,files]of specs){
 const p=JSON.parse(await readFile(resolve(root,'node_modules',name,'package.json'),'utf8'));
 const response=await fetch('https://registry.npmjs.org/'+encodeURIComponent(name)+'/'+p.version);
 if(!response.ok)throw new Error('Package metadata unavailable for '+name);
 const meta=await response.json();let reference=meta.gitHead,version_bound=!!reference;
 if(!reference&&meta.dist?.attestations?.url){
  const result=await fetch(meta.dist.attestations.url);
  if(result.ok){const facts=await result.json(),entry=facts.attestations?.find(a=>a.predicateType==='https://slsa.dev/provenance/v1'),payload=entry?.bundle?.dsseEnvelope?.payload;
   if(payload){const statement=JSON.parse(Buffer.from(payload,'base64').toString('utf8'));reference=statement.predicate?.buildDefinition?.resolvedDependencies?.find(d=>d.uri?.includes('github.com/'+repo))?.digest?.gitCommit;version_bound=!!reference;}
  }
 }
 if(!reference){
  const tag=await fetch('https://api.github.com/repos/'+repo+'/git/ref/tags/'+encodeURIComponent(name+'@'+p.version));
  if(tag.ok){reference=(await tag.json()).object.sha;version_bound=true;}
  else {const info=await fetch('https://api.github.com/repos/'+repo);if(info.ok){const data=await info.json();const branch=await fetch('https://api.github.com/repos/'+repo+'/commits/'+data.default_branch);if(branch.ok)reference=(await branch.json()).sha;}}
 }
 if(!reference)throw new Error('Package upstream revision unavailable: '+name);
 let found=false;
 for(const file of files){
  const url='https://raw.githubusercontent.com/'+repo+'/'+reference+'/'+file;
  const response=await fetch(url);if(!response.ok)continue;
  const content=await response.text();if(!/permission|license/i.test(content))continue;
  const dest='third-party/upstream/'+name.replaceAll('/','__')+'@'+p.version+'.LICENSE';
  await writeFile(resolve(root,dest),content);
  receipts.push({package:name,version:p.version,source:url,revision:reference,version_bound,file:dest,sha256:digest(content)});found=true;break;
 }
 if(!found)throw new Error('No upstream license found at package revision '+name+' '+reference);
}
const pty=JSON.parse(await readFile(resolve(root,'node_modules/@lydell/node-pty-win32-x64/package.json'),'utf8'));
const file='third-party/upstream/@lydell__node-pty-win32-x64@'+pty.version+'.LICENSE';
await copyFile(resolve(root,'node_modules/@lydell/node-pty/LICENSE'),resolve(root,file));
receipts.push({package:pty.name,version:pty.version,source:'matching-version @lydell/node-pty installed LICENSE',revision:null,file,sha256:digest(await readFile(resolve(root,file)))});
await writeFile(resolve(root,'third-party/upstream/receipts.json'),JSON.stringify(receipts,null,2)+'\n');
console.log(JSON.stringify({upstream_notices:receipts.length}));
