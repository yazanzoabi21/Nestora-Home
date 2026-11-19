# Verified local backup — 2026-11-19

Successful backup directory (outside Git):

`C:\Users\yzoabi\Nestora-Backups\ojismppptyrivnxnkcux-20261119T133708Z-9374bc74`

| File | Encrypted size |
| --- | ---: |
| database.pgdump.dpapi | 1,118,870 bytes (~1.07 MiB) |
| contents.list.dpapi | 121,910 bytes |
| roles.metadata.json.dpapi | 11,222 bytes |
| Three encrypted payloads total | 1,252,002 bytes (~1.19 MiB) |

The folder also contains non-secret manifest.json, verification.json and prompt
status metadata, all under the same restricted ACL. Earlier attempt directories
are empty/incomplete diagnostics and must NOT be treated as verified backups.

## Execution and independent verification

- Source PostgreSQL 17.6; native Windows pg_dump/pg_restore/psql 17.2.
- Confirmed Session Pooler: aws-1-ap-southeast-1.pooler.supabase.com:5432,
  postgres.ojismppptyrivnxnkcux, database/role postgres.
- Full client TLS certificate + hostname validation using the owner-downloaded
  Supabase Root 2021 CA. No downgrade to require/insecure certificate modes.
- Password entered only at the private masked console; no argument/file/log/chat
  password and no persistent credential file. SecureString disposed on exit.
- Metadata probe/role export use verified BEGIN READ ONLY transactions. Native
  pg_dump uses its own REPEATABLE READ, READ ONLY snapshot. No production DDL,
  data writes, restoration, extension installation, deployment or email occurred.
- Dump started 13:37:18 UTC, completed 13:39:21 UTC. Native archive is unfiltered
  custom-format, including application and accessible managed-schema data/objects.
- Independent verify-backup-offline.ps1 completed 13:42:02 UTC: all three cipher
  and plaintext SHA256 hashes/sizes match, DPAPI decryption works, ACL inheritance
  is disabled and only the current user/SYSTEM can read. A freshly decrypted copy
  fully decoded through pg_restore --file=NUL with no --dbname/PG connection
  environment. Temporary plaintext verification file was removed afterward.
- Archive TOC confirms 41 public table-data entries, 27 Auth, 10 Storage,
  59 public functions, 117 policies and 420 ACL entries. Encrypted Vault secrets
  table data is present. Role metadata captures 30 roles plus memberships without
  password fields. These are object counts, not customer/order row counts.

Unencrypted custom archive SHA256:
`342bbb420814c26b46b7c8ee1e0ef6137830aad81ab9a330c2647b5a084cd91e`

Encrypted custom archive SHA256:
`2b55de20da847be814aa109f08ee83266727378abd1944fa2b3be0958dd8206b`

## Fixed verification failure

The first attempted probe connected and returned JSON but then stopped at the
script's combined identity/version/read-only check before any table export.
It did not retain the individual values; that diagnostic omission is fixed.
The next probe proved version=17.6, database=postgres, role=postgres and
default_transaction_read_only=off through this Session Pooler, despite PGOPTIONS.
The rejected predicate checked that session DEFAULT instead of the actual
transaction. The corrected explicit READ ONLY transaction reports
transaction_read_only=on and is still required. Wrong version, database, role or
actual read-write transaction still fail closed. Four negative self-tests cover
these guards. No database-level/role settings were changed to fix the client.

## Recovery limits and Stage 1 status

This is integrity/decode verified, NOT semantically restore-tested. No restoration
was attempted. DPAPI recovery needs the current Windows user's protected profile/
master keys; copying .dpapi files alone is not portable disaster recovery. This
same-disk backup should later receive an independently reviewed portable/off-site
encrypted copy if recovery from loss of this computer is required.

Actual Storage file bytes, Edge secrets/deployments (including SMTP credentials),
Auth provider/config/JWT signing keys and database-role password verifiers are
excluded. Vault ciphertext is included, but external encryption keys/dependencies
are not; a new project may not decrypt it. Roles are reference JSON metadata, not
a blindly executable managed-role restore script. See BACKUP.md for full limits.

The immediate backup blocker is resolved. Local Stage 1 SQL now installs private
tables/functions only: 20 does not attach/invoke anything; Stage 2 activation is
isolated in 21; public.orders FKs are omitted; 41 verifies no processing and 91
provides private-only Stage 1 pause/revoke. No business trigger/cron/constraint is
installed by Stage 1. Extension ACLs, installed function semantics/permissions and
live postchecks still need verification during the separately resumed Stage 1.
Current task forbids that installation, so STOP here with production unchanged.
