// An owned Node process fixture; this does not implement or impersonate Swift.
import {appendFile,writeFile} from 'node:fs/promises';
const [recordPath,markerPath,...argv]=process.argv.slice(2);
await appendFile(recordPath,JSON.stringify({pid:process.pid,argv})+'\n');
if(argv[0]==='--version')process.stdout.write('v\n');
else if(argv[2]==='hold'){
 await writeFile(markerPath+'.started',String(process.pid));
 setTimeout(async()=>{await writeFile(markerPath,'Owned work after the request deadline.');process.stdout.write('hold\n');},6000);
}else if(argv[2]==='emit')process.stdout.write('é'.repeat(4096)+'\n');
else process.stdout.write(argv[2]+'\n');
