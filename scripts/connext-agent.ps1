$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$projectRoot=Split-Path $PSScriptRoot -Parent
$settings=@{}
foreach($line in [IO.File]::ReadAllLines((Join-Path $projectRoot '.env.production.local'))){if($line -match '^([A-Z0-9_]+)=(.*)$'){$settings[$Matches[1]]=$Matches[2].Trim().Trim('"')}}
$agentSecret=$settings['CONNEXT_AGENT_SECRET']
if(-not $agentSecret -or $agentSecret.Length -lt 32){throw 'Missing CONNEXT_AGENT_SECRET'}
$endpoint='https://sawaddikanthali.vercel.app/api/connext'
$listener=[Windows.UI.Notifications.Management.UserNotificationListener,Windows.UI.Notifications,ContentType=WindowsRuntime]::Current
if($listener.GetAccessStatus().ToString() -ne 'Allowed'){throw 'Windows notification permission required'}
$notificationType=[Windows.UI.Notifications.UserNotification,Windows.UI.Notifications,ContentType=WindowsRuntime]
$resultType=[System.Collections.Generic.IReadOnlyList``1].MakeGenericType($notificationType)
$method=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {$_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1} | Select-Object -First 1
function Read-Notifications {
 $op=$listener.GetNotificationsAsync([Windows.UI.Notifications.NotificationKinds,Windows.UI.Notifications,ContentType=WindowsRuntime]::Toast)
 $task=$method.MakeGenericMethod($resultType).Invoke($null,@($op));$task.Wait();return $task.Result
}
function Send-Event($text){
 $payload=@{sentAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}
 if($text){$payload['text']=$text}
 $bytes=[Text.Encoding]::UTF8.GetBytes(($payload|ConvertTo-Json -Compress))
 $hmac=[Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($agentSecret))
 try{$signature=([BitConverter]::ToString($hmac.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$hmac.Dispose()}
 return Invoke-RestMethod -Uri $endpoint -Method Post -Body $bytes -ContentType 'application/json; charset=utf-8' -Headers @{'x-connext-signature'=$signature} -TimeoutSec 15
}
$seen=[Collections.Generic.HashSet[string]]::new()
# Historical notifications never become fresh deposits when the process starts.
foreach($item in (Read-Notifications)){[void]$seen.Add([string]$item.Id+':'+$item.CreationTime.ToString())}
$lastHeartbeat=[DateTime]::MinValue
Write-Output 'Connext agent started. Historical notifications ignored.'
while($true){
 try{
  if($listener.GetAccessStatus().ToString() -ne 'Allowed'){throw 'Notification permission revoked'}
  $items=Read-Notifications
  if(([DateTime]::UtcNow-$lastHeartbeat).TotalSeconds -gt 15){Send-Event $null | Out-Null;$lastHeartbeat=[DateTime]::UtcNow}
  foreach($item in $items){
   $id=[string]$item.Id+':'+$item.CreationTime.ToString()
   if($seen.Contains($id)){continue}
   if(([DateTimeOffset]::UtcNow-$item.CreationTime).TotalSeconds -gt 180){[void]$seen.Add($id);continue}
   if($item.AppInfo.DisplayInfo.DisplayName -ne 'LINE'){[void]$seen.Add($id);continue}
   $binding=$item.Notification.Visual.GetBinding('ToastGeneric')
   if(-not $binding){[void]$seen.Add($id);continue}
   $texts=@($binding.GetTextElements() | ForEach-Object Text)
   if($texts.Count -lt 2 -or $texts[0] -cne 'Krungthai Connext'){[void]$seen.Add($id);continue}
   try{Send-Event (($texts|Select-Object -Skip 1) -join ' ') | Out-Null;[void]$seen.Add($id);Write-Output 'Connext event accepted.'}
   catch{$status=0;if($_.Exception.Response){$status=[int]$_.Exception.Response.StatusCode};if($status -in @(400,409)){[void]$seen.Add($id);Write-Output ('Connext event rejected; no credit. HTTP='+$status)}else{Write-Output ('Connext delivery failed; retry pending. HTTP='+$status)}}
  }
 }catch{Write-Output 'Connext listener offline; retrying.'}
 Start-Sleep -Seconds 2
}
