import {writeFile,rename} from 'node:fs/promises';
const [mode,receipt]=process.argv.slice(2);
let input='';for await(const chunk of process.stdin)input+=chunk;
if(receipt){await writeFile(receipt+'.pending',JSON.stringify({pid:process.pid,input_bytes:Buffer.byteLength(input),argv_data:process.argv.slice(2)})+'\n',{flag:'wx'});await rename(receipt+'.pending',receipt);}
if(mode==='hold'){process.stdout.write('ready\n');setInterval(()=>{},1000);}
else if(mode==='overflow')process.stdout.write(input.repeat(100));
else process.stdout.write(input);
