# Deployed metadata handoff

The consolidated raw export has now been supplied in the ignored inbox and validated: complete MD5 `6372743879c1d24f0dec261a9330b64d`, 77 matching routine hashes, capture 2026-11-16 20:40 UTC. See `DEPLOYED_FINDINGS.md` for reviewed results. Production execution and deployment are not approved. Repository SQL was not substituted for the deployed metadata. The inspection instructions below remain useful for fresh pre-execution drift checks.

## Run one script

The validated JSON is at `C:\Projects\Angular\nestora-home\supabase\manual\security-audit-2026-11-16\deployed-metadata\security-metadata.json`. The inbox ignores exports in Git. Do not overwrite this before-state when obtaining a later drift snapshot; preserve both locally without committing raw exports.

Execute the entire [`00_consolidated_readonly_metadata.sql`](../../supabase/manual/security-audit-2026-11-16/00_consolidated_readonly_metadata.sql) in Supabase SQL Editor with your authorized project DBA connection. It supersedes `00_inspect.sql` for this handoff. It is one SELECT and returns one result row with `security_metadata`, `export_characters` and `export_md5`. There are no mutations, helper creations, role switches, session setting changes, application RPC invocations or customer-data queries. SQL Editor may report the current transaction as read-write: that describes its connection, not a write in this script.

Export the complete JSON result or SQL Editor CSV result, preserving definitions/newlines and the length/hash fields. A one-row result avoids row-limit omissions; a long cell can still be truncated by the client, so use its full result download. Review the output before sharing: function bodies, trigger arguments and column defaults can contain credential literals. Redact actual keys/passwords/secret endpoints while retaining authorization logic; tell me which sections were redacted (the original hash will then no longer match the redacted content). Do not include Auth user/session exports or secret-store values. If the script errors or times out, share the error text; an error is not evidence that an object is absent.

## Database evidence retrieved

The supplied consolidated export includes the evidence below. The script retrieves it again when a fresh drift check is authorized:

| Evidence | Why it is required |
|---|---|
| Actual relation list, kinds, owners, RLS/FORCE RLS and all policy definitions/roles/commands | Verify the 41-table claim and evaluate every permissive/restrictive path; distinguish a table from a view. |
| All columns/types/defaults/generated fields, direct table **and column** ACLs with grantors/grant options, plus effective privileges for API roles | Establish whether protected fields are writable and capture exact rollback state; table/inherited grants can override a column revoke. |
| Full definitions, identities/signatures, owners, search paths/security settings and effective EXECUTE for application routines | Audit the three named authorization helpers, all checkout overloads/legacy names, Admin/customer RPCs and missing versioned definitions. Security-definer functions can bypass table RLS. |
| Enabled DML triggers on application/Auth/Storage/Realtime tables and their function bodies; event triggers and rules | Check signup/role assignment, protected profile fields, side effects and bypass paths without invoking them. |
| View/materialized-view definitions/options and dependencies | Detect owner-context access and private-data projections; preserve existing Admin reports/customer lists. |
| Role memberships/attributes, schema CREATE/USAGE, default ACLs and sequence privileges | Identify inherited authority, untrusted object creation, future-object exposure and trusted internal writers. |
| Constraints and indexes | Confirm ownership relations, immutable identifiers, uniqueness/idempotency and checkout integrity without changing rows. |
| Bucket flags/MIME/size rules plus Storage policies | Separate catalog-row control from avatar/product/media object control. No uploaded objects or file contents are returned. |
| Publications/replica identity and Realtime policies | Determine private-event exposure and the required deactivation/reconnect tests. |
| Safe PostgREST exposed-schema/hook setting names and installed extensions/server version | Determine exposed RPC/schema scope and target SQL compatibility; prepare exact grants/definitions without overwriting existing hooks. |

The script includes function definition lengths/hashes and a complete-export length/hash to help detect truncation. Catalog dependencies are supporting evidence; dynamic SQL and external callers still require source review. Managed schemas' internal tables/routines are intentionally not exhaustively dumped, except relevant trigger/event functions and Auth identity helpers.

## Information SQL alone cannot provide

- **Deployed Edge Functions:** list of deployed names/versions, source/dependency manifests and per-function authentication configuration (including `verify_jwt` or handler-level JWT verification). For webhooks, provide verification/replay logic and configuration names, with secret values redacted. Do not export environment-secret values. No Edge Function list/source is currently available here; zero deployed functions must not be assumed.
- **Effective hosted API settings:** confirm actual exposed schemas and pre-request/pre-config hooks from project settings; SQL Editor settings may not match the running Data API.
- **Hosted Auth/security settings:** confirmation requirements, allowed redirect URLs, password/MFA policies and configured native abuse protections, without client secrets. These are review inputs, not permission to change existing login/session behavior.
- **Staging acceptance:** an explicitly identified staging project/connection and existing approved test fixture identifiers are needed to execute authorization/rollback tests. Production mutation probes will not substitute for staging. Do not send JWTs or database passwords in chat.

## What remains pending

The export-backed policies, grants, authorization helpers, triggers and RPC definitions have now been reviewed. The metadata-backed 40/41 drafts include original grant/definition restoration; the older rollback skeleton is superseded. Live exploitation, staging migration/rollback, API/Storage/Realtime acceptance and Edge/hosted settings review remain pending. Existing build/lint/unit results do not validate database authorization.

Outstanding inputs are deployed Edge source/configuration, actual hosted settings/external callers, and an explicitly approved staging environment with existing fixtures. No credentials or tokens should be sent in chat.
