# Deployed metadata inbox

Place the complete output of `../00_consolidated_readonly_metadata.sql` here:

`C:\Projects\Angular\nestora-home\supabase\manual\security-audit-2026-11-16\deployed-metadata\security-metadata.json`

The SQL Editor's full CSV download is also acceptable here as `security-metadata.csv`. If only the earlier ChatGPT attachment is available, place `Pasted text(1).txt` here; missing sections will still need the consolidated export. Do not replace missing definitions with repository migrations.

This folder ignores export files to avoid accidentally committing sensitive metadata. Review credential literals embedded in definitions before sharing; preserve policy names, grants, signatures and authorization logic, and identify redactions. Do not include user/session rows, passwords, tokens or secret-store values.

The supplied `security-metadata.json` has been reviewed and its complete/routine hashes verified. Supplying it authorizes investigation only, not production execution. Keep the captured before-state when downloading future drift exports. Optional staging token configuration for the prepared Storage tests must also stay in this ignored folder.
