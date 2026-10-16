import os,sys,json,time
from Xlib import display,X,Xatom
d=display.Display();root=d.screen().root
window=root.create_window(0,0,320,240,0,d.screen().root_depth,X.InputOutput,X.CopyFromParent,background_pixel=0)
window.set_wm_name('Owned Linux UI')
window.change_property(d.intern_atom('_NET_WM_PID'),Xatom.CARDINAL,32,[int(sys.argv[1])])
window.map();d.sync()
with open('/artifacts/spoofed-window.json','w') as out:json.dump({'pid':os.getpid(),'claimed_pid':int(sys.argv[1]),'window_id':window.id},out)
time.sleep(60)
