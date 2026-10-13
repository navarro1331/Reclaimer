import { lstat, realpath } from 'node:fs/promises';
import { sha, error, milliseconds } from './browser-cdp.mjs';

// LLDB's SB API receives request values as data, never as debugger commands.
export const objectiveCRegexPython=String.raw`
def objective_c_breakpoint_regex(b):
 selector=re.escape(b['selector'])
 cls=re.escape(b['class_name']) if b.get('class_name') else r'[^ \]]+'
 prefix='-' if b.get('method_type','any')=='instance' else r'\+' if b.get('method_type')=='class' else '[-+]'
 return prefix+r'\['+cls+' '+selector+r'\]'
`;
const helper=String.raw`
import os,json,time,re,lldb
${objectiveCRegexPython}
r=json.loads(os.environ['REAL_NATIVE_CALL_REQUEST'])
d=lldb.SBDebugger.Create();d.SetAsync(True)
t=d.CreateTarget(r['path'])
if not t.IsValid(): raise RuntimeError('LLDB could not create selected target')
start=time.monotonic();events=[];points=[];by_id={};other=[];seen_locations={}
def address(a):
 m=a.GetModule();s=a.GetSymbol();f=a.GetFileAddress();p=m.GetFileSpec().fullpath if m.IsValid() else None
 return {'load_address':hex(a.GetLoadAddress(t)),'file_address':None if f==lldb.LLDB_INVALID_ADDRESS else hex(f),'module':m.GetFileSpec().GetFilename() if m.IsValid() else None,'module_path':p,'symbol':s.GetName() if s.IsValid() else None}
for index,b in enumerate(r['breakpoints']):
 if b['kind']=='function': bp=t.BreakpointCreateByName(b['name'],b.get('module')) if b.get('module') else t.BreakpointCreateByName(b['name'])
 else:
  bp=t.BreakpointCreateByRegex(objective_c_breakpoint_regex(b))
 by_id[bp.GetID()]=index;points.append((bp,b))
li=lldb.SBLaunchInfo(r.get('arguments',[]));li.SetEnvironmentEntries([k+'='+v for k,v in r.get('environment',{}).items()],False)
if r.get('working_directory'):li.SetWorkingDirectory(r['working_directory'])
li.SetLaunchFlags(lldb.eLaunchFlagDebug)
launch_error=lldb.SBError();p=t.Launch(li,launch_error)
if launch_error.Fail():raise RuntimeError('LLDB launch failed: '+str(launch_error))
pid=p.GetProcessID();outcome='duration-elapsed';terminated=False;budget=r.get('max_events',250);duration=r.get('duration_ms',1000)/1000.0
listener=d.GetListener();event=lldb.SBEvent();stdout='';stderr=''
def drain():
 global stdout,stderr
 if len(stdout.encode())<1048576:stdout+=p.GetSTDOUT(8192) or ''
 if len(stderr.encode())<1048576:stderr+=p.GetSTDERR(8192) or ''
while time.monotonic()-start<duration:
 drain();state=p.GetState()
 if state==lldb.eStateExited:outcome='exited';break
 if state==lldb.eStateStopped:
  for index,(bp,request) in enumerate(points):
   if bp.GetNumLocations():seen_locations[index]={'count':bp.GetNumLocations(),'locations':[address(bp.GetLocationAtIndex(i).GetAddress()) for i in range(min(bp.GetNumLocations(),128))]}
  for th in p:
   if th.GetStopReason()!=lldb.eStopReasonBreakpoint:continue
   if th.GetStopReasonDataCount()<2:continue
   index=by_id.get(th.GetStopReasonDataAtIndex(0))
   if index is None:continue
   frame=th.GetFrameAtIndex(0);regs=[];triple=t.GetTriple() or ''
   names=['x'+str(i) for i in range(8)] if 'aarch64' in triple or 'arm64' in triple else ['rdi','rsi','rdx','rcx','r8','r9']
   if 'windows' in triple:names=['rcx','rdx','r8','r9']
   for name in names[:r.get('argument_registers',0)]:
    v=frame.FindRegister(name)
    if v.IsValid() and v.GetValue() is not None:regs.append({'name':name,'value':hex(v.GetValueAsUnsigned())})
   back=[address(th.GetFrameAtIndex(i).GetPCAddress()) for i in range(min(th.GetNumFrames(),r.get('backtrace_frames',8)))]
   events.append(dict(address(frame.GetPCAddress()),sequence=len(events)+1,elapsed_ms=(time.monotonic()-start)*1000,thread_id=th.GetThreadID(),breakpoint_index=index,receiver_class=None,selector=r['breakpoints'][index].get('selector'),registers=regs,backtrace=back))
   if len(events)>=budget:break
  if len(events)>=budget:outcome='event-limit';break
  p.Continue()
 listener.WaitForEvent(1,event)
drain()
if p.GetState()!=lldb.eStateExited:
 kill=p.Kill()
 if kill.Fail():raise RuntimeError('Owned LLDB target cleanup failed')
 terminated=True
breakpoints=[]
for index,(bp,b) in enumerate(points):
 request=dict(b)
 if b['kind']=='function':request.setdefault('module',None)
 else:request.setdefault('class_name',None);request.setdefault('method_type','any')
 observed=seen_locations.get(index,{'count':bp.GetNumLocations(),'locations':[address(bp.GetLocationAtIndex(i).GetAddress()) for i in range(min(bp.GetNumLocations(),128))]})
 breakpoints.append({'index':index,'request':request,'location_count':observed['count'],'locations':observed['locations']})
def stream(text):return {'text':text,'bytes':len(text.encode()),'truncated':len(text.encode())>=1048576,'complete':outcome=='exited'}
result={'architecture':t.GetTriple() or 'unknown','version':d.GetVersionString(),'process':{'pid':pid,'outcome':outcome,'exit_status':p.GetExitStatus() if outcome=='exited' else None,'exit_description':p.GetExitDescription() if outcome=='exited' else None,'terminated':terminated,'elapsed_ms':(time.monotonic()-start)*1000,'stdout':stream(stdout),'stderr':stream(stderr),'other_stops':other},'breakpoints':breakpoints,'events':events}
lldb.SBDebugger.Destroy(d)
print('REAL_NATIVE_REPLY:'+json.dumps(result))
`;
export async function debuggerPrerequisite(ctx){const candidates=ctx.config?.lldbPath?[ctx.config.lldbPath]:process.platform==='win32'?['C:\\Program Files\\LLVM\\bin\\lldb.exe']:['/usr/bin/lldb','/usr/local/swift/usr/bin/lldb','/usr/local/bin/lldb'];let debuggerPath;for(const candidate of candidates)try{if((await lstat(candidate)).isFile()){debuggerPath=await realpath(candidate);break;}}catch{}return {configured:Boolean(ctx.config?.lldbPath),path:debuggerPath??null,present:Boolean(debuggerPath),validation_scope:'file-presence-only; Python SB support and target compatibility are not proven'};}
export async function nativeCalls(args,ctx){const op='observe_native_calls',path=ctx.target?.path;if(!path)return ctx.unavailable(op,'No selected native executable is open.','Open the explicitly selected native executable before call observation.');const debuggerPath=(await debuggerPrerequisite(ctx)).path;if(!debuggerPath)return ctx.unavailable(op,'No supported LLDB executable is configured on this host.','Install a local LLDB with Python SB API support and configure lldbPath; no debugger is downloaded or globally installed by this operation.');const targetPath=await realpath(path),st=await lstat(targetPath,{bigint:true}),targetSha=sha(await ctx.read(targetPath));if((args.max_events??250)>2000)throw error('RESOURCE_LIMIT','Native-call observation supports at most two thousand selected events.','Select max_events at or below two thousand.');const request={...args,path:targetPath,duration_ms:milliseconds(args.duration_ms,10000,60000),max_events:args.max_events??250};const env={REAL_NATIVE_CALL_REQUEST:JSON.stringify(request)};if(process.platform==='win32')env.SystemRoot=process.env.SystemRoot??'C:\\Windows';const command='script exec(__import__("base64").b64decode("'+Buffer.from(helper,'utf8').toString('base64')+'"))';let reply;try{reply=await ctx.run([debuggerPath,'--batch','-o',command],{timeout:request.duration_ms+15000,env});}catch(cause){if(ctx.signal?.aborted)throw cause;return ctx.unavailable(op,'The configured LLDB could not complete a bounded launch and cleanup.','Verify LLDB Python support, local debugger permissions, executable architecture, and the caller-selected environment.');}const line=reply.stdout.split(/\r?\n/).find(x=>x.startsWith('REAL_NATIVE_REPLY:'));if(!line)throw error('DEBUGGER_HELPER_FAILED','LLDB did not return an observation result.','Check LLDB Python SB API support and selected executable prerequisites.');const raw=JSON.parse(line.slice('REAL_NATIVE_REPLY:'.length));let selectedAfter;try{selectedAfter=await lstat(targetPath,{bigint:true});}catch{}const stable=selectedAfter&&st.dev===selectedAfter.dev&&st.ino===selectedAfter.ino&&st.size===selectedAfter.size&&st.mtimeNs===selectedAfter.mtimeNs;const environment=Object.fromEntries(Object.keys(args.environment??{}).map(k=>[k,'[caller-supplied]']));for(const value of Object.values(args.environment??{}))if(value)for(const k of ['stdout','stderr'])raw.process[k].text=raw.process[k].text.replaceAll(value,'[redacted]');for(const stream of ['stdout','stderr'])raw.process[stream].bytes=Buffer.byteLength(raw.process[stream].text);const unresolved=raw.breakpoints.filter(b=>!b.location_count).map(b=>b.index);const normalized={target:{path:targetPath,sha256:targetSha,architecture:raw.architecture,arguments:args.arguments??[],environment,working_directory:args.working_directory??null,launch_identity:{loaded_image_sha256:null,file_device:String(st.dev),file_inode:String(st.ino),selected_file_sha256:targetSha,module_path:targetPath,module_uuid:null,stable:Boolean(stable)}},debugger:{path:debuggerPath,sha256:sha(await ctx.read(debuggerPath)),version:raw.version},process:raw.process,breakpoints:raw.breakpoints,events:raw.events,coverage:{status:unresolved.length||raw.process.outcome!=='exited'?'partial':'complete',event_limit_reached:raw.process.outcome==='event-limit',resource_limit_reached:false,unresolved_breakpoints:unresolved},limitations:['Debugger execution uses a caller-selected executable, arguments, environment, named breakpoints, and bounded observation window.','Register values are observed machine state; language-level argument semantics and Objective-C receiver class remain unknown.','Selected-file metadata does not establish loaded-image identity.','Breakpoint locations retain actual stopped-process observations; module unloading at exit does not erase observed resolution.']};return ctx.evidence(op,{...args,environment},normalized,{provider:{id:'real-lldb',name:'Independent LLDB SB observer',version:'1'},authority:'controlled-replay',confidence:'observed',limitations:normalized.limitations});}
export const debuggerHandlers={observe_native_calls:nativeCalls};
