// Offline preparation only. No SQL client, network access, or database execution.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = __dirname;
const docs = path.resolve(root, '../../../docs/security-audit-2026-11-16');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const qi = (s) => '"' + s.replaceAll('"', '""') + '"';
const ql = (s) => "'" + s.replaceAll("'", "''") + "'";
const qrole = (s) => s === 'PUBLIC' || s === 'public' ? 'PUBLIC' : qi(s);
// PostgreSQL jsonb text orders object keys by UTF-8 byte length then byte value.
function pgJson(value) {
  if (Array.isArray(value)) return '[' + value.map(pgJson).join(', ') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value)
    .sort((a, b) => Buffer.byteLength(a) - Buffer.byteLength(b) || Buffer.compare(Buffer.from(a), Buffer.from(b)))
    .map((key) => JSON.stringify(key) + ': ' + pgJson(value[key])).join(', ') + '}';
  return JSON.stringify(value);
}
const raw = fs.readFileSync(path.join(root, 'deployed-metadata/security-metadata.json'), 'utf8').replace(/^\uFEFF/, '');
const rows = JSON.parse(raw);
assert(Array.isArray(rows) && rows.length === 1, 'Expected one complete SQL Editor export row');
const row = rows[0], m = row.security_metadata;
assert.equal(m.capture.format_version, 1);
const serialized = pgJson(m);
assert.equal([...serialized].length, row.export_characters, 'Export character count mismatch');
assert.equal(md5(serialized), row.export_md5, 'Export hash mismatch: truncated/edited export');
for (const section of ['relations','policies','routines','triggers','columns','relation_acl_entries',
  'column_acl_entries','routine_acl_entries','roles','role_memberships','schemas','storage_buckets',
  'effective_column_privileges','catalog_dependencies']) assert(Array.isArray(m[section]), 'Missing ' + section);
assert.equal(m.policies.length, m.capture.policy_count);
assert.equal(m.routines.length, m.capture.routine_count);
assert.equal(m.triggers.length, m.capture.trigger_count);
for (const r of m.routines) {
  assert.equal(md5(r.definition), r.definition_md5, 'Routine hash mismatch: ' + r.name);
  assert.equal([...r.definition].length, r.definition_chars);
}
const publicTables = m.relations.filter((r) => r.schema === 'public' && ['r','p'].includes(r.kind));
assert.equal(publicTables.length, m.capture.public_table_count);
assert.equal(publicTables.filter((r)=>r.rls_enabled).length,m.capture.public_rls_enabled_count);
assert.equal(new Set(m.policies.map((p) => `${p.schema}.${p.table}.${p.name}`)).size, m.policies.length);
assert.equal(m.column_acl_entries.length, 0, 'New column grants require rollback review');
assert(!m.role_memberships.some((r) => ['anon','authenticated'].includes(r.member)), 'Unexpected API role membership');
for (const s of m.schemas) for (const a of s.effective_api_privileges) {
  // Shape recorded in the manifest; runtime postchecks also enforce protected ACLs.
  assert(a !== null);
}
const sig = (r) => `${qi(r.schema)}.${qi(r.name)}(${r.identity_arguments})`;
const typeSig = (r) => `${qi(r.schema)}.${qi(r.name)}(${r.identity_arguments.split(', ').filter(Boolean).map((a) => a.replace(/^\w+ /, '')).join(', ')})`;
const routine = (name, schema = 'public') => {
  const found = m.routines.filter((r) => r.schema === schema && r.name === name);
  assert.equal(found.length, 1, 'Expected exact single routine: ' + schema + '.' + name);
  return found[0];
};
const policySQL = (p) => `create policy ${qi(p.name)} on ${qi(p.schema)}.${qi(p.table)} as ${p.permissive} for ${p.command} to ${p.roles.map(qrole).join(', ')}${p.using === null ? '' : ` using (${p.using})`}${p.with_check === null ? '' : ` with check (${p.with_check})`};`;
const policyChanges = [];
const changePolicy = (p, predicate) => {
  const target = {...p, using: p.using === null ? null : predicate, with_check: p.with_check === null ? null : predicate};
  policyChanges.push({before: p, after: target});
};
const admin = '(select public.current_user_is_admin())';
for (const p of m.policies) {
  if (p.schema === 'storage' && p.table === 'objects' && p.command !== 'SELECT' &&
      /'media-library'|'product-images'|'product-videos'/.test((p.using || '') + (p.with_check || ''))) {
    const target = {...p};
    if (p.using !== null) target.using = `(${p.using}) AND ${admin}`;
    if (p.with_check !== null) target.with_check = `(${p.with_check}) AND ${admin}`;
    policyChanges.push({before:p, after:target});
  }
  if (p.schema === 'public' && p.table === 'product_videos' && p.command !== 'SELECT') changePolicy(p, admin);
  if (p.schema === 'public' && ['customer_contact_messages','customer_content_pages','customer_faqs','product_variants','reviews'].includes(p.table) && p.command === 'ALL') {
    policyChanges.push({before:p, after:{...p, using:`(${p.using}) AND ${admin}`, with_check:`(${p.with_check}) AND ${admin}`}});
  }
  if (p.schema === 'public' && p.table === 'loyalty_program_settings' && p.command === 'UPDATE') {
    policyChanges.push({before:p, after:{...p, using:`(${p.using}) AND ${admin}`, with_check:`(${p.with_check}) AND ${admin}`}});
  }
}
assert.equal(policyChanges.filter((c) => c.before.schema === 'storage').length, 8);
assert.equal(policyChanges.filter((c) => c.before.table === 'product_videos').length, 3);
const activeName = 'nestora_active_actor_20261116';
const active = `(select private.${activeName}())`;
const helper = `CREATE OR REPLACE FUNCTION private.${activeName}()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true);
$function$
`;
assert(!m.routines.some((r) => r.schema === 'private' && r.name === activeName), 'Reserved helper already exists');
const addedPolicies = [];
for (const table of ['carts','cart_items','customer_addresses','customer_notification_preferences','customer_product_history',
  'customer_loyalty_points_balances','customer_loyalty_points_ledger','customers','notifications','orders','order_items',
  'order_shipping_addresses','payment_transactions']) {
  assert(publicTables.some((r) => r.name === table));
  addedPolicies.push({schema:'public',table,name:'security_20261116_active_actor',permissive:'RESTRICTIVE',command:'ALL',roles:['authenticated'],using:active,with_check:active});
}
addedPolicies.push({schema:'public',table:'profiles',name:'security_20261116_active_profile_edit',permissive:'RESTRICTIVE',command:'UPDATE',roles:['authenticated'],using:active,with_check:active});
assert(!m.policies.some((p) => addedPolicies.some((a) => a.schema===p.schema && a.table===p.table && a.name===p.name)));
const functions = [];
function patch(name, transform, schema='public') {
  const before = routine(name, schema), after = transform(before.definition);
  assert.notEqual(after, before.definition, 'Patch did not change ' + name);
  assert.equal(before.owner, 'postgres');
  functions.push({before, after});
}
patch('current_user_is_admin', (d) => d.replace("SET search_path TO 'public'", "SET search_path TO ''").replace('coalesce(p.is_active, true) = true','p.is_active IS TRUE'));
patch('can_manage_customer_offers', (d) => d.replace("SET search_path TO 'public'", "SET search_path TO ''").replace('coalesce(p.is_active, true)','p.is_active IS TRUE'));
patch('is_admin', (d) => d.replace('coalesce(p.is_active, true) = true','p.is_active IS TRUE'), 'private');
patch('prevent_customer_profile_privilege_changes', (d) => d.replace("SET search_path TO 'public'", "SET search_path TO ''").replace(/begin\r?\n/, `begin
  if auth.role() in ('anon','authenticated') and
    (new.id is distinct from old.id or new.role_id is distinct from old.role_id
      or new.is_active is distinct from old.is_active) then
    raise exception 'Profile identity, role and activation are protected' using errcode='42501';
  end if;
`));
const activeGuard = `
  if not private.${activeName}() then
    raise exception 'Active account required' using errcode='42501';
  end if;
`;
for (const name of ['submit_product_review','edit_own_product_review','record_product_view','replace_cart_free_gifts']) {
  patch(name, (d) => d.replace(/begin\r?\n/, 'begin\n' + activeGuard));
}
const adminGuard = `
  if current_user not in ('postgres','service_role') and not public.current_user_is_admin() then
    raise exception 'Active Admin required' using errcode='42501';
  end if;
`;
for (const name of ['update_inventory_stock','replace_product_variants','replace_promotion_products','refresh_analytics','refresh_dashboard_statistics']) {
  assert.equal(routine(name).security_definer, false, 'Invoker guard must not be used in a definer');
  patch(name, (d) => d.replace(/begin\r?\n/, 'begin\n' + adminGuard));
}
patch('can_current_customer_use_discount', (d) => d.replace(/begin\r?\n/, `begin
  if auth.uid() is not null and not private.${activeName}() then
    raise exception 'Active account required' using errcode='42501';
  end if;
`));
// Keep anonymous getter results unchanged; prevent stale inactive JWT access.
for (const name of ['get_my_loyalty_balance','get_my_loyalty_points_history','get_my_redeemable_loyalty_products']) {
  patch(name, (d) => {
    const body = d.split('$function$')[1].trim().replace(/;\s*$/, '');
    const result = routine(name).result;
    const statement = result.startsWith('TABLE(') ? 'return query ' + body + ';' : 'return (' + body + ');';
    return d.replace('LANGUAGE sql','LANGUAGE plpgsql').replace(/\$function\$[\s\S]*\$function\$/, `$function$
begin
  if auth.uid() is not null and not private.${activeName}() then
    raise exception 'Active account required' using errcode='42501';
  end if;
  ${statement}
end;
$function$`);
  });
}
const checkouts = m.routines.filter((r) => r.schema==='public' && r.name==='place_customer_order');
assert.equal(checkouts.length,6);
const checkoutIndex = m.indexes.find((i)=>i.schema==='public'&&i.relation==='orders'&&i.name==='orders_checkout_token_key');
assert(checkoutIndex?.unique && checkoutIndex.ready && checkoutIndex.valid, 'Reviewed unique checkout token index required');
const outer = checkouts.find((r) => r.identity_arguments.split(', ').length === 13);
assert(outer);
const checkoutGuard = `
  if auth.uid() is not null and not private.${activeName}() then
    raise exception 'Active account required' using errcode='42501';
  end if;
  if p_checkout_token is null then
    raise exception 'A checkout idempotency token is required' using errcode='22023';
  end if;
  -- Serialize the entire outer checkout before gift/loyalty/pricing side effects.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_checkout_token::text, 20261116));
  select o.* into v_security_existing from public.orders o
    where o.checkout_token=p_checkout_token for update;
  if found then
    if ((auth.uid() is not null and v_security_existing.user_id=auth.uid())
      or (auth.uid() is null and v_security_existing.user_id is null and exists (
        select 1 from public.order_shipping_addresses a where a.order_id=v_security_existing.id
          and lower(a.email)=lower(btrim(p_shipping_address ->> 'email'))))) is not true then
      raise exception 'Checkout token is not available to this caller' using errcode='42501';
    end if;
    -- Replay always returns persisted values; changed arguments never reprice it.
    return jsonb_build_object(
      'order_id',v_security_existing.id,'order_number',v_security_existing.order_number,
      'status',v_security_existing.status,'payment_status',v_security_existing.payment_status,
      'subtotal',v_security_existing.subtotal,'shipping_cost',v_security_existing.shipping,
      'payment_fee',v_security_existing.payment_fee,'discount_id',v_security_existing.discount_id,
      'discount_code',v_security_existing.discount_code,'discount_amount',v_security_existing.discount_amount,
      'total',v_security_existing.total,'loyalty_points_redeemed',v_security_existing.loyalty_points_redeemed,
      'loyalty_points_earned',v_security_existing.loyalty_points_earned);
  end if;
`;
functions.push({before:outer,after:outer.definition.replace(/declare\r?\n/,'declare\n  v_security_existing public.orders%rowtype;\n').replace(/begin\r?\n/,'begin\n'+checkoutGuard)});
const revokeFunctions = m.routines.filter((r) => r.schema==='public' &&
  (r.result==='trigger' || (r.name==='place_customer_order' && r!==outer) ||
    ['append_customer_loyalty_ledger_entry','attach_customer_to_order','restore_admin_order_item_inventory','recalculate_admin_order_after_item_change',
     'place_customer_order_legacy_discount','place_customer_order_legacy_products_only'].includes(r.name)));
const aclRoles = ['PUBLIC','anon','authenticated'];
function restoreRoutineAcl(r) {
  return `revoke execute on function ${sig(r)} from PUBLIC,anon,authenticated;\n` +
    m.routine_acl_entries.filter((a) => a.schema===r.schema && a.name===r.name && a.identity_arguments===r.identity_arguments && aclRoles.includes(a.grantee))
      .map((a) => {assert.equal(a.grantor,'postgres');return `grant execute on function ${sig(r)} to ${qrole(a.grantee)}${a.grantable?' with grant option':''};`;}).join('\n');
}
// Validate the routine ACL field names before emitting any rollback.
assert(m.routine_acl_entries.every((a) => typeof a.name==='string' && typeof a.identity_arguments==='string'));
const approval = (rollback) => `do $guard$ begin
  if current_user <> 'postgres' then raise exception 'Run as reviewed postgres owner'; end if;
  if not (select rolbypassrls from pg_roles where rolname=current_user) then raise exception 'Reviewed trusted BYPASSRLS owner required'; end if;
  if current_setting('nestora.${rollback?'security_rollback_approved':'security_review_approved'}',true) is distinct from 'yes' then
    raise exception 'Local draft: separate explicit execution approval required';
  end if;
end $guard$;`;
const header = `-- METADATA-BACKED LOCAL DRAFT. NOT EXECUTED. Do not deploy automatically.
-- Source capture: ${m.capture.captured_at_utc}; export MD5 ${row.export_md5}.
-- Supersedes 10/11/20 proposals; NEVER combine the two packages.
-- Rerunnable target state. Re-export/review drift and rehearse on staging first.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
`;
let forward = header + approval(false) + '\n';
forward += `do $guard$ begin
  if exists(select 1 from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls))
    or exists(select 1 from pg_auth_members am join pg_roles r on r.oid=am.member where r.rolname in ('anon','authenticated'))
    or has_schema_privilege('anon','public','CREATE') or has_schema_privilege('authenticated','public','CREATE')
    or has_schema_privilege('anon','private','CREATE') or has_schema_privilege('authenticated','private','CREATE') then
    raise exception 'API role/schema trust boundary drift';
  end if;
  if not has_schema_privilege('authenticated','private','USAGE') then raise exception 'Missing reviewed private schema usage'; end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and
      (not c.relrowsecurity or pg_get_userbyid(c.relowner) in ('anon','authenticated'))) then
    raise exception 'Public RLS/ownership drift';
  end if;
  if not (select relrowsecurity and pg_get_userbyid(relowner)='supabase_storage_admin' from pg_class where oid='storage.objects'::regclass) then
    raise exception 'Storage RLS/ownership drift';
  end if;
  if not exists(select 1 from pg_index i where i.indexrelid='public.orders_checkout_token_key'::regclass
    and i.indisunique and i.indisready and i.indisvalid and pg_get_indexdef(i.indexrelid)=${ql(checkoutIndex.definition)}) then
    raise exception 'Checkout token uniqueness drift';
  end if;
  if to_regprocedure('private.${activeName}()') is not null and
    (select md5(pg_get_functiondef(p.oid))<>${ql(md5(helper))} or p.proowner<>'postgres'::regrole
      from pg_proc p where p.oid=to_regprocedure('private.${activeName}()')) then
    raise exception 'Reserved helper definition/owner drift';
  end if;
end $guard$;\n`;
for (const {before,after} of functions) forward += `do $guard$ begin
  if (select md5(pg_get_functiondef(p.oid)) not in (${ql(before.definition_md5)},${ql(md5(after))}) or p.proowner <> 'postgres'::regrole
      from pg_proc p where p.oid=${ql(typeSig(before))}::regprocedure) is distinct from false then
    raise exception 'Routine definition/owner drift: ${before.schema}.${before.name}';
  end if;
end $guard$;\n`;
// Existing target policy identities must be present; no invented replacements.
for (const {before} of policyChanges) forward += `do $guard$ begin
  if not exists(select 1 from pg_policies where schemaname=${ql(before.schema)} and tablename=${ql(before.table)}
    and policyname=${ql(before.name)} and cmd=${ql(before.command)} and permissive=${ql(before.permissive)}
    and roles::text[] = array[${before.roles.map(ql).join(',')} ]::text[]) then
    raise exception 'Policy identity/role drift: ${before.schema}.${before.table}.${before.name}';
  end if;
end $guard$;\n`;
forward += helper + ';\nalter function private.'+activeName+'() owner to postgres;\nrevoke all on function private.'+activeName+'() from PUBLIC,anon,authenticated;\ngrant execute on function private.'+activeName+'() to authenticated;\n';
forward += functions.map((c) => c.after + ';').join('\n');
for (const c of policyChanges) forward += `\nalter policy ${qi(c.before.name)} on ${qi(c.before.schema)}.${qi(c.before.table)}${c.after.using===null?'':` using (${c.after.using})`}${c.after.with_check===null?'':` with check (${c.after.with_check})`};`;
for (const p of addedPolicies) forward += `\ndrop policy if exists ${qi(p.name)} on ${qi(p.schema)}.${qi(p.table)};\n${policySQL(p)}`;
forward += '\nrevoke all on public.profiles from PUBLIC,anon,authenticated;\ngrant select on public.profiles to authenticated;\ngrant update(full_name,email,phone,birthday,avatar_url,avatar_media_id) on public.profiles to authenticated;\nrevoke all on public.roles from PUBLIC,anon,authenticated;\ngrant select on public.roles to authenticated;\n';
forward += revokeFunctions.map((r) => `revoke execute on function ${sig(r)} from PUBLIC,anon,authenticated;`).join('\n');
forward += `
do $guard$ declare role_name text; column_name text; begin
  foreach role_name in array array['anon','authenticated'] loop
    foreach column_name in array array['id','role_id','is_active','created_at'] loop
      if has_column_privilege(role_name,'public.profiles',column_name,'UPDATE') or
        has_column_privilege(role_name,'public.profiles',column_name,'INSERT') then
        raise exception 'Effective protected profile grant remains';
      end if;
    end loop;
    if has_table_privilege(role_name,'public.roles','INSERT,UPDATE,DELETE,TRUNCATE') then
      raise exception 'Effective role catalogue grant remains';
    end if;
  end loop;
end $guard$;
commit;
`;
let rollback = header + approval(true) + '\n';
for (const p of addedPolicies) rollback += `drop policy if exists ${qi(p.name)} on ${qi(p.schema)}.${qi(p.table)};\n`;
for (const c of policyChanges) rollback += `drop policy if exists ${qi(c.before.name)} on ${qi(c.before.schema)}.${qi(c.before.table)};\n${policySQL(c.before)}\n`;
rollback += functions.map((c) => c.before.definition + ';').join('\n');
rollback += '\nrevoke update(full_name,email,phone,birthday,avatar_url,avatar_media_id) on public.profiles from authenticated;\n';
for (const table of ['profiles','roles']) {
  rollback += `revoke all on public.${table} from PUBLIC,anon,authenticated;\n`;
  for (const a of m.relation_acl_entries.filter((a) => a.schema==='public' && a.relation===table && aclRoles.includes(a.grantee))) {
    assert.equal(a.grantor,'postgres');
    rollback += `grant ${a.privilege} on public.${table} to ${qrole(a.grantee)}${a.grantable?' with grant option':''};\n`;
  }
}
rollback += revokeFunctions.map(restoreRoutineAcl).join('\n');
rollback += `\ndrop function if exists private.${activeName}(); -- RESTRICT, no CASCADE.\ncommit;\n`;
fs.writeFileSync(path.join(root,'40_deployed_hardening.proposed.sql'),forward);
fs.writeFileSync(path.join(root,'41_deployed_hardening.rollback.sql'),rollback);
const checks = [];
for (const role of ['anon','authenticated']) {
  for (const r of revokeFunctions) checks.push({name:`${role}: internal ${r.name}(${r.identity_arguments}) denied`,sql:`not has_function_privilege(${ql(role)},${ql(typeSig(r))},'EXECUTE')`});
  for (const r of [outer,routine('search_products_by_image'),routine('get_customer_image_search_index_count')]) checks.push({name:`${role}: required public ${r.name}(${r.identity_arguments}) retained`,sql:`has_function_privilege(${ql(role)},${ql(typeSig(r))},'EXECUTE')`});
  for (const column of ['id','role_id','is_active','created_at']) for (const privilege of ['UPDATE','INSERT']) checks.push({name:`${role}: profiles.${column} ${privilege} denied`,sql:`not has_column_privilege(${ql(role)},'public.profiles',${ql(column)},${ql(privilege)})`});
  for (const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE']) checks.push({name:`${role}: roles ${privilege} denied`,sql:`not has_table_privilege(${ql(role)},'public.roles',${ql(privilege)})`});
}
for (const column of ['full_name','email','phone','birthday','avatar_url','avatar_media_id']) checks.push({name:`authenticated: personal profiles.${column} UPDATE retained`,sql:`has_column_privilege('authenticated','public.profiles',${ql(column)},'UPDATE')`});
const checkQuery = checks.map((c)=>`select ${ql(c.name)} as check_name, (${c.sql}) as passed`).join('\nunion all\n');
fs.writeFileSync(path.join(root,'50_readonly_postchecks.sql'),'-- READ ONLY. Expected: every passed value is true. No business rows returned.\n'+checkQuery+';\n');
fs.writeFileSync(path.join(root,'92_rpc_acl_negative.proposed.sql'),`-- STAGING ONLY; read-only privilege assertions, no fixture creation or RPC invocation.
\\set ON_ERROR_STOP on
begin;
select set_config('nestora.test.staging', :'staging_approved',true),set_config('nestora.test.database', :'staging_database',true);
do $test$ declare failures integer; begin
  if current_setting('nestora.test.staging') <> 'yes' or current_database() <> current_setting('nestora.test.database') then
    raise exception 'Explicit staging selection required';
  end if;
  select count(*) into failures from (${checkQuery}) checks where passed is distinct from true;
  if failures <> 0 then raise exception 'FAIL: % privilege assertions',failures; end if;
  raise notice 'PASS: ${checks.length} exact-signature/column privilege assertions';
end $test$;
rollback;
`);
const manifest = {
  source:{capturedAt:m.capture.captured_at_utc,exportMd5:row.export_md5,characters:row.export_characters,hashVerified:true,routineHashesVerified:m.routines.length},
  counts:{publicTables:publicTables.length,policies:m.policies.length,routines:m.routines.length,triggers:m.triggers.length},
  policyChanges,addedPolicies,
  functionChanges:functions.map((c) => ({schema:c.before.schema,name:c.before.name,signature:c.before.identity_arguments,beforeMd5:c.before.definition_md5,afterMd5:md5(c.after)})),
  revokedRoutineExecution:revokeFunctions.map((r) => ({schema:r.schema,name:r.name,signature:r.identity_arguments})),
  // Complete exact policy/trigger inventory, with no customer data or secret stores.
  policies:m.policies,triggers:m.triggers,
  routines:m.routines.map(({schema,name,identity_arguments,owner,security_definer,security_settings,effective_execute,definition_md5,result}) =>
    ({schema,name,identity_arguments,owner,security_definer,security_settings,effective_execute,definition_md5,result})),
  protectedOriginalGrants:m.relation_acl_entries.filter((a)=>a.schema==='public'&&['profiles','roles'].includes(a.relation)),
  privilegeAssertions:checks.length,
  storageBuckets:m.storage_buckets,
  publications:m.publications,
  publicationTables:m.publication_tables,
  sensitiveColumnPrivileges:m.effective_column_privileges.filter((c)=>c.schema==='public'&&['anon','authenticated'].includes(c.role)&&
    ((c.relation==='products'&&c.column==='cost_price')||(c.relation==='payment_methods'&&c.column==='config'))),
  limits:m.scope_limits,
};
fs.writeFileSync(path.join(docs,'DEPLOYED_REVIEW.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({validated:manifest.source,counts:manifest.counts,changedPolicies:policyChanges.length,addedPolicies:addedPolicies.length,changedFunctions:functions.length,revokedRoutines:revokeFunctions.length,productionExecuted:false},null,2));
