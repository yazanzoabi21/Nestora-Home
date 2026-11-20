# One real, owned-address, pickup/manual-COD test. No payment capture or delivery.
# Persist the SAME idempotency token privately before submitting; Replay never makes a new order.
param([switch]$Replay,[switch]$CheckLegacyUi)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$stateDir=Join-Path $env:USERPROFILE 'Nestora-Backups/order-email-rehearsal'
if(-not(Test-Path -LiteralPath $stateDir)){throw 'Existing private rehearsal directory required'}
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
$acl=Get-Acl -LiteralPath $stateDir
if(-not $acl.AreAccessRulesProtected){throw 'Private directory ACL required'}
foreach($rule in $acl.Access){
  if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($sid.Value,'S-1-5-18')){
    throw 'Unexpected private-directory reader'
  }
}
$statePath=Join-Path $stateDir 'controlled-order-no-otp.dpapi'
$repo=Resolve-Path (Join-Path $PSScriptRoot '../../../..')
$source=Get-Content (Join-Path $repo 'src/environments/environment.prod.ts') -Raw
$key=[regex]::Match($source,"supabaseAnonKey:\s*'([^']+)'").Groups[1].Value
if(-not $key){throw 'Publishable API key missing'}
$origin='https://ojismppptyrivnxnkcux.supabase.co'
$headers=@{apikey=$key}
function Save-State($State){
  $bytes=[Text.Encoding]::UTF8.GetBytes(($State|ConvertTo-Json -Depth 15))
  try{[IO.File]::WriteAllBytes($statePath,[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))}
  finally{[Array]::Clear($bytes,0,$bytes.Length)}
}
if(Test-Path -LiteralPath $statePath){
  $bytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($statePath),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  try{$state=[Text.Encoding]::UTF8.GetString($bytes)|ConvertFrom-Json}finally{[Array]::Clear($bytes,0,$bytes.Length)}
}else{
  if($Replay -or $CheckLegacyUi){throw 'Existing test state required'}
  $products=Invoke-RestMethod -Uri ($origin+'/rest/v1/products?select=id,price,sale_price,stock,product_variants(id)&is_active=eq.true&stock=gte.2&order=price.asc&limit=30') -Headers $headers
  $product=$products|Where-Object {@($_.product_variants).Count -eq 0}|Select-Object -First 1
  $shippingRows=Invoke-RestMethod -Uri ($origin+'/rest/v1/shipping_methods?select=id,code,base_cost&is_active=eq.true&code=eq.pickup_store') -Headers $headers
  $shipping=$shippingRows|Select-Object -First 1
  $paymentRows=Invoke-RestMethod -Uri ($origin+'/rest/v1/payment_methods?select=id,code,type,provider&is_active=eq.true&code=eq.cod') -Headers $headers
  $payment=$paymentRows|Where-Object {$_.type -eq 'manual' -and $_.provider -eq 'Manual'}|Select-Object -First 1
  if(-not $product -or -not $shipping -or -not $payment){throw ('Reviewed inputs unavailable; product='+[bool]$product+' pickup='+[bool]$shipping+' COD='+[bool]$payment)}
  $price=if($product.sale_price -gt 0 -and $product.sale_price -lt $product.price){$product.sale_price}else{$product.price}
  $payload=@{p_checkout_token=[Guid]::NewGuid().ToString();p_cart_id=$null;p_shipping_method_id=$shipping.id;p_payment_method_id=$payment.id;
    p_discount_id=$null;p_discount_code=$null;p_expected_subtotal=$price;
    p_items=@(@{product_id=$product.id;variant_id=$null;quantity=1});
    p_shipping_address=@{first_name='Nestora';last_name='NO OTP EMAIL TEST';email='info@nestorahomelb.com';phone=$null;
      street_address='TEST ONLY - DO NOT FULFILL OR SHIP';address_line_2=$null;city='No delivery';state_province='Lebanon';
      postal_code='TEST-NO-DELIVERY';country='Lebanon';delivery_instructions='Owned email workflow test. Do not fulfill, ship or charge.'};
    p_customer_notes='AUTHORIZED NO-OTP EMAIL TEST ONLY - DO NOT FULFILL, SHIP OR CHARGE. Preserve this record.';
    p_redeem_product_ids=@();p_redeem_variant_ids=@();p_free_gift_product_ids=@()}
  $state=[pscustomobject]@{payload=$payload;result=$null}; Save-State $state
}
if($state.payload.p_shipping_address.email -ne 'info@nestorahomelb.com' -or
  $state.payload.p_customer_notes -notmatch 'AUTHORIZED NO-OTP EMAIL TEST ONLY'){throw 'Owned test scope mismatch'}
if($CheckLegacyUi){
  if(-not $state.result){throw 'Completed owned order required'}
  $body=@{orderId=$state.result.order_id;checkoutToken=$state.payload.p_checkout_token;action='request'}|ConvertTo-Json
  $result=Invoke-RestMethod -Uri ($origin+'/functions/v1/order-email-verification') -Method Post -Headers $headers -ContentType 'application/json' -Body $body
  Write-Output ('Legacy UI automatically completed without OTP: '+($result.verified -eq $true))
  exit
}
if(-not $state.result -or $Replay){
  $result=Invoke-RestMethod -Uri ($origin+'/rest/v1/rpc/place_customer_order') -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ($state.payload|ConvertTo-Json -Depth 15)
  if($state.result -and $state.result.order_id -ne $result.order_id){throw 'Replay returned a different order'}
  $state.result=$result; Save-State $state
}
$state.result|Select-Object order_id,order_number,total,status,payment_status|ConvertTo-Json
