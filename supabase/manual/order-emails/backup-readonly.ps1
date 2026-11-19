# Local Windows/PowerShell 7 backup runner. Never executes restoration or production DDL.
# Password is entered privately with Read-Host -AsSecureString, never as an argument/file.
[CmdletBinding()]
param(
  [string]$DatabaseHost = '',
  [string]$DatabaseUser = '',
  [string]$RootCertificate = '',
  [string]$ToolsDirectory = 'C:\Program Files\PostgreSQL\17\bin',
  [switch]$SelfTest
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

function BytesHash([byte[]]$Bytes) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return [Convert]::ToHexString($sha.ComputeHash($Bytes)).ToLowerInvariant() }
  finally { $sha.Dispose() }
}
function Assert-BackupSession([psobject]$Server) {
  if ($Server.version -notmatch '^17\.') { throw 'SERVER_MAJOR_VERSION_MISMATCH' }
  if ($Server.database -ne 'postgres' -or $Server.role -ne 'postgres') { throw 'SERVER_DATABASE_OR_ROLE_MISMATCH' }
  if ($Server.transactionReadOnly -ne 'on') { throw 'TRANSACTION_READ_ONLY_NOT_ENFORCED' }
}
function Protect-BackupFile([string]$Path) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  $cipher = $null; $roundtrip = $null
  try {
    $digest = BytesHash $bytes
    $cipher = [Security.Cryptography.ProtectedData]::Protect($bytes,$null,
      [Security.Cryptography.DataProtectionScope]::CurrentUser)
    $encryptedPath = $Path + '.dpapi'
    [IO.File]::WriteAllBytes($encryptedPath,$cipher)
    $roundtrip = [Security.Cryptography.ProtectedData]::Unprotect(
      [IO.File]::ReadAllBytes($encryptedPath),$null,
      [Security.Cryptography.DataProtectionScope]::CurrentUser)
    if ((BytesHash $roundtrip) -ne $digest) { throw 'Encryption roundtrip failed' }
    $record = [ordered]@{File=[IO.Path]::GetFileName($encryptedPath);PlainBytes=$bytes.Length;
      PlainSHA256=$digest;EncryptedBytes=$cipher.Length;EncryptedSHA256=(BytesHash $cipher)}
    # Delete only the newly generated, verified plaintext copy after protection succeeds.
    Remove-Item -LiteralPath $Path -Force
    return $record
  } finally {
    [Array]::Clear($bytes,0,$bytes.Length)
    if ($null -ne $roundtrip) { [Array]::Clear($roundtrip,0,$roundtrip.Length) }
  }
}

if ($SelfTest) {
  $session=[pscustomobject]@{version='17.6';database='postgres';role='postgres';defaultReadOnly='off';transactionReadOnly='on'}
  Assert-BackupSession $session
  foreach($change in @(@{version='18.0'},@{database='other'},@{role='other'},@{transactionReadOnly='off'})) {
    $bad=$session.PSObject.Copy()
    foreach($key in $change.Keys) { $bad.$key=$change[$key] }
    $refused=$false;try {Assert-BackupSession $bad} catch {$refused=$true}
    if(-not $refused) {throw 'Read-only/identity regression failed'}
  }
  $sample = [Text.Encoding]::UTF8.GetBytes('backup-integrity-self-test')
  $cipher = [Security.Cryptography.ProtectedData]::Protect($sample,$null,
    [Security.Cryptography.DataProtectionScope]::CurrentUser)
  $plain = [Security.Cryptography.ProtectedData]::Unprotect($cipher,$null,
    [Security.Cryptography.DataProtectionScope]::CurrentUser)
  if ((BytesHash $sample) -ne (BytesHash $plain)) { throw 'DPAPI roundtrip failed' }
  $cipher[[int]($cipher.Length/2)] = $cipher[[int]($cipher.Length/2)] -bxor 1
  $denied=$false
  try { $null=[Security.Cryptography.ProtectedData]::Unprotect($cipher,$null,
    [Security.Cryptography.DataProtectionScope]::CurrentUser) } catch { $denied=$true }
  if (-not $denied) { throw 'Corruption was not rejected' }
  $testDir=Join-Path ([IO.Path]::GetTempPath()) ('nestora-backup-selftest-'+[Guid]::NewGuid().ToString('N'))
  $null=New-Item -ItemType Directory -Path $testDir
  $testPath=Join-Path $testDir 'fixture.txt'
  try {
    [IO.File]::WriteAllBytes($testPath,$sample)
    $record=Protect-BackupFile $testPath
    if ($record.PlainSHA256 -ne (BytesHash $sample) -or (Test-Path -LiteralPath $testPath) -or
      -not (Test-Path -LiteralPath ($testPath+'.dpapi'))) { throw 'Protected file roundtrip failed' }
  } finally {
    foreach($path in @($testPath,($testPath+'.dpapi'))) {
      if(Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
    }
    Remove-Item -LiteralPath $testDir
  }
  Write-Output 'PASS: actual-transaction/identity guards, four negative regressions, DPAPI/hash/corruption/protected-file checks; no database connection.'
  exit 0
}

$project='ojismppptyrivnxnkcux'
$isDirect=$DatabaseHost -eq "db.$project.supabase.co" -and $DatabaseUser -eq 'postgres'
$isSession=$DatabaseHost -match '^[a-z0-9.-]+\.pooler\.supabase\.com$' -and $DatabaseUser -eq "postgres.$project"
if (-not ($isDirect -or $isSession)) { throw 'Use verified Dashboard direct/session connection fields for this project.' }
if (-not (Test-Path -LiteralPath $RootCertificate -PathType Leaf)) { throw 'Dashboard SSL root certificate required.' }
foreach ($tool in @('pg_dump','pg_restore','psql')) {
  if (-not (Test-Path -LiteralPath (Join-Path $ToolsDirectory "$tool.exe"))) { throw 'PostgreSQL tools missing.' }
}
$version=& (Join-Path $ToolsDirectory 'pg_dump.exe') --version
if ($version -notmatch 'PostgreSQL\) 17\.') { throw 'PostgreSQL 17 client required.' }

$backupParent=Join-Path $env:USERPROFILE 'Nestora-Backups'
$stamp=[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$backupDir=Join-Path $backupParent "$project-$stamp-$([Guid]::NewGuid().ToString('N').Substring(0,8))"
$repoPath=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
if ([IO.Path]::GetFullPath($backupDir).StartsWith($repoPath,[StringComparison]::OrdinalIgnoreCase)) {
  throw 'Backup must be outside the repository.'
}
$null=New-Item -ItemType Directory -Path $backupDir
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
$acl=Get-Acl -LiteralPath $backupDir
$acl.SetAccessRuleProtection($true,$false)
$acl.SetOwner($sid)
foreach ($principal in @($sid,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
  $rule=[Security.AccessControl.FileSystemAccessRule]::new($principal,'FullControl',
    'ContainerInherit, ObjectInherit','None','Allow')
  $acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $backupDir -AclObject $acl

$promptStatus=Join-Path $backupDir 'prompt-status.json'
@{Status='AWAITING_PRIVATE_PASSWORD';Project=$project} | ConvertTo-Json | Set-Content -LiteralPath $promptStatus
$password=Read-Host 'Enter DATABASE password privately (not SMTP password; input is masked)' -AsSecureString
if ($password.Length -eq 0) {
  @{Status='ABORTED_EMPTY_PASSWORD';Project=$project} | ConvertTo-Json | Set-Content -LiteralPath $promptStatus
  throw 'No database password entered.'
}
@{Status='BACKUP_RUNNING';Project=$project} | ConvertTo-Json | Set-Content -LiteralPath $promptStatus

function Invoke-BackupTool([string]$Tool,[string[]]$Arguments,[bool]$Connect=$false) {
  $info=[Diagnostics.ProcessStartInfo]::new()
  $info.FileName=Join-Path $ToolsDirectory "$Tool.exe"
  $info.UseShellExecute=$false; $info.CreateNoWindow=$true
  $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
  foreach ($arg in $Arguments) { $info.ArgumentList.Add($arg) }
  foreach ($key in @($info.Environment.Keys)) { if ($key.StartsWith('PG',[StringComparison]::OrdinalIgnoreCase)) { $null=$info.Environment.Remove($key) } }
  if ($Connect) {
    $info.Environment['PGHOST']=$DatabaseHost; $info.Environment['PGPORT']='5432'
    $info.Environment['PGUSER']=$DatabaseUser; $info.Environment['PGDATABASE']='postgres'
    $info.Environment['PGSSLMODE']='verify-full'; $info.Environment['PGSSLROOTCERT']=[IO.Path]::GetFullPath($RootCertificate)
    $info.Environment['PGCONNECT_TIMEOUT']='15'; $info.Environment['PGAPPNAME']='nestora_readonly_logical_backup'
    $info.Environment['PGOPTIONS']='-c default_transaction_read_only=on -c lock_timeout=5000'
    $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
    try { $info.Environment['PGPASSWORD']=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  }
  $process=[Diagnostics.Process]::new(); $process.StartInfo=$info
  try {
    $null=$process.Start()
    $null=$info.Environment.Remove('PGPASSWORD')
    $outTask=$process.StandardOutput.ReadToEndAsync(); $errTask=$process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $output=$outTask.GetAwaiter().GetResult(); $errorText=$errTask.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0) {
      # Never print raw native output: it may contain sensitive SQL/object metadata.
      $code=if($errorText -match 'password authentication failed') {'AUTHENTICATION_FAILED'}
        elseif($errorText -match 'certificate|SSL|TLS') {'TLS_VERIFICATION_FAILED'}
        elseif($errorText -match 'permission denied|must be superuser') {'INSUFFICIENT_DUMP_PERMISSIONS'}
        elseif($errorText -match 'timed out|could not connect|could not translate') {'CONNECTION_FAILED'}
        else {'NATIVE_TOOL_FAILED'}
      throw "$Tool failed: $code (exit $($process.ExitCode)); no backup completeness claim."
    }
    return $output
  } finally { $process.Dispose(); $null=$info.Environment.Remove('PGPASSWORD') }
}

$statusPath=Join-Path $backupDir 'manifest.json'
$manifest=[ordered]@{Project=$project;StartedUTC=[DateTime]::UtcNow.ToString('o');Status='INCOMPLETE';
  ClientVersion=$version;TLS='verify-full';ReadOnlyVerified=$false;Protection='Windows DPAPI CurrentUser + restricted NTFS ACL';
  Restored=$false;Files=@()}
try {
  $manifest['Step']='VERIFY_READONLY_TRANSACTION'
  # Pooler session defaults may differ from PGOPTIONS. Verify and enforce the ACTUAL transaction.
  $query="begin read only; select json_build_object('version',current_setting('server_version'),'defaultReadOnly',current_setting('default_transaction_read_only'),'transactionReadOnly',current_setting('transaction_read_only'),'database',current_database(),'role',current_user,'bytes',pg_database_size(current_database())); rollback;"
  $server=(Invoke-BackupTool 'psql' @('-X','--no-password','-qAt','-v','ON_ERROR_STOP=1','-c',$query) $true) | ConvertFrom-Json
  $manifest['Diagnostics']=@{ServerVersion=$server.version;Database=$server.database;Role=$server.role;
    DefaultReadOnly=$server.defaultReadOnly;TransactionReadOnly=$server.transactionReadOnly;
    TLSClientMode='verify-full';ConnectionHost=$DatabaseHost;ConnectionUser=$DatabaseUser;Port=5432}
  $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $statusPath -Encoding utf8
  Assert-BackupSession $server
  $manifest['ReadOnlyVerified']=$true
  if ($server.bytes -gt 256MB) { throw 'Database exceeds in-memory encryption budget; review streaming backup before continuing.' }
  $manifest['ServerVersion']=$server.version
  $archive=Join-Path $backupDir 'database.pgdump'
  $manifest['Step']='PG_DUMP_READ_ONLY_SNAPSHOT'
  # pg_dump 17 itself uses BEGIN + SET TRANSACTION REPEATABLE READ, READ ONLY.
  $null=Invoke-BackupTool 'pg_dump' @('--no-password','--format=custom','--lock-wait-timeout=5000','--file',$archive) $true
  $manifest['Step']='ARCHIVE_COVERAGE_AND_FULL_DECODE'
  $toc=Invoke-BackupTool 'pg_restore' @('--list',$archive)
  foreach($required in @('TABLE DATA public orders','TABLE DATA auth users','TABLE DATA storage objects',
    'FUNCTION public place_customer_order','TRIGGER public order_shipping_addresses trg_notify_admin_new_order_from_address')) {
    if (-not $toc.Contains($required)) { throw 'Required archive coverage missing; do not treat as complete.' }
  }
  # No --dbname: decode ALL archived data to the Windows null device, never restore/connect.
  $null=Invoke-BackupTool 'pg_restore' @('--exit-on-error','--file=NUL',$archive)
  $tocPath=Join-Path $backupDir 'contents.list'; [IO.File]::WriteAllText($tocPath,$toc)
  $manifest['Step']='READ_ONLY_ROLE_METADATA'
  $roles=Join-Path $backupDir 'roles.metadata.json'
  $roleQuery=@'
begin read only;
select json_build_object('transactionReadOnly',current_setting('transaction_read_only'),
  'roles',(select json_agg(json_build_object('name',rolname,'superuser',rolsuper,'inherit',rolinherit,
    'createRole',rolcreaterole,'createDatabase',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,
    'connectionLimit',rolconnlimit,'validUntil',rolvaliduntil,'bypassRLS',rolbypassrls,'settings',rolconfig)) from pg_roles),
  'memberships',(select json_agg(json_build_object('role',r.rolname,'member',m.rolname,'grantor',g.rolname,
    'adminOption',a.admin_option,'inheritOption',a.inherit_option,'setOption',a.set_option))
    from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member
    join pg_roles g on g.oid=a.grantor));
rollback;
'@
  $roleJson=Invoke-BackupTool 'psql' @('-X','--no-password','-qAt','-v','ON_ERROR_STOP=1','-c',$roleQuery) $true
  if (($roleJson | ConvertFrom-Json).transactionReadOnly -ne 'on') { throw 'ROLE_METADATA_NOT_READ_ONLY' }
  [IO.File]::WriteAllText($roles,$roleJson)
  $manifest['Step']='ENCRYPT_AND_VERIFY_FILES'
  $manifest['Files']=@((Protect-BackupFile $archive),(Protect-BackupFile $tocPath),(Protect-BackupFile $roles))
  $manifest['Status']='ARCHIVE_DECODE_AND_ENCRYPTION_VERIFIED_NOT_RESTORE_TESTED'
  $manifest['CompletedUTC']=[DateTime]::UtcNow.ToString('o')
  $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $statusPath -Encoding utf8
  @{Status='COMPLETED';Project=$project} | ConvertTo-Json | Set-Content -LiteralPath $promptStatus
  Write-Output "Backup verified and encrypted outside Git: $backupDir"
} catch {
  # Preserve any incomplete output under restricted ACL. Do not print native errors/customer data.
  $manifest['Status']='INCOMPLETE_STOPPED'
  $message=$_.Exception.Message
  $manifest['FailureCode']=if($message -match '(AUTHENTICATION_FAILED|TLS_VERIFICATION_FAILED|INSUFFICIENT_DUMP_PERMISSIONS|CONNECTION_FAILED|NATIVE_TOOL_FAILED|SERVER_MAJOR_VERSION_MISMATCH|SERVER_DATABASE_OR_ROLE_MISMATCH|TRANSACTION_READ_ONLY_NOT_ENFORCED|ROLE_METADATA_NOT_READ_ONLY)') {$Matches[1]} else {'LOCAL_VALIDATION_OR_TOOL_ERROR'}
  $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $statusPath -Encoding utf8
  @{Status='INCOMPLETE_STOPPED';Project=$project} | ConvertTo-Json | Set-Content -LiteralPath $promptStatus
  Write-Output "Backup incomplete; Stage 1 remains blocked. Restricted output: $backupDir"
  throw
} finally { $password.Dispose() }
