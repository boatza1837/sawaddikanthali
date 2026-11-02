# Read-only diagnostic: emits only LINE notifications mentioning Connext.
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$listener=[Windows.UI.Notifications.Management.UserNotificationListener,Windows.UI.Notifications,ContentType=WindowsRuntime]::Current
if($listener.GetAccessStatus().ToString() -ne 'Allowed'){throw 'Notification access is not allowed'}
$notificationType=[Windows.UI.Notifications.UserNotification,Windows.UI.Notifications,ContentType=WindowsRuntime]
$resultType=[System.Collections.Generic.IReadOnlyList``1].MakeGenericType($notificationType)
$operation=$listener.GetNotificationsAsync([Windows.UI.Notifications.NotificationKinds,Windows.UI.Notifications,ContentType=WindowsRuntime]::Toast)
$method=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {$_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1} | Select-Object -First 1
$task=$method.MakeGenericMethod($resultType).Invoke($null,@($operation))
$task.Wait()
$items=$task.Result
Write-Output ('NOTIFICATION_COUNT='+@($items).Length)
foreach($item in $items){
 Write-Output ('APP_NAME='+$item.AppInfo.DisplayInfo.DisplayName)
 if($item.AppInfo.DisplayInfo.DisplayName -match '(?i)LINE'){
  Write-Output ('LINE_NOTIFICATION_FOUND='+$item.Id)
  $binding=$item.Notification.Visual.GetBinding('ToastGeneric')
  if($binding){
   $text=($binding.GetTextElements() | ForEach-Object Text) -join ' | '
   if($text -match '(?i)krungthai|connext'){Write-Output $text}
  }
 }
}
