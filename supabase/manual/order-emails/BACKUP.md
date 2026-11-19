# Free Windows logical backup — no Docker or production restoration

Project ojismppptyrivnxnkcux. PostgreSQL server verified read-only as 17.6.
Native clients exist at C:\Program Files\PostgreSQL\17\bin: pg_dump, pg_restore,
pg_dumpall and psql, version 17.2. They were missed by the earlier PATH-only check.
Same major version is compatible; no installation, purchase or service start is
needed. For future maintenance use only PostgreSQL's official Windows page and
its EDB installer/binaries links, preserving required DLLs. No download occurred.

## Verified non-secret connection configuration

Owner supplied Dashboard -> Connect -> Session Pooler:
- host aws-1-ap-southeast-1.pooler.supabase.com
- port 5432 (SESSION mode, never transaction pooler 6543)
- username postgres.ojismppptyrivnxnkcux; database postgres
- CA C:\Users\yzoabi\Downloads\prod-ca-2021.crt

The CA parses as Supabase Root 2021 CA, expires 2031-04-26; SHA256
807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA.
No password was requested in chat, read from browser storage or written to Git.

## Runner and guarantees

backup-readonly.ps1 is reviewed source WITHOUT credentials. Execute it in a
local PowerShell 7 console, with the three non-secret configuration parameters.
It prompts with Read-Host -AsSecureString. Enter the DATABASE password privately,
not an SMTP password. No password arguments, URL, file or parent-process global
environment is used; each native child's temporary environment holds it only
while connecting. Privileged local processes can inspect process memory, so run
only on the trusted account/machine. Never enable shell tracing/transcripts or
paste passwords into chat. The script suppresses native output/error details.

The runner:
1. Requires the exact project's direct/session host-user pattern and port 5432.
   Uses sslmode=verify-full plus the supplied root CA and a 15-second connect cap.
2. Requests default_transaction_read_only=on via PGOPTIONS but DOES NOT trust a
   pooler to preserve that session default. psql metadata probes use explicit
   BEGIN READ ONLY, verify transaction_read_only=on, and ROLLBACK, with
   -X/ON_ERROR_STOP. Version/database/role and both default/actual read-only values
   are recorded without credentials. Native pg_dump 17 explicitly starts its
   own REPEATABLE READ, READ ONLY snapshot transaction. Read locks have a
   five-second acquisition cap. In-memory encryption is limited to databases
   under 256 MiB. Never weaken TLS or accept transaction_read_only=off.
3. Makes an unfiltered custom-format pg_dump: one consistent database snapshot,
   including available schemas, table data, functions, triggers, policies, ACLs,
   default privileges, owners, sequences, large objects and extension metadata.
   It neither alters roles/tables nor executes restore SQL. Ordinary DML remains
   compatible with pg_dump's AccessShare locks; concurrent DDL can time out.
4. Requires TOC entries for public orders/checkout RPC/dashboard trigger, Auth
   users and Storage object metadata. Missing required entries stop completeness.
5. Runs pg_restore --list, then FULL archive decode with --file=NUL and NO
   --dbname. No SQL is submitted to any database by validation.
6. Exports cluster role attributes/memberships as JSON using pg_roles and
   pg_auth_members inside another verified BEGIN READ ONLY transaction, omitting
   password fields. This is reference metadata, not an executable role-restore
   script. Managed-role permission failures stop the complete result;
   it does not silently omit failed application/Auth/Storage coverage.
7. Writes outside Git under C:\Users\yzoabi\Nestora-Backups\<project-timestamp-id>.
   Inheritance is disabled: only the current Windows user and SYSTEM have ACL
   access. Temporary plaintext archive/role/TOC files inherit these restrictions.
8. Protects each completed file with Windows DPAPI CurrentUser, roundtrips it in
   memory and checks SHA256 equality before removing that newly generated
   plaintext copy. Manifest records plaintext/ciphertext hashes and byte sizes.
   Success is only ARCHIVE_DECODE_AND_ENCRYPTION_VERIFIED_NOT_RESTORE_TESTED.
   Partial failures remain restricted and explicitly incomplete.

Self-test: ./backup-readonly.ps1 -SelfTest tests actual transaction enforcement,
four negative version/identity/read-only cases, DPAPI roundtrip, hash equality,
corruption rejection and protected-file replacement without database access. A successful self-test is not a
database backup. No scheduled/recurring backup was installed.

## Coverage and restore limits

- Application SQL/data/permissions: native archive includes those accessible to
  postgres. Owner/ACL restoration requires matching roles and compatible extensions.
  External foreign-server data is not automatically included. System catalogs,
  PostgreSQL server binaries/settings and provider infrastructure are not a
  portable physical server image.
- Auth: auth table data can include email addresses and PASSWORD HASHES, sessions
  and identities. These are sensitive and encrypted locally. Auth project settings,
  JWT signing keys, OAuth provider credentials, redirect URLs and mail settings
  managed outside PostgreSQL are NOT included. Restoring table rows alone does
  not recreate a complete working Supabase Auth deployment.
- Storage: buckets/object metadata and policies are SQL data/definitions where
  accessible. Actual uploaded image/file bytes are NOT in PostgreSQL or this
  archive. Copy those separately before any recovery scenario requiring them.
- Vault: extension/config ciphertext may be included. External encryption/root
  key dependencies are NOT exported. Do not assume ciphertext will decrypt in a
  new project; do not dump the decrypted_secrets view to work around this.
- Secrets: Edge Function SMTP secrets, project API/service keys, platform config,
  function deployment bundles and database-role password verifiers are NOT backed
  up by this workflow. The authenticating database password is never persisted.
- Roles: separate JSON metadata export excludes passwords. Supabase-managed roles
  generally already exist on restore targets; review ownership/role grants instead
  of replaying managed role definitions blindly. Do not overwrite managed schemas.
- Consistency: database archive is one snapshot; role metadata is a separate
  catalog snapshot. No PITR/WAL history or zero-data-loss guarantee is provided.
- Encryption portability: DPAPI recovery requires this Windows user's protected
  profile/master keys. Copying .dpapi files alone does not guarantee recovery on
  a replacement computer. Preserve that Windows recovery context, or separately
  arrange a reviewed portable encrypted copy. A same-disk copy is not off-site
  disaster recovery. Protect manifests and avoid syncing sensitive backups publicly.
- Integrity versus restoration: TOC/full decode, SHA256 and DPAPI roundtrip detect
  many corruption/truncation cases. They do NOT prove a successful semantic restore.
  A separate isolated compatible target is needed for a full restore rehearsal.
  NO restore into production is authorized or attempted. Keep email gates off
  and inspect restored triggers/cron/network endpoints before any isolated restore.

Sources:
- https://www.postgresql.org/download/windows/
- https://www.postgresql.org/docs/17/app-pgdump.html
- https://www.postgresql.org/docs/17/app-pgrestore.html
- https://github.com/postgres/postgres/blob/REL_17_2/src/bin/pg_dump/pg_dump.c (native READ ONLY transaction)
- https://supabase.com/docs/guides/database/psql
- https://supabase.com/docs/guides/platform/backups

## Current execution status

Completed and independently verified: see BACKUP_RESULT.md and the actual folder's
manifest/verification.json for timestamps, sizes, SHA256 and object coverage.
Recheck later with verify-backup-offline.ps1 -BackupDirectory <the private folder>;
it requires no password/network/database and never restores to a database.
The immediate backup blocker is resolved subject to the documented recovery
limits. Current task still forbids Stage 1 DDL/deployment: resume separately.
