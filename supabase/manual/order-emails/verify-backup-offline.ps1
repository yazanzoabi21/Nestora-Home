# Offline only: decrypt/hash under a restricted backup folder; pg_restore emits to NUL, never a DB.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$BackupDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$root=[IO.Path]::GetFullPath((Join-Path $env:USERPROFILE 'Nestora-Backups'))+[IO.Path]::DirectorySeparatorChar
$dir=[IO.Path]::GetFullPath($BackupDirectory)
if (-not $dir.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)) {throw 'Expected private backup directory outside Git.'}
if (((Get-Item -LiteralPath $dir).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {throw 'No reparse directories.'}
$acl=Get-Acl -LiteralPath $dir
if (-not $acl.AreAccessRulesProtected) {throw 'Backup ACL inheritance is not disabled.'}
$allowedSids=@([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18')
foreach ($access in $acl.Access) {
  if ($access.AccessControlType -eq 'Allow' -and
    $access.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowedSids) {
    throw 'Unexpected backup ACL reader.'
  }
}
$manifest=Get-Content -LiteralPath (Join-Path $dir 'manifest.json') -Raw | ConvertFrom-Json
if ($manifest.Project -ne 'ojismppptyrivnxnkcux' -or
  $manifest.Status -ne 'ARCHIVE_DECODE_AND_ENCRYPTION_VERIFIED_NOT_RESTORE_TESTED') {throw 'No completed expected backup.'}
$members=@('database.pgdump.dpapi','contents.list.dpapi','roles.metadata.json.dpapi')
if (@($manifest.Files).Count -ne 3 -or @($manifest.Files.File | Sort-Object -Unique).Count -ne 3) {throw 'Unexpected archive membership.'}
$sha=[Security.Cryptography.SHA256]::Create()
$temp=Join-Path $dir ('verify-'+[Guid]::NewGuid().ToString('N')+'.pgdump')
$files=@();$coverage=$null;$roleCount=0
try {
  foreach ($record in $manifest.Files) {
    if ($record.File -notin $members) {throw 'Unexpected file name.'}
    $path=Join-Path $dir $record.File
    if (((Get-Item -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {throw 'No reparse files.'}
    $cipher=[IO.File]::ReadAllBytes($path)
    if ([Convert]::ToHexString($sha.ComputeHash($cipher)).ToLowerInvariant() -ne $record.EncryptedSHA256) {throw 'Cipher hash mismatch.'}
    $plain=[Security.Cryptography.ProtectedData]::Unprotect($cipher,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    try {
      if ([Convert]::ToHexString($sha.ComputeHash($plain)).ToLowerInvariant() -ne $record.PlainSHA256 -or
        $plain.Length -ne $record.PlainBytes) {throw 'Plain hash/size mismatch.'}
      if ($record.File -eq 'database.pgdump.dpapi') {
        $stream=[IO.File]::Open($temp,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        try {$stream.Write($plain,0,$plain.Length)} finally {$stream.Dispose()}
      }
      if ($record.File -eq 'contents.list.dpapi') {
        $toc=[Text.Encoding]::UTF8.GetString($plain)
        $coverage=[ordered]@{
          PublicTableDataEntries=([regex]::Matches($toc,'(?m)^[^;]+;.* TABLE DATA public ')).Count
          AuthTableDataEntries=([regex]::Matches($toc,'(?m)^[^;]+;.* TABLE DATA auth ')).Count
          StorageTableDataEntries=([regex]::Matches($toc,'(?m)^[^;]+;.* TABLE DATA storage ')).Count
          PublicFunctionEntries=([regex]::Matches($toc,'(?m)^[^;]+;.* FUNCTION public ')).Count
          PolicyEntries=([regex]::Matches($toc,'(?m)^[^;]+;.* POLICY ')).Count
          ACLEntries=([regex]::Matches($toc,'(?m)^[^;]+;.* ACL ')).Count
          VaultEncryptedSecretsData=$toc.Contains('TABLE DATA vault secrets')
          GlobalRolePasswordsIncluded=$false
        }
      }
      if ($record.File -eq 'roles.metadata.json.dpapi') {
        $roles=[Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json
        if ($roles.transactionReadOnly -ne 'on') {throw 'Role read-only proof absent.'}
        $roleCount=@($roles.roles).Count
      }
      $files += [pscustomobject]@{File=$record.File;Bytes=$cipher.Length;CipherSHA256Verified=$true;PlainSHA256Verified=$true}
    } finally {[Array]::Clear($plain,0,$plain.Length)}
  }
  # No database argument or connection environment: full offline decode to the null device.
  $start=[Diagnostics.ProcessStartInfo]::new()
  $start.FileName='C:\Program Files\PostgreSQL\17\bin\pg_restore.exe'
  $start.UseShellExecute=$false;$start.CreateNoWindow=$true
  $start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
  foreach($key in @($start.Environment.Keys)) {
    if($key.StartsWith('PG',[StringComparison]::OrdinalIgnoreCase)) {$null=$start.Environment.Remove($key)}
  }
  foreach($arg in @('--exit-on-error','--file=NUL',$temp)) {$start.ArgumentList.Add($arg)}
  $process=[Diagnostics.Process]::Start($start)
  try {
    $o=$process.StandardOutput.ReadToEndAsync();$e=$process.StandardError.ReadToEndAsync()
    $process.WaitForExit();$null=$o.GetAwaiter().GetResult();$null=$e.GetAwaiter().GetResult()
    if($process.ExitCode -ne 0) {throw 'Offline archive decode failed.'}
  } finally {$process.Dispose()}
  $report=[ordered]@{VerifiedUTC=[DateTime]::UtcNow.ToString('o');Project=$manifest.Project;
    Files=$files;FullOfflineDecodePassed=$true;RoleMetadataCount=$roleCount;Coverage=$coverage;
    RestrictedInheritance=$true;ProductionRestorationAttempted=$false}
  $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $dir 'verification.json') -Encoding utf8
  $report | ConvertTo-Json -Depth 6
} finally {
  # A single newly created temp file beneath the validated private directory; never recursive.
  if(Test-Path -LiteralPath $temp) {Remove-Item -LiteralPath $temp -Force}
  $sha.Dispose()
}
