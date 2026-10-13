param([ValidateSet('inspect','terminate','exited')][string]$Mode,[int]$WrapperPid,[string]$Executable,[string]$IdentityJson)
$ErrorActionPreference='Stop'
function Open-Process([int]$PidValue){$proc=[Diagnostics.Process]::GetProcessById($PidValue);try{$null=$proc.Handle;return $proc}catch{$proc.Dispose();throw}}
function Process-Record($Proc,[int]$ParentValue=-1){return @{pid=$Proc.Id;parent_pid=$ParentValue;creation=$Proc.StartTime.ToUniversalTime().ToString('o');executable=$Proc.MainModule.FileName}}
function Read-Identity([int]$PidValue,[int]$ParentValue=-1){$proc=Open-Process $PidValue;try{return @{record=(Process-Record $proc $ParentValue);process=$proc}}catch{$proc.Dispose();throw}}
function Root-Ended($Expected){
 try{$proc=Open-Process ([int]$Expected.root.pid)}catch [ArgumentException]{return $true}
 try{if($proc.HasExited){return $true};$record=Process-Record $proc;foreach($name in @('pid','creation','executable')){if($record[$name] -cne $Expected.root.$name){throw 'Owned Electron identity changed; original root exit is unconfirmed.'}};return $false}catch{if($proc.HasExited){return $true};throw}finally{$proc.Dispose()}
}
function No-Termination($Expected){@{terminated=$false;exited=$true;pid=[int]$Expected.root.pid}|ConvertTo-Json -Compress}
if($Mode -eq 'exited'){
 $expected=$IdentityJson|ConvertFrom-Json
 try{$root=Open-Process ([int]$expected.root.pid)}catch [ArgumentException]{@{exited=$true}|ConvertTo-Json -Compress;exit 0}
 try{if($root.HasExited -or $root.StartTime.ToUniversalTime().ToString('o') -cne $expected.root.creation){@{exited=$true}|ConvertTo-Json -Compress}elseif($root.MainModule.FileName -cne $expected.root.executable){throw 'Owned Electron executable changed while the original process remained live; exit is unconfirmed.'}else{@{exited=$false}|ConvertTo-Json -Compress}}catch{if($root.HasExited){@{exited=$true}|ConvertTo-Json -Compress}else{throw}}finally{$root.Dispose()}
}elseif($Mode -eq 'inspect'){
 $wrapper=Read-Identity $WrapperPid
 try{$candidate=$null;if($wrapper.record.executable -ieq $Executable){$candidate=$wrapper}else{$children=@(Get-CimInstance Win32_Process -Filter "ParentProcessId=$WrapperPid");foreach($child in $children){if($child.ExecutablePath -ieq $Executable){if($null -ne $candidate){throw 'Owned launcher has multiple matching application roots.'};$candidate=Read-Identity ([int]$child.ProcessId) ([int]$child.ParentProcessId)}}};if($null -eq $candidate){throw 'The owned launcher has no matching Electron executable child.'};try{@{wrapper=$wrapper.record;root=$candidate.record}|ConvertTo-Json -Compress -Depth 5}finally{if($candidate -ne $wrapper){$candidate.process.Dispose()}}}finally{$wrapper.process.Dispose()}
}else{
 $expected=$IdentityJson|ConvertFrom-Json
 try{$wrapper=Open-Process ([int]$expected.wrapper.pid)}catch [ArgumentException]{if(Root-Ended $expected){No-Termination $expected;exit 0};throw 'Owned launcher is absent while the original root remains live; termination refused.'}
 try{
  if($wrapper.HasExited){if(Root-Ended $expected){No-Termination $expected;exit 0};throw 'Owned launcher exited while the original root remains live; termination refused.'}
  try{$wrapperRecord=Process-Record $wrapper}catch{if($wrapper.HasExited -and (Root-Ended $expected)){No-Termination $expected;exit 0};throw}
  foreach($name in @('pid','creation','executable')){if($wrapperRecord[$name] -cne $expected.wrapper.$name){throw 'Owned launcher identity changed.'}}
  try{$root=Open-Process ([int]$expected.root.pid)}catch [ArgumentException]{No-Termination $expected;exit 0}
  try{
   if($root.HasExited){No-Termination $expected;exit 0}
   try{$rootRecord=Process-Record $root}catch{if($root.HasExited){No-Termination $expected;exit 0};throw}
   foreach($name in @('pid','creation','executable')){if($rootRecord[$name] -cne $expected.root.$name){throw 'Owned Electron identity changed.'}}
   if($rootRecord.executable -ine $Executable){throw 'Owned Electron executable mismatch.'}
   $rootCim=Get-CimInstance Win32_Process -Filter "ProcessId=$($expected.root.pid)"
   if($root.HasExited){No-Termination $expected;exit 0}
   if($wrapper.HasExited){throw 'Owned launcher exited while the original root remains live; termination refused.'}
   if($null -eq $rootCim){throw 'Owned Electron root lookup is unavailable while its pinned process remains live.'}
   if($rootRecord.pid -ne $wrapperRecord.pid -and $rootCim.ParentProcessId -ne $wrapperRecord.pid){throw 'Owned Electron lineage mismatch.'}
   try{$root.Kill()}catch{if($root.HasExited){No-Termination $expected;exit 0};throw}
   if(-not $root.WaitForExit(120000)){throw 'Owned Electron physical exit remained unconfirmed after the bounded 120000 ms wait; no second termination was attempted.'}
   @{terminated=$true;exited=$true;pid=$rootRecord.pid}|ConvertTo-Json -Compress
  }finally{$root.Dispose()}
 }finally{$wrapper.Dispose()}
}
