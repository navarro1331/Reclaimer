import { readFile, readdir, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from '../lib/core.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),lock=JSON.parse(await readFile(resolve(root,'package-lock.json'),'utf8'));
const records=[],missing=[];
let upstream=[];try{upstream=JSON.parse(await readFile(resolve(root,'third-party/upstream/receipts.json'),'utf8'));}catch{}
await mkdir(resolve(root,'third-party'),{recursive:true});
for(const [relative,info]of Object.entries(lock.packages)){
 if(!relative)continue;
 const folder=resolve(root,relative);let pkg;
 try{pkg=JSON.parse(await readFile(join(folder,'package.json'),'utf8'));}catch{continue;}
 const licenseFiles=(await readdir(folder)).filter(n=>/^(license|licence|copying|notice|copyright)(\.|$|[-_])/i.test(n));
 const output=resolve(root,'third-party',pkg.name.replaceAll('/','__')+'@'+pkg.version);
 await mkdir(output,{recursive:true});const notices=[];
 for(const file of licenseFiles){const content=await readFile(join(folder,file));await copyFile(join(folder,file),join(output,file));notices.push({file:'third-party/'+pkg.name.replaceAll('/','__')+'@'+pkg.version+'/'+file,sha256:digest(content)});}
 for(const notice of upstream.filter(n=>n.package===pkg.name&&n.version===pkg.version))notices.push({file:notice.file,sha256:notice.sha256,source:notice.source,version_bound:notice.version_bound??null});
 const row={name:pkg.name,version:pkg.version,license:pkg.license??info.license??null,source:info.resolved??pkg.repository??null,integrity:info.integrity??null,notices};
 records.push(row);if(!notices.length)missing.push(row.name+'@'+row.version);
}
records.sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version));
const interfaceLicense='third-party/rea-interface-reference/LICENSE';
const references=[{name:'REA public interface reference',source:'https://github.com/morluto/rea',revision:'c19e15a2b3f09b3f693d7eab5263d83f4d2d1cd4',scope:['lib/api-contracts.json','lib/cli-contracts.json'],license:'MIT',notice:{file:interfaceLicense,sha256:digest(await readFile(resolve(root,interfaceLicense)))}}];
await writeFile(resolve(root,'third-party','inventory.json'),JSON.stringify({packages:records,compatibility_references:references,missing_notice_files:missing},null,2)+'\n');
await writeFile(resolve(root,'THIRD_PARTY_NOTICES.md'),'# Third-party notices\n\nThis application uses the packages listed below. Their supplied license and notice files are retained in the third-party folder and in installed packages. The application package is private; its own distribution license has not been selected. This inventory is an engineering record, not a legal clearance opinion.\n\n| Package | Version | Declared license | Retained notice files |\n| --- | --- | --- | --- |\n'+records.map(r=>'| '+r.name+' | '+r.version+' | '+(r.license??'Unspecified')+' | '+r.notices.map(n=>'['+n.file.split('/').at(-1)+']('+n.file+')').join(', ')+' |').join('\n')+'\n\nPackages without a top-level notice file: '+(missing.join(', ')||'None')+'. See their installed source headers and package metadata before redistributing.\n');
await writeFile(resolve(root,'THIRD_PARTY_NOTICES.md'),await readFile(resolve(root,'THIRD_PARTY_NOTICES.md'),'utf8')+'\nThe public CLI/MCP interface facts used for compatibility are associated with the REA reference revision '+references[0].revision+'. Its [MIT notice]('+interfaceLicense+') is retained with that metadata. This reference does not include the former implementation, documentation, fixtures or build output, and does not select a license for the separately authored application.\n');
console.log(JSON.stringify({packages:records.length,compatibility_references:references.length,missing}));
