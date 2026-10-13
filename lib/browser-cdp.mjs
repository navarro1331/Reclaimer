import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const sha = value => createHash('sha256').update(value).digest('hex');
export const now = () => new Date().toISOString();
export const pause = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(signal.reason ?? new Error('Cancelled'));
  const timer = setTimeout(done, Math.max(0, ms));
  function done() { signal?.removeEventListener('abort', abort); resolve(); }
  function abort() { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(signal.reason ?? new Error('Cancelled')); }
  signal?.addEventListener('abort', abort, { once: true });
});
export function safeUrl(value) {
  try { const u = new URL(value); u.username = ''; u.password = ''; for (const key of u.searchParams.keys()) u.searchParams.set(key, '[redacted]'); u.hash = ''; return u.href; }
  catch { return String(value ?? '').replace(/(?:token|password|secret|authorization)=([^\s&]+)/gi, '$1=[redacted]'); }
}
export function location(value) {
  try {
    const u = new URL(value);
    if (u.protocol === 'file:') return { kind: 'file', file_path: fileURLToPath(u) };
    if (['http:', 'https:'].includes(u.protocol)) return { kind: 'url', origin: u.origin, sanitized_url: safeUrl(u.href) };
    if (u.protocol === 'node:') return { kind: 'builtin', specifier: u.href };
  } catch { if (/^node:/.test(value)) return { kind: 'builtin', specifier: value }; }
  return { kind: 'unresolved', reported_url: safeUrl(value), reason: 'location-authorization-not-attempted' };
}
export function origin(value) { try { return new URL(value).origin; } catch { return null; } }
export function accepted(value, origins, electron = false) {
  try { const u = new URL(value); return electron ? u.protocol === 'file:' : ['http:', 'https:'].includes(u.protocol) && (!origins || origins.includes(u.origin)); } catch { return false; }
}
export function error(code, message, remediation) { const e = new Error(message); e.code = code; e.remediation = remediation; e.details={reason:code.toLowerCase(),remediation:remediation??null}; return e; }
export function milliseconds(value,fallback=100,limit=60000){const selected=value??fallback;if(!Number.isSafeInteger(selected)||selected<0||selected>limit)throw error('RESOURCE_LIMIT',`Requested duration exceeds the supported ${limit} millisecond window.`,'Select a shorter explicit observation or scenario window.');return selected;}
export function sanitizeArgs(args) {
  const walk=value=>{if(Array.isArray(value))return value.map(walk);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,['cdp_endpoint','inspector_endpoint','url'].includes(key)&&typeof item==='string'?safeUrl(item):walk(item)]));return value;};
  const result = walk(args);
  if(result.storage?.cookies)for(const cookie of result.storage.cookies)if(cookie.value?.source==='literal')cookie.value.value='[redacted]';
  return result;
}
export async function boundedResponse(response,maxBytes){const parts=[];let bytes=0;const reader=response.body?.getReader();if(!reader)return Buffer.alloc(0);try{while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>maxBytes){await reader.cancel();throw error('RESOURCE_LIMIT','HTTP response exceeded the selected byte budget.','Select a smaller explicitly scoped response.');}parts.push(Buffer.from(next.value));}return Buffer.concat(parts,bytes);}finally{reader.releaseLock();}}
export async function jsonEndpoint(endpoint, suffix, signal) {
  const u = new URL(endpoint);
  if (!['http:', 'https:'].includes(u.protocol)) throw error('INVALID_ENDPOINT', 'Discovery requires an HTTP(S) endpoint or an explicit debugger WebSocket.', 'Supply a CDP or inspector endpoint.');
  const headers = {};
  if (u.username || u.password) headers.authorization = `Basic ${Buffer.from(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`).toString('base64')}`;
  u.username = ''; u.password = ''; u.pathname = suffix; u.hash = '';
  const timeout = AbortSignal.timeout(10000);
  const response = await fetch(u, { headers, signal: signal ? AbortSignal.any([signal, timeout]) : timeout, redirect: 'error' });
  if (!response.ok) throw error('DISCOVERY_FAILED', `Debugger discovery returned HTTP ${response.status}.`, 'Check the supplied endpoint and its transport authorization.');
  const bytes = await boundedResponse(response,4*1024*1024);
  return JSON.parse(bytes.toString('utf8'));
}

/** A bounded CDP client. Closing this client only disconnects its owned socket. */
export class Cdp extends EventEmitter {
  constructor(socket, signal) { super(); this.socket = socket; this.next = 0; this.pending = new Map(); this.signal = signal; this.setMaxListeners(40); }
  static async connect(endpoint, signal) {
    if(signal?.aborted)throw error('CANCELLED','The runtime request was cancelled.','Start a new explicitly scoped request.');
    let socketUrl = endpoint;
    if (/^https?:/.test(endpoint)) { const discovery = await jsonEndpoint(endpoint, '/json/version', signal); socketUrl = discovery.webSocketDebuggerUrl; }
    const url = new URL(socketUrl);
    if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password) throw error('UNSUPPORTED_TRANSPORT', 'A debugger WebSocket without embedded credentials is required.', 'Use an explicitly authorized local debugger socket or a transport that handles authorization upstream.');
    const socket = new WebSocket(url);
    const client = new Cdp(socket, signal);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.close(); reject(error('ATTACH_TIMEOUT', 'Debugger attachment timed out.', 'Confirm the target is running and the endpoint is reachable.')); }, 10000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(error('ATTACH_FAILED', 'Debugger attachment failed.', 'Check the supplied debugger endpoint.')); }, { once: true });
    });
    socket.addEventListener('message', event => {
      if (typeof event.data !== 'string' || event.data.length > 32 * 1024 * 1024) { client.close(); return; }
      let message; try { message = JSON.parse(event.data); } catch { client.close(); return; }
      if (message.id) { const pending = client.pending.get(message.id); if (!pending) return; client.pending.delete(message.id); clearTimeout(pending.timer); message.error ? pending.reject(error('PROTOCOL_ERROR', `${pending.method}: ${message.error.message}`, 'Check support for this CDP domain on the selected runtime.')) : pending.resolve(message.result ?? {}); }
      else if (message.method) { client.emit('event', message); client.emit(`${message.sessionId ?? ''}:${message.method}`, message.params ?? {}); }
    });
    socket.addEventListener('close', () => { for (const p of client.pending.values()) { clearTimeout(p.timer); p.reject(error('TARGET_DISCONNECTED', 'Debugger disconnected.', 'Reconnect to a live target.')); } client.pending.clear(); client.emit('disconnected'); });
    client.abort = () => client.close(); signal?.addEventListener('abort', client.abort, { once: true });
    return client;
  }
  send(method, params = {}, sessionId) {
    if (this.signal?.aborted) return Promise.reject(error('CANCELLED', 'The runtime request was cancelled.', 'Start a new explicitly scoped request.'));
    if (this.socket.readyState !== 1) return Promise.reject(error('TARGET_DISCONNECTED', 'Debugger socket is not open.', 'Reconnect to a live target.'));
    if (this.pending.size >= 128) return Promise.reject(error('RESOURCE_LIMIT', 'Too many debugger commands are pending.', 'Reduce concurrent work.'));
    return new Promise((resolve, reject) => {
      const id = ++this.next;
      const timer = setTimeout(() => { this.pending.delete(id); reject(error('COMMAND_TIMEOUT', `Debugger command ${method} timed out.`, 'Check that the selected target remains responsive.')); }, 10000);
      this.pending.set(id, { resolve, reject, timer, method });
      try { this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); } catch { clearTimeout(timer); this.pending.delete(id); reject(error('TARGET_DISCONNECTED', 'Debugger socket is closed.', 'Reconnect to a live target.')); }
    });
  }
  onMethod(method, sessionId, handler) { const key = `${sessionId ?? ''}:${method}`; this.on(key, handler); return () => this.off(key, handler); }
  async attach(targetId) { const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true }); return { id: sessionId, send: (method, args) => this.send(method, args, sessionId), on: (method, fn) => this.onMethod(method, sessionId, fn), close: () => this.send('Target.detachFromTarget', { sessionId }) }; }
  close() { this.signal?.removeEventListener('abort', this.abort); for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error(this.signal?.aborted?'CANCELLED':'TARGET_DISCONNECTED','The owned debugger connection was closed.','Reconnect to a live target.')); } this.pending.clear(); if (this.socket.readyState < 2) this.socket.close(); this.removeAllListeners(); }
}
export function browserInfo(info) { return { product: info.product ?? info.Browser ?? 'unknown', protocol_version: info.protocolVersion ?? info['Protocol-Version'] ?? 'unknown', revision: info.revision ?? '', user_agent: info.userAgent ?? info['User-Agent'] ?? '', js_version: info.jsVersion ?? info['V8-Version'] ?? '' }; }
export function targetInfo(t, electron = false) {
  const common = { target_id: t.targetId ?? t.id, type: t.type, title: t.title ?? '', attached: Boolean(t.attached) };
  return electron ? { ...common, file_path: fileURLToPath(t.url) } : { ...common, url: safeUrl(t.url), origin: origin(t.url) ?? '' };
}
export async function withPage(args, ctx, fn, electron = false) {
  const client = await Cdp.connect(args.cdp_endpoint, ctx.signal);
  let session;
  try {
    const version = browserInfo(await client.send('Browser.getVersion'));
    const { targetInfos } = await client.send('Target.getTargets');
    const target = targetInfos.find(t => t.targetId === args.target_id);
    if (!target || target.type !== 'page') throw error('TARGET_NOT_FOUND', 'The caller-selected page target is unavailable.', 'Choose an ID returned by target discovery.');
    const scope = args.allowed_origins ?? [origin(target.url)];
    if (!accepted(target.url, scope, electron)) throw error('TARGET_OUTSIDE_SCOPE', 'The caller-selected page URL is outside the requested scope.', 'Select the page and origin you intend to inspect.');
    session = await client.attach(target.targetId);
    return await fn({ client, session, browser: version, target, scope, electron });
  } finally { if (session) await session.close().catch(() => {}); client.close(); }
}
export function completeness({ policy = [], unavailable = [], attach = [], truncated = [], excluded = [], dropped = {} } = {}) {
  const counts = Object.fromEntries(['scripts','network_requests','console_events','websocket_connections','websocket_frames','webmcp_tools','timeline_events'].map(k => [k, dropped[k] ?? 0])); counts.total = Object.values(counts).reduce((a,b) => a+b,0);
  const conditions = [truncated.length ? 'truncated' : null, policy.length ? 'policy_filtered' : null, attach.length || unavailable.length ? 'attach_limited' : null].filter(Boolean);
  if (!conditions.length) conditions.push('complete_within_window');
  return { status: conditions[0], conditions, policy_filtered_sections: policy, attach_limited_sections: attach, truncated_sections: truncated, unavailable_sections: unavailable, excluded, dropped_events: counts };
}
export function jsonShape(value) {
  const entries = new Map(); let nodeCount = 0, depth = 0;
  const type = v => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
  function visit(v,path,d) { if (++nodeCount > 2000 || d > 16) return; depth=Math.max(depth,d); if(path.length){const k=JSON.stringify(path);const p=entries.get(k)??{path,types:[],observations:0};if(!p.types.includes(type(v)))p.types.push(type(v));p.observations++;entries.set(k,p);} if(Array.isArray(v))for(const x of v.slice(0,100))visit(x,[...path,{kind:'array-element'}],d+1);else if(v&&typeof v==='object')for(const [k,x]of Object.entries(v).slice(0,100))visit(x,[...path,{kind:'property',name:k}],d+1); }
  visit(value,[],0); return { root_type:type(value),node_count:nodeCount,max_depth_observed:depth,properties:[...entries.values()] };
}
