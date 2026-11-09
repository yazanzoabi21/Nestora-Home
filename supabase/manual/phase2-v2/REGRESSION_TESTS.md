# Proposed regression tests — NOT EXECUTED

Use an isolated staging project with controlled accounts and disposable rows. Never run privilege-changing tests against production users. API tests need real signed Supabase JWTs, not just SET ROLE or Angular mocks. Never print those JWTs. Test rollback also runs only in staging, followed by reapplying the approved fix.

## Database / direct API tests
1. Active Admin: PATCH own profiles.role_id to Super Admin -> denied; persisted role unchanged.
2. Active Admin: PATCH own is_active, id, created_at or an extra protected field -> denied; no partial update of benign fields from the same request.
3. Active Customer: same attacks -> denied. A trusted server may still provision customers through the existing signup trigger.
4. Active Admin/Customer: edit permitted profile fields -> succeeds only for rows allowed by existing RLS; attempting another customer's personal data remains denied.
5. Active Admin: change role catalogue name/id/insert/delete -> denied even if an existing grant/policy would otherwise permit it.
6. Active Super Admin: manage another profile's role/activation through the explicit RPC -> succeeds. Ordinary Admin, Customer, anon and inactive Super Admin -> denied.
7. Trusted service-role provisioning and existing legitimate server jobs continue working. Browser clients never receive that key.
8. Deactivate a signed-in customer through the authorized staging workflow, reuse the SAME old JWT: REST reads/writes of orders/cart/wishlist/addresses/reviews/loyalty -> denied or no protected rows returned; no JWT-expiry wait.
9. Repeat for an Admin: dashboard/analytics/products/orders/inventory/media mutations -> denied with the old JWT.
10. Reuse old JWTs against every exposed SECURITY DEFINER RPC and overload, including historical checkout variants. Mutation must not happen even if the response is an error. Test side effects, not just status codes.
11. Confirm the deployed pre-request hook runs BEFORE the RPC body and existing hooks are preserved/composed. If hosting ignores the hook setting, release is BLOCKED.
12. Storage: old JWT cannot upload/overwrite/delete private/controlled objects; private downloads are denied. Public product/media URLs retain their original public accessibility.
13. Realtime: after deactivation, protected Postgres Changes emit no new protected rows. Account for already-delivered/in-flight data and reconnect behavior. Private Broadcast/Presence, if deployed, require separate tests and gates.
14. Anonymous catalogue/search/public reviews and legitimate guest checkout still work. Anonymous access does not acquire protected customer/admin data.
15. Concurrent deactivation: requests beginning after the deactivation transaction commits are denied. An already-authorized in-flight transaction is not retroactively undone.
16. Migration rollback: capture preflight metadata; apply 10/20; roll back 21 then 11; compare original guard definition/ACL/owner, pre-existing policies and pre-request settings. No business data is restored or overwritten by rollback.
17. Verify tables outside the RLS manifest, views, Edge Functions and custom database JWT roles separately. No blanket claim that these scripts secure unspecified entry points.

## Angular unit and integration tests
Add cases to core/services/auth/admin-auth.service.spec.ts and customer-auth.service.spec.ts:
- profile fetch throws, returns null, is inactive, or has wrong role after successful SDK sign-in: session cleared, original error retained, no success navigation;
- remote signOut rejects/returns 5xx: local storage AND SDK getSession() cleared; cleanup outcome indicates unconfirmed remote revocation;
- successful local logout clears only its own audience; the other audience still works;
- late profile/refresh completion after logout cannot repopulate session/profile state;
- login/logout overlap is serialized per audience; Admin and Customer never block or clear each other;
- Customer same-user login rechecks activation; initialization recovers from an earlier rejected profile request;
- successful authentication followed by a cart load/router failure is not reported as invalid credentials or silently signed out;
- registration confirmation-required flow, Google callback, recovery event validation and password change remain functional.

Extend core/tokens/supabase.tokens.spec.ts:
- targeted auth, user-cache and PKCE-key cleanup across local/session/memory storage;
- blocked browser storage still yields null session through the memory fallback;
- remember-me and unrelated keys survive according to the agreed behavior.

Extend guard specs:
- active Admin cannot pass the Super Admin boundary;
- inactive Admin/Super Admin/Customer is denied; network/profile errors lead to safe navigation;
- permissionGuard does not claim unsupported fine-grained permissions and is not attached broadly without a permission matrix.

## Existing feature acceptance
- Admin and Customer simultaneous logins; independent logout; remember-me; browser reload and multiple tabs.
- Guest cart and recently viewed merge; wishlist; customer accounts/addresses/preferences; Google sign-in; confirmation/recovery; avatars.
- Guest and signed-in checkout; existing idempotency tokens; discounts/free gifts/loyalty; no duplicate orders after retries.
- Order status/removal/inventory restoration; products/variants; image indexing/search; uploads and public media URLs.
- ALL-time dashboard statistics, all three charts, recent orders, exports and responsive layouts.

After application patches are approved and applied: npm run build; npm run test -- --watch=false; npm run lint; targeted lint on touched files if unrelated full-lint failures occur. Record exact results. No test pass is claimed by this proposal.

## v2 additions supersede conflicting v1 expectations
Active Super Admin direct privilege PATCH is denied; the RPC permits self changes only if one active Super Admin remains. All browser role-catalogue mutations are denied. Add concurrent last-admin tests, cascade-delete/TRUNCATE coverage, NULL legacy-account cases, dedicated-role isolation/GUC-spoof attempts, selective public-read manifests, overload fingerprint drift, encoded/schema-switched requests, and request-marker hook proof from STAGING_VALIDATION.md. No test has been executed.
