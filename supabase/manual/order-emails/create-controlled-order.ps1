# Authorized ONE guest checkout, using real catalog/server pricing, pickup and manual COD.
# No test products, payment capture, real delivery or direct order-table inserts.
param([switch]$VerifyReplay,[ValidateSet('sandbox','production','activation')][string]$TestRun='sandbox')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$origin='https://ojismppptyrivnxnkcux.supabase.co'
$stateDir=Join-Path $env:USERPROFILE 'Nestora-Backups\order-email-rehearsal'
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
if(-not(Test-Path -LiteralPath $stateDir)){
  $null=New-Item -ItemType Directory -Path $stateDir
  $acl=Get-Acl -LiteralPath $stateDir;$acl.SetAccessRuleProtection($true,$false);$acl.SetOwner($sid)
  foreach($principal in @($sid,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($principal,'FullControl','ContainerInherit, ObjectInherit','None','Allow'))
  }
  Set-Acl -LiteralPath $stateDir -AclObject $acl
}else{
  $acl=Get-Acl -LiteralPath $stateDir
  if(-not $acl.AreAccessRulesProtected){throw 'Existing rehearsal directory is not private.'}
  foreach($rule in $acl.Access){
    if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($sid.Value,'S-1-5-18')){
      throw 'Unexpected rehearsal-directory reader.'
    }
  }
}
$stateFile=switch($TestRun){'production'{'controlled-order-production.dpapi'} 'activation'{'controlled-order-activation.dpapi'} default{'controlled-order.dpapi'}}
$statePath=Join-Path $stateDir $stateFile
$source=Get-Content -LiteralPath (Join-Path $PSScriptRoot '../../../src/environments/environment.prod.ts') -Raw
$key=[regex]::Match($source,"supabaseAnonKey:\s*'([^']+)'").Groups[1].Value
if(-not $key){throw 'Public checkout client key missing.'}
$headers=@{apikey=$key;Authorization=('Bearer '+$key)}
function Read-Api([string]$Path){$value=Invoke-RestMethod -Uri ($origin+'/rest/v1/'+$Path) -Headers $headers -TimeoutSec 30;return $value}
function Save-State([psobject]$State){
  $bytes=[Text.Encoding]::UTF8.GetBytes(($State | ConvertTo-Json -Depth 12))
  try{[IO.File]::WriteAllBytes($statePath,[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))}
  finally{[Array]::Clear($bytes,0,$bytes.Length)}
}
if(Test-Path -LiteralPath $statePath){
  $bytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($statePath),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  try{$state=[Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json}finally{[Array]::Clear($bytes,0,$bytes.Length)}
  if($state.result){
    if($VerifyReplay){
      if(($TestRun -eq 'sandbox' -and $state.result.order_id -ne '39bd4663-80ef-4486-9c03-055b3726bfed') -or
        $state.payload.p_shipping_address.email -ne 'info@nestorahomelb.com'){
        throw 'Replay restricted to the approved rehearsal order.'
      }
      try{
        $replay=Invoke-RestMethod -Uri ($origin+'/rest/v1/rpc/place_customer_order') -Method POST -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ($state.payload | ConvertTo-Json -Depth 12) -TimeoutSec 30
      }catch{throw 'Public checkout replay failed; response suppressed.'}
      if($replay.order_id -ne $state.result.order_id -or $replay.total -ne $state.result.total){throw 'Checkout replay mismatch.'}
      Write-Output 'PASS: public guest checkout replay returned the same approved order and total.'
    }else{$state.result | ConvertTo-Json -Depth 5}
    exit 0
  }
}else{
  if($VerifyReplay){throw 'Existing approved rehearsal state required; no new order will be created.'}
  $products=@(Read-Api 'products?select=id,price,sale_price,stock,product_variants(id)&is_active=eq.true&stock=gte.2&order=price.asc&limit=30')
  $normal=$products | Where-Object {@($_.product_variants).Count -eq 0} | Select-Object -First 1
  $variants=@(Read-Api 'product_variants?select=id,product_id,price,sale_price,stock,attributes,products!inner(is_active)&is_active=eq.true&stock=gt.0&products.is_active=eq.true&order=price.asc&limit=20')
  $variant=$variants | Where-Object {@($_.attributes.PSObject.Properties).Count -gt 0} | Select-Object -First 1
  $payment=@(Read-Api 'payment_methods?select=id,code,provider,type&is_active=eq.true&code=eq.cod') | Where-Object {$_.type -eq 'manual' -and $_.provider -eq 'Manual'} | Select-Object -First 1
  $shipping=@(Read-Api 'shipping_methods?select=id,code,base_cost&is_active=eq.true&code=eq.pickup_store') | Select-Object -First 1
  $discount=@(Read-Api 'discounts?select=id,code,discount_type,discount_value,minimum_order_amount,applies_to&is_active=eq.true&discount_type=eq.percentage&minimum_order_amount=eq.0') | Select-Object -First 1
  if(-not $normal -or -not $variant -or -not $payment -or -not $shipping -or -not $discount){
    throw ('Reviewed checkout inputs unavailable: normal={0},variant={1},payment={2},shipping={3},discount={4}; no order submitted.' -f [bool]$normal,[bool]$variant,[bool]$payment,[bool]$shipping,[bool]$discount)
  }
  $normalPrice=if($null -ne $normal.sale_price -and $normal.sale_price -gt 0 -and $normal.sale_price -lt $normal.price){[decimal]$normal.sale_price}else{[decimal]$normal.price}
  $variantPrice=if($null -ne $variant.sale_price -and $variant.sale_price -gt 0 -and $variant.sale_price -lt $variant.price){[decimal]$variant.sale_price}else{[decimal]$variant.price}
  $payload=[ordered]@{p_checkout_token=[Guid]::NewGuid().ToString();p_cart_id=$null;p_shipping_method_id=$shipping.id;p_payment_method_id=$payment.id;
    p_discount_id=$discount.id;p_discount_code=$discount.code;p_expected_subtotal=(2*$normalPrice+$variantPrice);
    p_items=@(@{product_id=$normal.id;variant_id=$null;quantity=2},@{product_id=$variant.product_id;variant_id=$variant.id;quantity=1});
    p_shipping_address=@{first_name='Nestora';last_name='EMAIL SANDBOX TEST';email='info@nestorahomelb.com';phone=$null;
      street_address='TEST ONLY - DO NOT PICK, PACK, SHIP OR FULFILL';address_line_2=$null;city='No delivery - email test only';state_province='Lebanon';postal_code='TEST-NO-DELIVERY';country='Lebanon';
      delivery_instructions='NON-FULFILLABLE EMAIL TEST. Pickup/COD used only to avoid shipping or charging. Do not fulfill.'};
    p_customer_notes='AUTHORIZED EMAIL SANDBOX ONLY - DO NOT FULFILL OR CHARGE. Preserve this test record.';
    p_redeem_product_ids=@();p_redeem_variant_ids=@();p_free_gift_product_ids=@()}
  $state=[pscustomobject]@{payload=$payload;result=$null;createdUTC=[DateTime]::UtcNow.ToString('o')}
  Save-State $state
}
# Retry of a transport failure reuses this saved checkout token; never manufactures a second order.
if(-not $state.payload.p_shipping_address.postal_code){
  $state.payload.p_shipping_address.postal_code='TEST-NO-DELIVERY';Save-State $state
}
$result=Invoke-RestMethod -Uri ($origin+'/rest/v1/rpc/place_customer_order') -Method POST -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ($state.payload | ConvertTo-Json -Depth 12) -TimeoutSec 30
$state.result=$result;Save-State $state
$result | ConvertTo-Json -Depth 5
