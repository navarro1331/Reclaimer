import gi,json,os
gi.require_version('Gtk','3.0')
gi.require_version('GdkX11','3.0')
from gi.repository import Gtk,GdkX11,GLib

window=Gtk.Window(title='Owned Linux UI')
window.set_default_size(320,240)
box=Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
window.add(box)
button=Gtk.Button(label='Owned click')
entry=Gtk.Entry();entry.get_accessible().set_name('Owned entry')
password=Gtk.Entry();password.set_visibility(False);password.set_text('OWNED_PASSWORD_NEVER_RETAIN');password.get_accessible().set_name('Owned password')
adjustment=Gtk.Adjustment(value=0,lower=0,upper=100,step_increment=1,page_increment=10,page_size=0)
scroll=Gtk.Scrollbar(orientation=Gtk.Orientation.VERTICAL,adjustment=adjustment);scroll.get_accessible().set_name('Owned scroll');scroll.set_size_request(20,80)
for widget in [button,entry,password,scroll]:box.pack_start(widget,False,False,0)
state={'clicks':0,'text':'','scroll':0}
def effect(*unused):
 state['text']=entry.get_text()
 state['scroll']=adjustment.get_value()
 with open('/artifacts/effects.json','w') as out:json.dump(state,out)
def click(*unused):state['clicks']+=1;effect()
button.connect('clicked',click);entry.connect('changed',effect)
adjustment.connect('value-changed',effect)
window.connect('destroy',Gtk.main_quit);window.show_all();effect()
with open('/artifacts/selected.json','w') as out:json.dump({'pid':os.getpid(),'window_id':window.get_window().get_xid()},out)
other=None
def poll():
 global other
 if os.path.exists('/artifacts/create-ambiguous') and other is None:
  other=Gtk.Window(title='Owned Linux UI');other.set_default_size(320,240);other.show_all()
  with open('/artifacts/ambiguous.json','w') as out:json.dump({'window_id':other.get_window().get_xid()},out)
 return True
GLib.timeout_add(30,poll)
Gtk.main()
