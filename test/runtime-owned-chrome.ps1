param([ValidateSet('capture','exited','force')][string]$Mode,[int]$OwnerPid,[string]$OwnerExecutable,[string]$ChromeExecutable,[string]$Profile,[string]$IdentityJson)
$ErrorActionPreference='Stop'
if($Mode -eq 'capture'){
 $owner=[Diagnostics.Process]::GetProcessById($OwnerPid)
 $null=$owner.Handle
 try{
  if($owner.MainModule.FileName -ine $OwnerExecutable){throw 'Owned fixture parent executable mismatch.'}
  $pattern='(?:^|\s)"?--user-data-dir='+[regex]::Escape($Profile)+'"?(?:\s|$)'
  $matches=@(Get-CimInstance Win32_Process -Filter "ParentProcessId=$OwnerPid"|Where-Object {$_.ExecutablePath -ieq $ChromeExecutable -and [regex]::IsMatch($_.CommandLine,$pattern,[Text.RegularExpressions.RegexOptions]::IgnoreCase)})
  if($matches.Count -ne 1){throw 'Owned fixture Chrome identity is not unique.'}
  $root=[Diagnostics.Process]::GetProcessById([int]$matches[0].ProcessId)
  $null=$root.Handle
  try{@{pid=$root.Id;parent_pid=$OwnerPid;creation=$root.StartTime.ToUniversalTime().ToString('o');executable=$root.MainModule.FileName;profile=$Profile;owner_creation=$owner.StartTime.ToUniversalTime().ToString('o');owner_executable=$owner.MainModule.FileName}|ConvertTo-Json -Compress}finally{$root.Dispose()}
 }finally{$owner.Dispose()}
}elseif($Mode -eq 'exited'){
 $expected=$IdentityJson|ConvertFrom-Json
 try{$root=[Diagnostics.Process]::GetProcessById([int]$expected.pid);$null=$root.Handle}catch [ArgumentException]{@{exited=$true}|ConvertTo-Json -Compress;exit 0}
 try{
  if($root.HasExited){@{exited=$true}|ConvertTo-Json -Compress}
  elseif($root.StartTime.ToUniversalTime().ToString('o') -cne $expected.creation){@{exited=$true}|ConvertTo-Json -Compress}
  elseif($root.MainModule.FileName -cne $expected.executable){throw 'Owned Chrome executable changed while the original root remained live; exit is unconfirmed.'}
  else{@{exited=$false}|ConvertTo-Json -Compress}
 }finally{$root.Dispose()}
}else{
 $expected=$IdentityJson|ConvertFrom-Json
 $owner=[Diagnostics.Process]::GetProcessById([int]$expected.parent_pid);$null=$owner.Handle
 try{
  if($owner.StartTime.ToUniversalTime().ToString('o') -cne $expected.owner_creation -or $owner.MainModule.FileName -cne $expected.owner_executable){throw 'Owned fixture parent identity changed; forced cleanup refused.'}
  try{$root=[Diagnostics.Process]::GetProcessById([int]$expected.pid);$null=$root.Handle}catch [ArgumentException]{@{exited=$true;forced=$false}|ConvertTo-Json -Compress;exit 0}
  try{
   if($root.HasExited){@{exited=$true;forced=$false}|ConvertTo-Json -Compress;exit 0}
   if($root.StartTime.ToUniversalTime().ToString('o') -cne $expected.creation -or $root.MainModule.FileName -cne $expected.executable){throw 'Owned Chrome root identity changed; forced cleanup refused.'}
   $record=Get-CimInstance Win32_Process -Filter "ProcessId=$($expected.pid)"
   $pattern='(?:^|\s)"?--user-data-dir='+[regex]::Escape($expected.profile)+'"?(?:\s|$)'
   if($null -eq $record -or $record.ParentProcessId -ne $expected.parent_pid -or -not [regex]::IsMatch($record.CommandLine,$pattern,[Text.RegularExpressions.RegexOptions]::IgnoreCase)){throw 'Owned Chrome parent/profile scope changed; forced cleanup refused.'}
   $root.Kill()
   if(-not $root.WaitForExit(5000)){throw 'Owned Chrome forced exit is unconfirmed.'}
   @{exited=$true;forced=$true}|ConvertTo-Json -Compress
  }finally{$root.Dispose()}
 }finally{$owner.Dispose()}
}
