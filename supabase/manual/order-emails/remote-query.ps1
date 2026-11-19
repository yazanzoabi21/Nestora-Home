# Uses the existing Supabase CLI login in Windows Credential Manager, in memory only.
[CmdletBinding()]
param([string]$File, [string]$Sql, [switch]$MigrationDiagnostics)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class NestoraCliCredential {
  [DllImport("advapi32", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool Read(string target, int type, int flags, out IntPtr credential);
  [DllImport("advapi32")] public static extern void CredFree(IntPtr credential);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct Credential {
    public int Flags, Type; public string TargetName, Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public int CredentialBlobSize; public IntPtr CredentialBlob;
    public int Persist, AttributeCount; public IntPtr Attributes;
    public string TargetAlias, UserName;
  }
}
'@
$pointer = [IntPtr]::Zero
if (-not [NestoraCliCredential]::Read('Supabase CLI:supabase',1,0,[ref]$pointer)) {
  throw 'Existing Supabase CLI login unavailable.'
}
try {
  $credential = [Runtime.InteropServices.Marshal]::PtrToStructure($pointer,[type][NestoraCliCredential+Credential])
  $bytes = [byte[]]::new($credential.CredentialBlobSize)
  [Runtime.InteropServices.Marshal]::Copy($credential.CredentialBlob,$bytes,0,$bytes.Length)
  $token = [Text.Encoding]::UTF8.GetString($bytes)
  if ($token -notmatch '^sbp_[a-zA-Z0-9]+$') { $token=[Text.Encoding]::Unicode.GetString($bytes) }
  if ($token -notmatch '^sbp_[a-zA-Z0-9]+$') { throw 'Unsupported CLI credential format.' }
  if ($File) { $Sql=[IO.File]::ReadAllText((Resolve-Path -LiteralPath $File)) }
  if (-not $Sql) { throw 'SQL required.' }
  try {
    $result=Invoke-RestMethod -Method Post -Uri 'https://api.supabase.com/v1/projects/ojismppptyrivnxnkcux/database/query' -Headers @{Authorization="Bearer $token"} -ContentType 'application/json' -Body (@{query=$Sql}|ConvertTo-Json -Compress)
  } catch {
    if ($MigrationDiagnostics -and $File -and $File -match '7[01]_production') {
      # Only static, reviewed migration SQL has diagnostic permission; never secret/data queries.
      Write-Error $_.ErrorDetails.Message
    }
    throw 'Supabase database API failed; sensitive response suppressed.'
  }
  $result | ConvertTo-Json -Depth 30
} finally {
  [NestoraCliCredential]::CredFree($pointer)
  if ($bytes) { [Array]::Clear($bytes,0,$bytes.Length) }
  $token=$null
}
