import { channel } from 'node:diagnostics_channel';
import { appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const dir=fileURLToPath(new URL('../.cache',import.meta.url));
mkdirSync(dir,{recursive:true});
const run=process.env.REAL_VERIFICATION_RUN_ID??'manual';
if(!/^[a-zA-Z0-9-]+$/.test(run))throw new Error('Invalid verification run identifier');
const output=dir+'/operations-'+run+'-'+process.pid+'.jsonl';
channel('real.validated-operation').subscribe(({operation})=>appendFileSync(output,JSON.stringify({operation})+'\n'));
