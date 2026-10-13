import { Context } from './core.mjs';
import { captureProcessLocal } from './process-capture.mjs';

// A separate host process contains the PTY native backend and its workers.
// The request travels through stdin and cancellation through the owned IPC pipe.
const controller=new AbortController();process.on('message',m=>{if(m?.cancel)controller.abort(new Error('Cancelled'));});
let request='';for await(const chunk of process.stdin){request+=chunk;if(Buffer.byteLength(request)>1024*1024){process.stdout.write(JSON.stringify({error:{code:'RESOURCE_LIMIT',message:'PTY request exceeds one MiB.',remediation:'Reduce scenario metadata.'}}),()=>process.exit(0));break;}}
try{const {args,temporaryDirectory}=JSON.parse(request);const ctx=new Context({config:{temporaryDirectory},signal:controller.signal});const result=await captureProcessLocal(args,ctx);process.stdout.write(JSON.stringify({result:result.normalized_result}),()=>process.exit(0));}
catch(cause){process.stdout.write(JSON.stringify({error:{code:cause.code??'PTY_FAILED',message:cause.message,remediation:cause.remediation??'Check the selected process scenario.'}}),()=>process.exit(0));}
