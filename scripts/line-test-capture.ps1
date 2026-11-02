param([Parameter(Mandatory=$true)][ValidatePattern('^[a-zA-Z0-9-]{1,40}$')][string]$RunId,[int]$Seconds=180)
# TEST ONLY: no production URL, credential, financial API or wallet access.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$listener=[Windows.UI.Notifications.Management.UserNotificationListener,Windows.UI.Notifications,ContentType=WindowsRuntime]::Current
if($listener.GetAccessStatus().ToString() -ne 'Allowed'){throw 'Notification access required'}
$kind=[Windows.UI.Notifications.NotificationKinds,Windows.UI.Notifications,ContentType=WindowsRuntime]::Toast
$itemType=[Windows.UI.Notifications.UserNotification,Windows.UI.Notifications,ContentType=WindowsRuntime]
$resultType=[System.Collections.Generic.IReadOnlyList``1].MakeGenericType($itemType)
$method=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {$_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1} | Select-Object -First 1
$found=[Collections.Generic.HashSet[int]]::new()
$started=[DateTimeOffset]::UtcNow
$root=Split-Path $PSScriptRoot -Parent
$destination=Join-Path $root ('.cache/line-test-'+$RunId+'.json')
while(([DateTimeOffset]::UtcNow-$started).TotalSeconds -lt $Seconds){
 $task=$method.MakeGenericMethod($resultType).Invoke($null,@($listener.GetNotificationsAsync($kind)));$task.Wait()
 foreach($item in $task.Result){
  if($item.AppInfo.DisplayInfo.DisplayName -ne 'LINE' -or $item.CreationTime -lt $started){continue}
  $binding=$item.Notification.Visual.GetBinding('ToastGeneric');if(-not $binding){continue}
  $texts=@($binding.GetTextElements() | ForEach-Object Text)
  if($texts.Count -lt 2 -or $texts[0] -cne 'Canteen Test Bot'){continue}
  $pattern='CANTEEN_TEST '+[regex]::Escape($RunId)+' (\d{2})/50'
  foreach($match in [regex]::Matches(($texts -join ' '),$pattern)){[void]$found.Add([int]$match.Groups[1].Value)}
 }
 $report=@{run=$RunId;expected=50;captured=$found.Count;ids=@($found|Sort-Object);financialEffect='NONE';updatedAt=[DateTimeOffset]::UtcNow.ToString('o')}
 [IO.File]::WriteAllText($destination,($report|ConvertTo-Json -Depth 4))
 if($found.Count -eq 50){break}
 Start-Sleep -Milliseconds 200
}
Write-Output ('Captured '+$found.Count+'/50 test notifications. No wallet credited.')
