# Controlled test only. Capability/code remain in process memory; only the approved mailbox is used.
[CmdletBinding()]
param([ValidateSet('request','confirm')][string]$Action='request',
  [ValidateSet('production','activation')][string]$TestRun='production')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$statePath=Join-Path $env:USERPROFILE ('Nestora-Backups/order-email-rehearsal/controlled-order-'+$TestRun+'.dpapi')
$bytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($statePath),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
try{$state=[Text.Encoding]::UTF8.GetString($bytes)|ConvertFrom-Json}finally{[Array]::Clear($bytes,0,$bytes.Length)}
$target=[string]$state.result.order_id
if($target -notmatch '^[a-f0-9-]{36}$' -or
  ($TestRun -eq 'production' -and $target -ne '26e79cb5-6f12-4bb1-ae35-08d095c73e97') -or
  $state.payload.p_shipping_address.email -ne 'info@nestorahomelb.com' -or
  $state.payload.p_shipping_address.street_address -ne 'TEST ONLY - DO NOT PICK, PACK, SHIP OR FULFILL'){
  throw 'Approved controlled order required.'
}
$source=Get-Content -LiteralPath (Join-Path $PSScriptRoot '../../../src/environments/environment.prod.ts') -Raw
$key=[regex]::Match($source,"supabaseAnonKey:\s*'([^']+)'").Groups[1].Value
$headers=@{apikey=$key;Authorization=('Bearer '+$key);Origin='https://nestorahomelb.com'}
$body=@{orderId=$target;checkoutToken=$state.payload.p_checkout_token;action=$Action}
if($Action -eq 'confirm'){
  # A known-code test fixture is installed ONLY for this owner-approved canary.
  # Issuance/SMTP is tested separately; this tests the deployed confirm-to-release path.
  # No production API offers this ability and normal recipients are never affected.
  $number=[Security.Cryptography.RandomNumberGenerator]::GetInt32(0,100000000)
  $code=$number.ToString('D8')
  $digest=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($target+':'+$code))).ToLowerInvariant()
  $query=@"
begin;
do `$$ begin
 if not exists(select 1 from nestora_order_email.settings where mode='production' and enabled and send_enabled
   and (production_canary_order_id='$target' or ('$TestRun'='activation' and production_canary_order_id is null)))
   or not exists(select 1 from public.order_shipping_addresses where order_id='$target' and email='info@nestorahomelb.com'
     and street_address='TEST ONLY - DO NOT PICK, PACK, SHIP OR FULFILL' and postal_code='TEST-NO-DELIVERY')
   then raise exception 'Business canary required'; end if;
end `$$;
update nestora_order_email.verifications set code_hash='$digest',expires_at=now()+interval '10 minutes'
 where order_id='$target' and verified_at is null;
commit;
"@
  $null=& (Join-Path $PSScriptRoot 'remote-query.ps1') -Sql $query
  $wrong=$body.Clone();$wrong.action='confirm';$wrong.code=(($number+1)%100000000).ToString('D8')
  try{
    $bad=Invoke-WebRequest -Uri 'https://ojismppptyrivnxnkcux.supabase.co/functions/v1/order-email-verification' -Method Post -Headers $headers -ContentType 'application/json' -Body ($wrong|ConvertTo-Json -Compress) -SkipHttpErrorCheck
  }catch{throw 'Controlled incorrect-code request failed; private diagnostics suppressed.'}
  if($bad.StatusCode -ne 400){throw 'Incorrect code was not rejected.'}
  $body.code=$code
}
try{
  $response=Invoke-WebRequest -Uri 'https://ojismppptyrivnxnkcux.supabase.co/functions/v1/order-email-verification' -Method Post -Headers $headers -ContentType 'application/json' -Body ($body|ConvertTo-Json -Compress) -SkipHttpErrorCheck -TimeoutSec 90
}catch{throw 'Controlled verification HTTP failed; private diagnostics suppressed.'}
if($response.StatusCode -ne 200){throw ('Controlled verification failed, HTTP '+$response.StatusCode+'; private diagnostics suppressed.')}
$result=$response.Content|ConvertFrom-Json
if($Action -eq 'confirm' -and $result.verified -ne $true){throw 'Controlled confirmation was not verified.'}
Write-Output ('PASS: controlled '+$Action+' endpoint returned success. Capability/code/SMTP diagnostics suppressed.')
$code=$null;$state=$null;$body=$null
