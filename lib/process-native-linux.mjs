import {basename} from 'node:path';
import {sha,error} from './browser-cdp.mjs';

// The caller selects an actual X11 window ID and PID. AT-SPI application IDs
// are not window IDs; correlate only one exact native-window title/rectangle.
export const linuxUiHelper=String.raw`
import os,json,time,hashlib,base64
import gi
gi.require_version('Atspi','2.0')
gi.require_version('Gdk','3.0')
gi.require_version('GdkX11','3.0')
from gi.repository import Atspi,Gdk,GdkX11
from Xlib import display,X
from Xlib.ext import res

r=json.loads(os.environ['REAL_NATIVE_UI_REQUEST'])
pid=int(r['pid']);wid=int(r['window_id']);maximum=min(r.get('max_nodes',1000),10000)
d=display.Display();native=d.create_resource_object('window',wid)
Atspi.set_timeout(3000,3000)
def identity():
 s=open('/proc/'+str(pid)+'/stat').read();fields=s[s.rfind(')')+2:].split()
 return (fields[19],os.readlink('/proc/'+str(pid)+'/exe'))
expected=identity();executable=expected[1]
boot=next(int(s.split()[1]) for s in open('/proc/stat') if s.startswith('btime '))
launch=boot+int(expected[0])/os.sysconf('SC_CLK_TCK')
def native_identity():
 if identity()!=expected:raise RuntimeError('Selected process launch identity changed')
 owners=d.res_query_client_ids([{'client':wid,'mask':res.LocalClientPIDMask}]).ids
 pids=[int(row.value[0]) for row in owners if row.spec.mask==res.LocalClientPIDMask and len(row.value)==1]
 if pids!=[pid]:raise RuntimeError('X11 server resource owner does not match selected local PID')
 prop=native.get_full_property(d.intern_atom('_NET_WM_PID'),X.AnyPropertyType)
 if prop is None or len(prop.value)!=1 or int(prop.value[0])!=pid:raise RuntimeError('Selected X11 window does not belong to selected PID')
 geometry=native.get_geometry();x,y=geometry.x,geometry.y;parent=native.query_tree().parent;root=d.screen().root
 for depth in range(32):
  if parent.id==root.id:break
  g=parent.get_geometry();x+=g.x;y+=g.y;parent=parent.query_tree().parent
 else:raise RuntimeError('Native window ancestry exceeds thirty-two levels')
 title=native.get_wm_name() or ''
 return str(title),int(x),int(y),int(geometry.width),int(geometry.height)
title,x,y,width,height=native_identity()
desktop=Atspi.get_desktop(0);candidates=[]
for i in range(min(desktop.get_child_count(),128)):
 application=desktop.get_child_at_index(i)
 if application.get_process_id()!=pid:continue
 for j in range(min(application.get_child_count(),128)):
  window=application.get_child_at_index(j)
  component=window.get_component_iface()
  if component is None:continue
  box=component.get_extents(Atspi.CoordType.SCREEN)
  if window.get_name()==title and (box.x,box.y,box.width,box.height)==(x,y,width,height):candidates.append(window)
if len(candidates)!=1:raise RuntimeError('Selected native window has no unique matching AT-SPI top-level accessible')
root=candidates[0]
def checked_root():
 current=native_identity();box=root.get_component_iface().get_extents(Atspi.CoordType.SCREEN)
 if root.get_process_id()!=pid or root.get_name()!=current[0] or (box.x,box.y,box.width,box.height)!=current[1:]:raise RuntimeError('Selected accessible no longer matches native window ownership')
 return current
def children(node):return max(0,node.get_child_count())
def action_names(node):
 action=node.get_action_iface()
 if action is None:return []
 return [action.get_action_name(i).lower() for i in range(min(action.get_n_actions(),32))]
def snapshot():
 current=checked_root();nodes=[];truncated=False;size=0
 def visit(node,path,depth):
  nonlocal truncated,size
  if len(nodes)>=maximum or depth>=32:truncated=True;return
  if node.get_process_id()!=pid:raise RuntimeError('Accessibility node escaped selected process')
  node.clear_cache();role=node.get_role();count=children(node);actions=[];value=None
  names=action_names(node)
  if any(n in ('click','press','activate','toggle') for n in names):actions.append('click')
  editable=node.get_editable_text_iface()
  protected=role==Atspi.Role.PASSWORD_TEXT
  if editable is not None:actions.append('key-entry')
  text=node.get_text_iface()
  if text is not None and not protected:value=text.get_text(0,min(text.get_character_count(),65536))
  val=node.get_value_iface()
  if role==Atspi.Role.SCROLL_BAR and val is not None:actions.append('scroll');value=str(val.get_current_value())
  row={'path':path,'role':node.get_role_name(),'title':node.get_name(),'value':value,'actions':actions,'children_count':count}
  size+=len(json.dumps(row).encode())
  if size>8*1024*1024:raise RuntimeError('Accessibility snapshot exceeds eight MiB')
  nodes.append(row)
  for index in range(min(count,maximum)):
   if len(nodes)>=maximum:truncated=True;break
   visit(node.get_child_at_index(index),path+[index],depth+1)
 if r.get('accessibility',True):visit(root,[],0)
 image=None;gaps=[]
 if r.get('screenshot',True):
  if 0<current[3]*current[4]<=16000000:
   try:
    Gdk.init([]);foreign=GdkX11.X11Window.foreign_new_for_display(Gdk.Display.get_default(),wid)
    pixels=Gdk.pixbuf_get_from_window(foreign,0,0,current[3],current[4])
    if pixels is None:raise RuntimeError('Selected native window did not expose pixels')
    success,raw=pixels.save_to_bufferv('png',[],[])
    if not success:raise RuntimeError('PNG serialization failed')
    if len(raw)>8*1024*1024:raise RuntimeError('Selected PNG exceeds eight MiB')
    image={'mime_type':'image/png','base64':base64.b64encode(raw).decode(),'sha256':hashlib.sha256(raw).hexdigest(),'width':current[3],'height':current[4]}
   except Exception:gaps.append('Selected X11 window pixels were unavailable; no screenshot is claimed.')
  else:gaps.append('Selected X11 pixels unavailable or exceed sixteen million pixels.')
 checked_root()
 return {'window':{'pid':pid,'window_id':wid,'executable':executable,'launch_time':launch,'title':current[0]},'nodes':nodes if r.get('accessibility',True) else [],'truncated':truncated,'screenshot':image,'gaps':gaps}
def select(path):
 node=root
 for index in path:
  if not 0<=index<children(node):raise RuntimeError('Selected accessibility path no longer exists')
  node=node.get_child_at_index(index)
 return node
initial=snapshot();last=initial;steps=[]
retained=len(json.dumps(initial).encode())
if retained>16*1024*1024:raise RuntimeError('Linux UI output exceeds sixteen MiB')
for step in r.get('steps',[]):
 before=last;after=None;outcome='completed';reason=None
 try:
  checked_root()
  if step['kind']=='wait':time.sleep(min(step['milliseconds'],30000)/1000)
  else:
   node=select(step['path'])
   if node.get_process_id()!=pid:raise RuntimeError('Selected action escaped process ownership')
   if step['kind']=='click':
    action=node.get_action_iface();names=action_names(node)
    indices=[i for i,n in enumerate(names) if n in ('click','press','activate','toggle')]
    if not indices or not action.do_action(indices[0]):raise RuntimeError('Selected control exposes no successful supported action')
   elif step['kind']=='key-entry':
    editable=node.get_editable_text_iface()
    if editable is None or len(step['text'].encode())>65536 or not editable.set_text_contents(step['text']):raise RuntimeError('Selected control cannot accept bounded text')
   elif step['kind']=='scroll':
    val=node.get_value_iface()
    if node.get_role()!=Atspi.Role.SCROLL_BAR or val is None:raise RuntimeError('Selected control exposes no supported scrollbar value')
    amount=max(val.get_minimum_increment(),(val.get_maximum_value()-val.get_minimum_value())/10)
    value=max(val.get_minimum_value(),min(val.get_maximum_value(),val.get_current_value()+amount*(1 if step['direction']=='increment' else -1)))
    if not val.set_current_value(value):raise RuntimeError('Selected scrollbar refused the value')
  time.sleep(0.03);after=snapshot();last=after
 except Exception as failure:outcome='failed';reason=str(failure)
 row={'index':len(steps),'kind':step['kind'],'before':before,'after':after,'outcome':outcome,'reason':reason}
 retained+=len(json.dumps(row).encode())
 if retained>16*1024*1024:raise RuntimeError('Linux UI output exceeds sixteen MiB')
 steps.append(row)
 if outcome!='completed':break
print(json.dumps({'executable':executable,'initial':initial,'steps':steps}))
`;

export async function linuxNativeUi(args,ctx,scenario=false){
 const op=scenario?'capture_native_ui_scenario':'observe_native_ui';
 if(!process.env.DISPLAY||!process.env.DBUS_SESSION_BUS_ADDRESS)return ctx.unavailable(op,'Linux UI requires an explicit local X11 display and session D-Bus with AT-SPI.','Run in the selected local accessibility session; no desktop service is installed or activated by this operation.');
 const environment={PATH:process.env.PATH??'',DISPLAY:process.env.DISPLAY,DBUS_SESSION_BUS_ADDRESS:process.env.DBUS_SESSION_BUS_ADDRESS,REAL_NATIVE_UI_REQUEST:JSON.stringify(args)};
 for(const name of ['XAUTHORITY','XDG_RUNTIME_DIR','AT_SPI_BUS_ADDRESS'])if(process.env[name])environment[name]=process.env[name];
 let result;
 try{const reply=await ctx.run(['/usr/bin/python3','-I','-B','-c',linuxUiHelper],{timeout:Math.min(60000,30000+(args.steps??[]).reduce((n,s)=>n+(s.milliseconds??0),0)),env:environment});result=JSON.parse(reply.stdout);}
 catch(cause){if(ctx.signal?.aborted)throw cause;throw error('NATIVE_UI_HELPER_FAILED','The selected X11 window could not be matched and inspected through AT-SPI.','Verify the exact PID/X11 window ID, unchanged launch identity, local X11/AT-SPI session and Python GI/Xlib prerequisites.');}
 const hash=sha(await ctx.read(result.executable));
 const limitations=['The selected X11 resource owner PID (XRes), window _NET_WM_PID and /proc executable/start identity are rechecked before snapshots and actions; the client-set PID property alone grants no authority.','AT-SPI correlation requires a unique matching top-level title and native rectangle; ambiguous or inaccessible windows are rejected.','AT-SPI paths index the current selected control tree; actions leave the selected application as-is.','Only exposed local X11 pixels and supported AT-SPI actions are observed; Wayland, arbitrary toolkits and protected pixels remain unproved.'];
 return ctx.evidence(op,args,{target_sha256:hash,initial:result.initial,steps:result.steps,restore:'leave-as-is',limitations},{subject:{name:basename(result.executable),digest:{sha256:hash},format:'file',architecture:null,local_path:result.executable},provider:{id:'real-linux-atspi',name:'Independent X11 and AT-SPI observer',version:'1'},authority:scenario?'controlled-replay':'external-service',confidence:'observed',limitations});
}
