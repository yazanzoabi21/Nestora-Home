# Authorized server-side configuration. No plaintext credential file, argument or output.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$cli='C:\Users\yzoabi\AppData\Local\npm-cache\_npx\aa8e5c70f9d8d161\node_modules\@supabase\cli-windows-x64\bin\supabase.exe'
$project='ojismppptyrivnxnkcux'
function Read-CliJson([string[]]$Arguments) {
  $p=[Diagnostics.ProcessStartInfo]::new();$p.FileName=$cli;$p.UseShellExecute=$false;$p.CreateNoWindow=$true
  $p.RedirectStandardOutput=$true;$p.RedirectStandardError=$true
  foreach($arg in $Arguments){$p.ArgumentList.Add($arg)}
  $process=[Diagnostics.Process]::Start($p)
  try {
    $o=$process.StandardOutput.ReadToEndAsync();$e=$process.StandardError.ReadToEndAsync();$process.WaitForExit()
    $output=$o.GetAwaiter().GetResult();$null=$e.GetAwaiter().GetResult()
    if($process.ExitCode -ne 0){throw 'CLI operation failed; sensitive response suppressed.'}
    try{return ($output | ConvertFrom-Json -ErrorAction Stop)}catch{throw 'CLI JSON invalid; response suppressed.'}
  }finally{$process.Dispose()}
}
$keyResponse=Read-CliJson @('db','query',"--remote=$project",'--yes','--output','json',
  "select decrypted_secret as signing_key from vault.decrypted_secrets where name='ORDER_EMAIL_WEBHOOK_TOKEN';")
if(@($keyResponse.rows).Count -ne 1){throw 'Exactly one signing key required.'}
$key=[string]$keyResponse.rows[0].signing_key
if($key -notmatch '^[a-f0-9]{64}$'){throw 'Invalid signing key shape.'}
$pipeName='nestora-edge-secrets-'+[Guid]::NewGuid().ToString('N')
$options=[IO.Pipes.PipeOptions]::Asynchronous -bor [IO.Pipes.PipeOptions]::CurrentUserOnly
$pipe=[IO.Pipes.NamedPipeServerStream]::new($pipeName,[IO.Pipes.PipeDirection]::Out,1,
  [IO.Pipes.PipeTransmissionMode]::Byte,$options)
$process=$null
try {
  $connected=$pipe.WaitForConnectionAsync()
  $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$cli;$start.UseShellExecute=$false;$start.CreateNoWindow=$true
  $start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
  foreach($arg in @('secrets','set',"--remote=$project",'--env-file',"\\.\pipe\$pipeName",'--yes')){$start.ArgumentList.Add($arg)}
  $process=[Diagnostics.Process]::Start($start)
  $outTask=$process.StandardOutput.ReadToEndAsync();$errTask=$process.StandardError.ReadToEndAsync()
  if(-not $connected.Wait(30000)){throw 'CLI could not open the private memory pipe; no credential file fallback.'}
  $writer=[IO.StreamWriter]::new($pipe,[Text.UTF8Encoding]::new($false),1024,$true)
  try {
    $writer.WriteLine('ORDER_EMAIL_ENABLED=false')
    $writer.WriteLine('ORDER_EMAIL_SEND_ENABLED=false')
    $writer.WriteLine('ORDER_EMAIL_MODE=sandbox')
    $writer.WriteLine('ORDER_EMAIL_SITE_URL=https://nestorahomelb.com')
    $writer.WriteLine('ORDER_EMAIL_WEBHOOK_TOKEN='+$key)
    $writer.Flush()
  } finally {$writer.Dispose();$pipe.Dispose()}
  if(-not $process.WaitForExit(60000)){throw 'Secret configuration timeout.'}
  $null=$outTask.GetAwaiter().GetResult();$null=$errTask.GetAwaiter().GetResult()
  if($process.ExitCode -ne 0){throw 'Secret upload failed; native output suppressed.'}
  $entries=Read-CliJson @('secrets','list',"--remote=$project",'--output','json')
  $sha=[Security.Cryptography.SHA256]::Create()
  try {
    $expected=[Convert]::ToHexString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($key))).ToLowerInvariant()
    $entry=@($entries | Where-Object name -eq 'ORDER_EMAIL_WEBHOOK_TOKEN')
    if($entry.Count -ne 1 -or $entry[0].value -ne $expected){throw 'Signing key digest mismatch.'}
    foreach($name in @('ORDER_EMAIL_ENABLED','ORDER_EMAIL_SEND_ENABLED')) {
      $expected=[Convert]::ToHexString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes('false'))).ToLowerInvariant()
      $entry=@($entries | Where-Object name -eq $name)
      if($entry.Count -ne 1 -or $entry[0].value -ne $expected){throw 'Disabled gate read-back mismatch.'}
    }
  }finally{$sha.Dispose()}
  Write-Output 'PASS: signing key matched Vault via digest-only readback; both worker gates false. No plaintext file/argument/output.'
} finally {
  if($null -ne $process){if(-not $process.HasExited){$process.Kill()};$process.Dispose()}
  $pipe.Dispose();$key=$null;$keyResponse=$null
}
