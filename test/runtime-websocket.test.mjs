import { runtimeChrome } from './runtime-provider-prerequisites.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { Context } from '../lib/core.mjs';
import { handlers } from '../lib/runtime.mjs';
import { pause } from '../lib/browser-cdp.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
test('owned browser observes real WebSocket frames through created-connection scope',async t=>{const chromeExecutable=await runtimeChrome(t);if(!chromeExecutable)return;
 const dir=await mkdtemp(join(root,'test','runtime-ws-')),sockets=new Set(),payload=Buffer.from('{"fixture":true}');let browser;
 const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<body>Owned socket fixture<script>setInterval(()=>{const w=new WebSocket(location.origin.replace("http","ws")+"/socket");w.onmessage=()=>w.close();},120)</script>');});
 // This fixture sends one small unmasked server text frame per owned connection.
 server.on('upgrade',(req,socket)=>{if(req.url!=='/socket'||typeof req.headers['sec-websocket-key']!=='string'){socket.destroy();return;}sockets.add(socket);socket.once('close',()=>sockets.delete(socket));socket.on('error',()=>{});socket.on('data',()=>{});const accept=createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');socket.write(Buffer.concat([Buffer.from([0x81,payload.length]),payload]));const timer=setTimeout(()=>socket.destroy(),50);socket.once('close',()=>clearTimeout(timer));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{
  browser=await chromium.launchPersistentContext(join(dir,'profile'),{executablePath:chromeExecutable,headless:true,args:['--remote-debugging-port=0']});await browser.pages()[0].goto(origin);
  let port;for(let i=0;i<100;i++){try{port=(await readFile(join(dir,'profile','DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await pause(20);}}assert.ok(port);
  const ctx=new Context({config:{temporaryDirectory:dir}});ctx.handlers=handlers;const cdp_endpoint='http://127.0.0.1:'+port;
  const listed=(await ctx.call('list_browser_targets',{cdp_endpoint,allowed_origins:[origin]})).normalized_result;
  const captured=(await ctx.call('inspect_web_page',{cdp_endpoint,target_id:listed.targets[0].target_id,allowed_origins:[origin],observation_ms:500,include_websocket_shapes:true})).normalized_result;
  const frames=captured.network.websocket_events.filter(e=>e.direction==='received'&&e.opcode===1);
  assert.ok(frames.length>0,'A real newly observed same-origin WebSocket must produce retained frame shapes');
  assert.ok(frames.some(e=>e.payload_shape?.format==='json'&&e.payload_bytes===payload.length));
  assert.ok(frames.some(e=>e.payload_shape.json_shape.properties.some(p=>p.path.some(x=>x.name==='fixture'))));
  assert.ok(captured.completeness.attach_limited_sections.includes('websocket_shapes'));
 }finally{await browser?.close();for(const socket of sockets)socket.destroy();await new Promise(r=>server.close(r));const selected=resolve(dir);assert.ok(selected.startsWith(resolve(join(root,'test'))+sep+'runtime-ws-'));await rm(selected,{recursive:true,force:true});}
});
