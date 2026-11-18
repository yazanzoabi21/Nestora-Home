// Independent offline consistency checks; never executes SQL or contacts Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = __dirname;
const m = JSON.parse(fs.readFileSync(path.join(root,'deployed-metadata/security-metadata.json'),'utf8'))[0].security_metadata;
const review = JSON.parse(fs.readFileSync(path.resolve(root,'../../../docs/security-audit-2026-11-16/DEPLOYED_REVIEW.json'),'utf8'));
const forward = fs.readFileSync(path.join(root,'40_deployed_hardening.proposed.sql'),'utf8');
const rollback = fs.readFileSync(path.join(root,'41_deployed_hardening.rollback.sql'),'utf8');
const sqlTests = fs.readFileSync(path.join(root,'90_negative_authorization.proposed.sql'),'utf8');
let passed = 0;
function check(name,run) {run();passed++;console.log('PASS: '+name);}
check('every modified function has the byte-exact deployed definition in rollback',()=>{
  for (const c of review.functionChanges) {
    const r = m.routines.find((r)=>r.schema===c.schema&&r.name===c.name&&r.identity_arguments===c.signature);
    assert(r && rollback.includes(r.definition));
    assert.equal(crypto.createHash('md5').update(r.definition).digest('hex'),c.beforeMd5);
  }
});
check('all eight deployed catalog Storage mutation policies are gated',()=>{
  const writes = m.policies.filter((p)=>p.schema==='storage'&&p.table==='objects'&&p.command!=='SELECT'&&/'media-library'|'product-images'|'product-videos'/.test((p.using||'')+(p.with_check||'')));
  assert.equal(writes.length,8);
  for (const p of writes) {
    const c = review.policyChanges.find((c)=>c.before.schema===p.schema&&c.before.table===p.table&&c.before.name===p.name);
    assert(c);assert.deepEqual(c.before,p);
    for (const key of ['using','with_check']) if (p[key]!==null) {
      assert(c.after[key].includes(p[key]));assert(c.after[key].includes('public.current_user_is_admin()'));
    }
  }
});
check('avatar and intentionally public SELECT policies are not changed',()=>{
  for (const c of review.policyChanges) {
    assert.notEqual(c.before.command,'SELECT');
    assert(!((c.before.using||'')+(c.before.with_check||'')).includes("'avatars'"));
  }
  assert(!forward.includes('update storage.buckets'));
});
check('all new active-account policies are restrictive and have paired rollback',()=>{
  for (const p of review.addedPolicies) {
    assert.equal(p.permissive,'RESTRICTIVE');assert.deepEqual(p.roles,['authenticated']);
    assert(rollback.includes(`drop policy if exists "${p.name}" on "${p.schema}"."${p.table}";`));
  }
});
check('original grantor and grant options are preserved for changed profile/role ACLs',()=>{
  for (const a of m.relation_acl_entries.filter((a)=>a.schema==='public'&&['profiles','roles'].includes(a.relation)&&['PUBLIC','anon','authenticated'].includes(a.grantee))) {
    assert.equal(a.grantor,'postgres');
    const grantee = a.grantee==='PUBLIC'?'PUBLIC':`"${a.grantee}"`;
    assert(rollback.includes(`grant ${a.privilege} on public.${a.relation} to ${grantee}${a.grantable?' with grant option':''};`));
  }
  assert.equal(m.column_acl_entries.length,0);
  assert(rollback.includes('revoke update(full_name,email,phone,birthday,avatar_url,avatar_media_id)'));
});
check('all revoked routine browser grants are restored exactly',()=>{
  for (const c of review.revokedRoutineExecution) {
    const signature = `"${c.schema}"."${c.name}"(${c.signature})`;
    assert(rollback.includes(`revoke execute on function ${signature} from PUBLIC,anon,authenticated;`));
    for (const a of m.routine_acl_entries.filter((a)=>a.schema===c.schema&&a.name===c.name&&a.identity_arguments===c.signature&&['PUBLIC','anon','authenticated'].includes(a.grantee))) {
      const grantee = a.grantee==='PUBLIC'?'PUBLIC':`"${a.grantee}"`;
      assert.equal(a.grantor,'postgres');
      assert(rollback.includes(`grant execute on function ${signature} to ${grantee}${a.grantable?' with grant option':''};`));
    }
  }
});
check('search RPCs remain externally executable and are not rewritten',()=>{
  for (const name of ['search_products_by_image','get_customer_image_search_index_count']) {
    assert(!review.functionChanges.some((r)=>r.name===name));
    assert(!review.revokedRoutineExecution.some((r)=>r.name===name));
    const r=m.routines.find((r)=>r.name===name);
    assert(r.effective_execute.anon&&r.effective_execute.authenticated);
  }
});
check('checkout serialization and authorization precede existing gift/loyalty writes',()=>{
  const start=forward.indexOf('CREATE OR REPLACE FUNCTION public.place_customer_order(');
  const body=forward.slice(start,forward.indexOf('$function$\n;',start));
  assert(body.indexOf('pg_advisory_xact_lock')<body.indexOf('if coalesce(cardinality(p_free_gift_product_ids)'));
  assert(body.includes('is not true then')); // NULL ownership/email never authorizes a replay.
  assert(body.indexOf('return jsonb_build_object(')<body.indexOf('select * into v_discount'));
  assert.equal(review.revokedRoutineExecution.filter((r)=>r.name==='place_customer_order').length,5);
});
check('four actor classes, positive controls and real image-search RPCs are in SQL tests',()=>{
  for (const text of ['set local role anon','nestora.test.customer_a','nestora.test.admin','nestora.test.inactive_admin',
    'customer personal edit','admin retains video management','search_products_by_image','check_admin_rpc_denials']) assert(sqlTests.includes(text));
  assert(sqlTests.trim().includes('rollback;'));
  assert(sqlTests.includes("sqlerrm='Admin access is required.'"));
});
check('drafts are approval-gated and contain no blanket rollback grants or CASCADE',()=>{
  assert(forward.includes('security_review_approved'));assert(rollback.includes('security_rollback_approved'));
  assert(!/\bgrant all\b/i.test(rollback));assert(!/\bcascade\s*;/i.test(rollback));
});
const artifacts = ['40_deployed_hardening.proposed.sql','41_deployed_hardening.rollback.sql',
  '05_readonly_execution_prerequisites.sql','50_readonly_postchecks.sql','90_negative_authorization.proposed.sql',
  '92_rpc_acl_negative.proposed.sql','storage-authorization.proposed.cjs'].map((file)=>{
    const bytes=fs.readFileSync(path.join(root,file));
    return {file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  });
fs.writeFileSync(path.join(root,'PACKAGE_CHECK_REPORT.json'),JSON.stringify({scope:'Offline consistency only; no database execution or authorization result',checksPassed:passed,checksFailed:0,artifacts},null,2)+'\n');
