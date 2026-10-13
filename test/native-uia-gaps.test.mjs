import {runtimePowerShell} from './runtime-provider-prerequisites.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { Context, digest } from '../lib/core.mjs';
import { nativeHandlers } from '../lib/process-native.mjs';

// Owned WPF controls exercise the existing adapter. No vendor application is
// selected. Scroll behavior follows the documented UIA ScrollPattern contract:
// https://learn.microsoft.com/dotnet/api/system.windows.automation.scrollpattern
const program=String.raw`
$ErrorActionPreference='Stop'
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
$fixtureRoot=[IO.Path]::GetFullPath($env:REAL_OWNED_UI_ROOT)
$statePath=[IO.Path]::GetFullPath($env:REAL_OWNED_UI_STATE)
$stopPath=[IO.Path]::GetFullPath($env:REAL_OWNED_UI_STOP)
$sourcePath=[IO.Path]::GetFullPath($env:REAL_OWNED_UI_SOURCE)
foreach($selected in @($statePath,$stopPath,$sourcePath)) {
 if(-not $selected.StartsWith($fixtureRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Owned fixture path escaped its root.' }
}
$window=[System.Windows.Window]::new()
$window.Title='Owned Value Scroll Capture Fixture'
$window.ShowInTaskbar=$false
$window.WindowStartupLocation='Manual'
$window.Left=-4000;$window.Top=-4000;$window.Width=420;$window.Height=300
$window.ResizeMode='NoResize'
$panel=[System.Windows.Controls.StackPanel]::new()
$edit=[System.Windows.Controls.TextBox]::new()
$edit.Text='owned-initial';$edit.Height=30
[System.Windows.Automation.AutomationProperties]::SetName($edit,'OwnedValue')
$offset=[System.Windows.Controls.TextBlock]::new();$offset.Text='Owned offset 0';$offset.Height=25
$scroll=[System.Windows.Controls.ScrollViewer]::new()
$scroll.Height=160;$scroll.VerticalScrollBarVisibility='Visible';$scroll.HorizontalScrollBarVisibility='Disabled'
$scroll.CanContentScroll=$false
[System.Windows.Automation.AutomationProperties]::SetName($scroll,'OwnedScroll')
$rows=[System.Windows.Controls.StackPanel]::new()
for($i=0;$i -lt 8;$i++) {
 $row=[System.Windows.Controls.TextBlock]::new();$row.Text='Owned row '+$i;$row.Height=30
 [void]$rows.Children.Add($row)
}
$scroll.Content=$rows
[void]$panel.Children.Add($edit);[void]$panel.Children.Add($offset);[void]$panel.Children.Add($scroll)
$window.Content=$panel
$app=[System.Windows.Application]::new()
$timer=[System.Windows.Threading.DispatcherTimer]::new();$timer.Interval=[TimeSpan]::FromMilliseconds(100)
$process=[Diagnostics.Process]::GetCurrentProcess()
$launch=([DateTimeOffset]$process.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds()/1000.0
$executable=$process.MainModule.FileName
$script:handle=0
$script:lastValue=$null;$script:lastOffset=$null
function SaveOwnedState {
 $nextTitle='Owned offset '+$scroll.VerticalOffset.ToString('R',[Globalization.CultureInfo]::InvariantCulture)
 if($offset.Text -ne $nextTitle) {$offset.Text=$nextTitle}
 $state=[ordered]@{pid=$PID;window_id=$script:handle;launch_time=$launch;executable=$executable;source_path=$sourcePath;value=$edit.Text;vertical_offset=$scroll.VerticalOffset;extent_height=$scroll.ExtentHeight;viewport_height=$scroll.ViewportHeight;width=$window.ActualWidth;height=$window.ActualHeight;recorded_at_ms=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}
 [IO.File]::WriteAllText($statePath,($state|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
 $script:lastValue=$edit.Text;$script:lastOffset=$scroll.VerticalOffset
}
$timer.Add_Tick({
 if([IO.File]::Exists($stopPath)) {$timer.Stop();$app.Shutdown();return}
 if($edit.Text -ne $script:lastValue -or $scroll.VerticalOffset -ne $script:lastOffset) {SaveOwnedState}
})
$window.Add_Loaded({
 $script:handle=[System.Windows.Interop.WindowInteropHelper]::new($window).Handle.ToInt64()
 $window.UpdateLayout();SaveOwnedState
 [Console]::WriteLine('OWNED_UI_READY');[Console]::Out.Flush();$timer.Start()
})
try {[void]$app.Run($window)} finally {$timer.Stop();$process.Dispose()}
`;

const pause=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
function contained(root,selected){const r=relative(resolve(root),resolve(selected));assert.ok(r!==''&&!isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep),`Path escaped owned root: ${selected}`);}
async function stateAt(path,predicate=()=>true){
 const deadline=Date.now()+5000;let last;
 while(Date.now()<deadline){try{const state=JSON.parse(await readFile(path,'utf8'));last=state;if(predicate(state))return state;}catch(error){last=error.message;}await pause(50);}
 assert.fail('Owned WPF state did not reach the selected condition: '+JSON.stringify(last));
}
function assertIdentity(snapshot,owned,executable){
 assert.equal(snapshot.window.pid,owned.pid);assert.equal(snapshot.window.window_id,owned.window_id);
 assert.equal(snapshot.window.executable.toLowerCase(),executable.toLowerCase());
 assert.ok(Math.abs(snapshot.window.launch_time-owned.launch_time)<0.01,'Snapshot must retain the independently recorded child launch time');
}
async function closeOwned(child,closed,stopPath){
 if(!child)return;
 if(child.exitCode===null&&child.signalCode===null){await writeFile(stopPath,'owned stop').catch(()=>{});const stopped=await Promise.race([closed.then(()=>true),pause(5000).then(()=>false)]);if(!stopped)child.kill();}
 const exited=await Promise.race([closed.then(()=>true),pause(5000).then(()=>false)]);
 assert.equal(exited,true,'Owned WPF child must exit before its files are removed');
}

test('owned Windows UIA Value/Scroll states and PrintWindow metadata stay bound to one child window',{timeout:180000},async t=>{
 const selectedPowerShell=await runtimePowerShell(t);if(!selectedPowerShell)return;
 const root=await mkdtemp(join(tmpdir(),'real-owned-uia-'));
 assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep+'real-owned-uia-'));
 const source=join(root,'owned-window.ps1'),statePath=join(root,'state.json'),stopPath=join(root,'stop');
 for(const selected of [source,statePath,stopPath])contained(root,selected);
 const powershell=await realpath(selectedPowerShell);
 let child,closed;
 t.after(async()=>{
  await closeOwned(child,closed,stopPath);
  const actual=await realpath(root);assert.equal(actual.toLowerCase(),resolve(root).toLowerCase());
  assert.ok(actual.toLowerCase().startsWith(resolve(tmpdir()).toLowerCase()+sep+'real-owned-uia-'));
  await rm(actual,{recursive:true,force:true});
 });
 await writeFile(source,program,{flag:'wx'});const sourceHash=digest(await readFile(source)),targetHash=digest(await readFile(powershell));
 child=spawn(powershell,['-NoLogo','-NoProfile','-NonInteractive','-STA','-EncodedCommand',Buffer.from(program,'utf16le').toString('base64')],{shell:false,windowsHide:true,env:{SystemRoot:process.env.SystemRoot??'C:\\Windows',REAL_OWNED_UI_ROOT:root,REAL_OWNED_UI_STATE:statePath,REAL_OWNED_UI_STOP:stopPath,REAL_OWNED_UI_SOURCE:source},stdio:['ignore','pipe','pipe']});
 closed=new Promise(resolve=>child.once('close',resolve));
 await new Promise((resolve,reject)=>{
  let output='',diagnostics='';const timer=setTimeout(()=>reject(new Error('Owned WPF readiness timeout: '+diagnostics)),30000);
  const fail=error=>{clearTimeout(timer);reject(error);};child.once('error',fail);
  child.stderr.on('data',chunk=>{diagnostics=(diagnostics+chunk).slice(-16384);});
  child.stdout.on('data',chunk=>{output=(output+chunk).slice(-4096);if(output.includes('OWNED_UI_READY')){clearTimeout(timer);resolve();}});
  child.once('exit',code=>fail(new Error('Owned WPF exited before readiness: '+code+' '+diagnostics)));
 });
 const owned=await stateAt(statePath,state=>state.window_id>0&&state.extent_height>state.viewport_height);
 assert.equal(owned.pid,child.pid);assert.equal(owned.source_path,source);assert.equal(owned.executable.toLowerCase(),powershell.toLowerCase());
 const identity={pid:owned.pid,window_id:owned.window_id},ctx=new Context({config:{temporaryDirectory:root}});ctx.handlers=nativeHandlers;
 const run=ctx.run.bind(ctx);
 ctx.run=async(argv,options)=>{
  const request=JSON.parse(options.env.REAL_NATIVE_UI_REQUEST);
  assert.equal(request.pid,owned.pid);assert.equal(request.window_id,owned.window_id);
  assert.equal(resolve(argv[0]).toLowerCase(),powershell.toLowerCase());
  const started=performance.now(),scope={pid:owned.pid,window_id:owned.window_id,actions:(request.steps??[]).map(step=>step.kind),accessibility:request.accessibility,screenshot:request.screenshot,timeout_ms:options.timeout};
  try {const result=await run(argv,options);t.diagnostic(JSON.stringify({helper:'completed',...scope,elapsed_ms:Math.round(performance.now()-started)}));return result;}
  catch(error){
   let observed=null;try {const state=JSON.parse(await readFile(statePath,'utf8'));observed={pid:state.pid,window_id:state.window_id,launch_time:state.launch_time,value:String(state.value).slice(0,128),vertical_offset:state.vertical_offset,recorded_at_ms:state.recorded_at_ms};}catch{}
   t.diagnostic(JSON.stringify({helper:'failed',...scope,elapsed_ms:Math.round(performance.now()-started),cause_name:error.name,cause_code:error.code??null,cause_signal:error.signal??null,supervisor_killed:!!error.killed,stdout_bytes:Buffer.byteLength(error.stdout??''),stderr_tail:String(error.stderr??'').slice(-2048),owned_state:observed}));throw error;
  }
 };
 const initial=(await ctx.call('observe_native_ui',{...identity,accessibility:true,screenshot:false,max_nodes:200})).normalized_result;
 assertIdentity(initial.initial,owned,powershell);assert.equal(initial.target_sha256,targetHash);assert.equal(initial.initial.screenshot,null);assert.equal(initial.initial.truncated,false);
 const edit=initial.initial.nodes.find(node=>node.title==='OwnedValue'&&node.actions.includes('key-entry'));
 const scroll=initial.initial.nodes.find(node=>node.title==='OwnedScroll'&&node.actions.includes('scroll'));
 assert.ok(edit,'Owned TextBox must expose ValuePattern');assert.ok(scroll,'Owned ScrollViewer must expose ScrollPattern');assert.equal(edit.value,'owned-initial');
 await t.test('ValuePattern changes retained UIA text and the owned control state',async()=>{
  const text='owned replacement 42',out=(await ctx.call('capture_native_ui_scenario',{...identity,screenshot:false,accessibility:true,max_nodes:200,steps:[{kind:'key-entry',path:edit.path,text},{kind:'wait',milliseconds:150}]})).normalized_result;
  assert.equal(out.steps.length,2);for(const step of out.steps){assert.equal(step.outcome,'completed',step.reason??'');assertIdentity(step.after,owned,powershell);}
  assert.equal(out.steps.at(-1).after.nodes.find(node=>node.title==='OwnedValue').value,text);
  assert.equal((await stateAt(statePath,state=>state.value===text)).value,text);
 });
 await t.test('ScrollPattern increment and decrement change the measured owned viewport offset',async()=>{
  const before=await stateAt(statePath);
  const increment=(await ctx.call('capture_native_ui_scenario',{...identity,screenshot:false,accessibility:true,max_nodes:200,steps:[{kind:'scroll',path:scroll.path,direction:'increment'},{kind:'wait',milliseconds:200}]})).normalized_result;
  for(const step of increment.steps){assert.equal(step.outcome,'completed',step.reason??'');assertIdentity(step.after,owned,powershell);}
  const advanced=await stateAt(statePath,state=>state.vertical_offset>before.vertical_offset);assert.ok(advanced.vertical_offset>before.vertical_offset);assert.ok(increment.steps.at(-1).after.nodes.some(node=>node.title===`Owned offset ${advanced.vertical_offset}`));
  const decrement=(await ctx.call('capture_native_ui_scenario',{...identity,screenshot:false,accessibility:true,max_nodes:200,steps:[{kind:'scroll',path:scroll.path,direction:'decrement'},{kind:'wait',milliseconds:200}]})).normalized_result;
  for(const step of decrement.steps){assert.equal(step.outcome,'completed',step.reason??'');assertIdentity(step.after,owned,powershell);}
  const returned=await stateAt(statePath,state=>state.vertical_offset<advanced.vertical_offset);assert.ok(returned.vertical_offset>=0);assert.ok(decrement.steps.at(-1).after.nodes.some(node=>node.title===`Owned offset ${returned.vertical_offset}`));
 });
 await t.test('PrintWindow records observed PNG dimensions or explicit gaps without asserting pixel fidelity',async()=>{
  const out=(await ctx.call('observe_native_ui',{...identity,screenshot:true,accessibility:false,max_nodes:200})).normalized_result;
  assertIdentity(out.initial,owned,powershell);assert.equal(out.initial.nodes.length,0);assert.equal(out.target_sha256,targetHash);
  const image=out.initial.screenshot;
  if(image){const bytes=Buffer.from(image.base64,'base64');assert.equal(image.mime_type,'image/png');assert.deepEqual(bytes.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));assert.equal(image.sha256,digest(bytes));assert.equal(bytes.readUInt32BE(16),image.width);assert.equal(bytes.readUInt32BE(20),image.height);assert.ok(image.width>0&&image.height>0&&image.width*image.height<=16000000);}
  else assert.ok(out.initial.gaps.some(gap=>/PrintWindow|pixels/i.test(gap)),'An unavailable image requires the observed capture gap');
  assert.ok(out.limitations.some(limit=>/accelerated or protected pixels/i.test(limit)));
  t.diagnostic(JSON.stringify({capture_state:image?'png-observed':'unavailable',width:image?.width??null,height:image?.height??null,gaps:out.initial.gaps,pixel_fidelity:'not-established',owned_window_dip_dimensions:{width:owned.width,height:owned.height}}));
 });
 assert.equal(digest(await readFile(source)),sourceHash);assert.equal(digest(await readFile(powershell)),targetHash);
 for(const record of ctx.ledger.values()){assert.equal(record.parameters.pid,owned.pid);assert.equal(record.parameters.window_id,owned.window_id);assert.equal(record.subject.local_path.toLowerCase(),powershell.toLowerCase());}
});
