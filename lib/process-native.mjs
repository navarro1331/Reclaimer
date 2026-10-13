import { join, basename } from 'node:path';
import { sha, error } from './browser-cdp.mjs';

// Fixed helper code, with all caller data conveyed through one explicit request.
// UI Automation selects one HWND and validates its process before every snapshot.
const windowsHelper=String.raw`
$ErrorActionPreference = 'Stop'
$request = $env:REAL_NATIVE_UI_REQUEST | ConvertFrom-Json
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System; using System.Runtime.InteropServices;
public class RealWindowPixels {
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr dc, uint flags);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint process);
}
'@
$handle = [IntPtr]([Int64]$request.window_id)
$process = Get-Process -Id ([int]$request.pid)
$executable = $process.MainModule.FileName
$launch = ([DateTimeOffset]$process.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds() / 1000.0
$root = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
if ($root.Current.ProcessId -ne $request.pid) { throw 'Selected HWND does not belong to selected PID.' }
$nodes = [System.Collections.Generic.List[object]]::new()
$gaps = [System.Collections.Generic.List[string]]::new()
$script:truncated = $false
$maximum = if ($null -ne $request.max_nodes) { [Math]::Min(10000, [int]$request.max_nodes) } else { 1000 }
function Children($element) {
 $children = [System.Collections.Generic.List[object]]::new()
 $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
 $child = $walker.GetFirstChild($element)
 while ($null -ne $child) { $children.Add($child); $child = $walker.GetNextSibling($child) }
 return ,$children.ToArray()
}
function Visit($element, [int[]]$path, [int]$depth) {
 if ($nodes.Count -ge $maximum -or $depth -ge 32) { $script:truncated = $true; return }
 $children = Children $element
 $actions = [System.Collections.Generic.List[string]]::new()
 $value = $null
 foreach ($pattern in $element.GetSupportedPatterns()) {
  if ($pattern.Id -eq [System.Windows.Automation.InvokePattern]::Pattern.Id) { $actions.Add('click') }
  if ($pattern.Id -eq [System.Windows.Automation.ScrollPattern]::Pattern.Id) { $actions.Add('scroll') }
  if ($pattern.Id -eq [System.Windows.Automation.TogglePattern]::Pattern.Id) {
   if (-not $actions.Contains('click')) { $actions.Add('click') }
   $value = $element.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern).Current.ToggleState.ToString()
  }
  if ($pattern.Id -eq [System.Windows.Automation.SelectionItemPattern]::Pattern.Id) {
   if (-not $actions.Contains('click')) { $actions.Add('click') }
   $value = if ($element.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Current.IsSelected) { 'selected' } else { 'not-selected' }
  }
  if ($pattern.Id -eq [System.Windows.Automation.ValuePattern]::Pattern.Id) {
   $actions.Add('key-entry')
   if (-not $element.Current.IsPassword) { $value = $element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value }
  }
 }
 $nodes.Add([ordered]@{ path = @($path); role = $element.Current.ControlType.ProgrammaticName; title = $element.Current.Name; value = $value; actions = @($actions.ToArray()); children_count = $children.Count })
 for ($index = 0; $index -lt $children.Count; $index++) { Visit $children[$index] ([int[]](@($path) + @($index))) ($depth + 1) }
}
function Snapshot {
 $owner = [uint32]0
 [void][RealWindowPixels]::GetWindowThreadProcessId($handle, [ref]$owner)
 if ($owner -ne $request.pid) { throw 'Window ownership changed during capture.' }
 $current = Get-Process -Id ([int]$request.pid)
 if ($current.StartTime.ToUniversalTime() -ne $process.StartTime.ToUniversalTime()) { throw 'Process launch identity changed during capture.' }
 $nodes.Clear(); $gaps.Clear(); $script:truncated = $false
 if ($request.accessibility -ne $false) { Visit $root ([int[]]@()) 0 }
 $image = $null
 if ($request.screenshot -ne $false) {
  $rect = $root.Current.BoundingRectangle
  if ($rect.Width -gt 0 -and $rect.Height -gt 0 -and $rect.Width * $rect.Height -le 16000000) {
   $bitmap = [System.Drawing.Bitmap]::new([int]$rect.Width,[int]$rect.Height)
   $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
   $dc = $graphics.GetHdc()
   try { $captured = [RealWindowPixels]::PrintWindow($handle, $dc, 2) } finally { $graphics.ReleaseHdc($dc); $graphics.Dispose() }
   if ($captured) {
    $stream = [System.IO.MemoryStream]::new()
    try { $bitmap.Save($stream,[System.Drawing.Imaging.ImageFormat]::Png); $bytes = $stream.ToArray(); $hash = [System.Security.Cryptography.SHA256]::Create(); $digest = [BitConverter]::ToString($hash.ComputeHash($bytes)).Replace('-','').ToLowerInvariant(); $hash.Dispose(); $image = [ordered]@{mime_type='image/png';base64=[Convert]::ToBase64String($bytes);sha256=$digest;width=$bitmap.Width;height=$bitmap.Height} } finally { $stream.Dispose() }
   } else { $gaps.Add('PrintWindow did not expose selected window pixels.') }
   $bitmap.Dispose()
  } else { $gaps.Add('Window pixels unavailable or exceed sixteen million pixels.') }
 }
 return [ordered]@{window=[ordered]@{pid=[int]$request.pid;window_id=[int64]$request.window_id;executable=$executable;launch_time=$launch;title=$root.Current.Name};nodes=@($nodes.ToArray());truncated=$script:truncated;screenshot=$image;gaps=@($gaps.ToArray())}
}
function SelectElement([int[]]$path) { $element = $root; foreach ($index in $path) { $children = Children $element; if ($index -ge $children.Count) { throw 'Selected accessibility path no longer exists.' }; $element = $children[$index] }; return $element }
$initial = Snapshot
$last = $initial
$steps = [System.Collections.Generic.List[object]]::new()
foreach ($step in $request.steps) {
 $before = $last; $after = $null; $outcome = 'completed'; $reason = $null
 try {
  if ($step.kind -eq 'wait') { Start-Sleep -Milliseconds ([Math]::Min(30000, [int]$step.milliseconds)) }
  else { $element = SelectElement ([int[]]$step.path)
   if ($step.kind -eq 'click') {
    $actionPattern = $null
    if ($element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$actionPattern)) { $actionPattern.Invoke() }
    elseif ($element.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$actionPattern)) { $actionPattern.Toggle() }
    elseif ($element.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$actionPattern)) { $actionPattern.Select() }
    else { throw 'The selected control exposes no supported Invoke, Toggle or SelectionItem pattern.' }
   }
   elseif ($step.kind -eq 'key-entry') { $element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue([string]$step.text) }
   elseif ($step.kind -eq 'scroll') { $amount = if ($step.direction -eq 'increment') { [System.Windows.Automation.ScrollAmount]::SmallIncrement } else { [System.Windows.Automation.ScrollAmount]::SmallDecrement }; $element.GetCurrentPattern([System.Windows.Automation.ScrollPattern]::Pattern).Scroll([System.Windows.Automation.ScrollAmount]::NoAmount,$amount) }
  }
  $after = Snapshot; $last = $after
 } catch { $outcome = 'failed'; $reason = $_.Exception.Message }
 $steps.Add([ordered]@{index=$steps.Count;kind=$step.kind;before=$before;after=$after;outcome=$outcome;reason=$reason})
 if ($outcome -ne 'completed') { break }
}
[ordered]@{executable=$executable;initial=$initial;steps=@($steps.ToArray())} | ConvertTo-Json -Depth 100 -Compress
`;
export async function nativeUi(args,ctx,scenario=false){const op=scenario?'capture_native_ui_scenario':'observe_native_ui';if(process.platform!=='win32')return ctx.unavailable(op,'This independent UI Automation adapter requires Windows.','Run on Windows with UIAutomationClient and the explicitly selected PID/HWND; other host adapters remain a parity gap.');const executable=join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');let result;try{const reply=await ctx.run([executable,'-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(windowsHelper,'utf16le').toString('base64')],{timeout:Math.min(60000,30000+(args.steps??[]).reduce((n,s)=>n+(s.milliseconds??0),0)),env:{SystemRoot:process.env.SystemRoot??'C:\\Windows',REAL_NATIVE_UI_REQUEST:JSON.stringify(args)}});result=JSON.parse(reply.stdout);}catch(cause){if(ctx.signal?.aborted)throw cause;throw error('NATIVE_UI_HELPER_FAILED','The selected window could not be inspected by the Windows UI Automation helper.','Verify the exact PID/HWND, matching launch identity, same interactive session, and UI Automation permissions.');}const hash=sha(await ctx.read(result.executable));const normalized={target_sha256:hash,initial:result.initial,steps:result.steps,restore:'leave-as-is',limitations:['The caller-selected HWND is checked against the PID and launch time at each snapshot.','Accessibility paths index the current control tree and may change after actions.','PrintWindow can omit accelerated or protected pixels; reported gaps preserve that uncertainty.']};return ctx.evidence(op,args,normalized,{subject:{name:basename(result.executable),digest:{sha256:hash},format:'file',architecture:null,local_path:result.executable},provider:{id:'real-windows-uia',name:'Independent Windows UI Automation helper',version:'1'},authority:scenario?'controlled-replay':'external-service',confidence:'observed',limitations:normalized.limitations});}
export const nativeHandlers={observe_native_ui:(a,c)=>nativeUi(a,c),capture_native_ui_scenario:(a,c)=>nativeUi(a,c,true)};
