# Same-project sandbox acceptance matrix — NOT executed remotely

Run only after explicit same-project sandbox setup/capture/send approvals. Use the
real reviewed schema and checkout RPCs. Email tests use real new orders and
approved own-business contacts, never existing customer addresses or fake data.

| Case | Required evidence |
| --- | --- |
| Disabled feature | Checkout succeeds; original dashboard notification remains; no webhook sending, claims or SMTP |
| Guest COD order | Explicitly enrolled NEW committed order; both jobs/copies to business mailbox only, no registration or real guest sending; unpaid wording |
| Confirmed authenticated customer | Correct checkout contact, guarded account order-list link, ownership verified |
| Other supported payment method | Actual saved method and status; no claim of paid while pending; unsupported online-provider configuration still rejects as before |
| Products-only order without transaction | Uses existing payment-method row and approved shop currency; final saved prices/totals, no invented transaction |
| Variants and missing product_name | Actual variant attributes/SKU, products.name fallback only for label; original saved price |
| Deleted product without name | Failed/manual-review email job; no invented label and no checkout change |
| Discount and fees | Item totals equal saved subtotal; discount/shipping/payment fee reconcile to total |
| Loyalty/free gift | Cash totals/zero-price lines accurate; gift/points badge; all wrapper updates visible |
| Checkout rollback | No committed signal, job or email; no external network before commit |
| Token reuse | Same order, one signal and one job per kind; no routine duplicate |
| Lower/tokenless RPC | Current grants unchanged; no customer write-policy weakening; tokenless/unfinalized email ineligible |
| Cutoff | Order before cutoff is never emailed; changing cutoff cannot release older pending jobs |
| Inactive account/cancelled order | Email-only eligibility rejects at prepare/claim/start; existing business behavior unchanged |
| Forged HTTP amounts/address/recipient | Ignored as event metadata or rejected; no arbitrary send |
| Public/user JWT calls | 401 and no privileged database access or SMTP |
| Direct anon/authenticated new RPC calls | EXECUTE denied; new private tables/schema denied; existing policies unchanged |
| Concurrent workers | Two separate database sessions contend on claim; only one owns a job and max two leases globally |
| Stale claim | Old token cannot start/finish a newly claimed job; no duplicate SMTP |
| Crash before start | Expired processing lease retries, bounded to five attempts |
| Crash/timeout after start or DATA | Uncertain, never automatically replayed |
| Explicit 450 rejection | Retry with persisted backoff and quota reservation |
| Explicit 550/auth rejection | Failed review state; other recipient can succeed |
| SMTP accepted then DB timeout | No resend; accepted or uncertain durable state; reconcile original Message-ID |
| Lost webhook/HTTP queue outage | Durable signal remains; cron prepares it without scanning historical orders; HTTP enqueue exception does not fail checkout |
| Service/API outage | Rendering/config preflight cannot consume jobs; claims remain fenced; sanitized response/logs |
| Quotas | Global hour/day, two in-flight, customer recipient limits across multiple isolates; no attempt burned solely on deferral |
| Public unapproved order | ID signal only; no job/snapshot/capture/send until specific service-only enrollment; identifier cleaned after one day |
| Capture-only gates | Both renders marked captured, zero send attempts/reservations/start calls/SMTP |
| Per-order authorization | Wrong/pre-cutoff/unfinalized ID denied; exactly two captured jobs required, service-only, 30-minute permit |
| Snapshot changes | Changed totals/items/contact/status after enrollment invalidate approval; no stale send |
| Expired permit or new cutoff | No new starts; old enrollment cannot authorize a new session |
| Sandbox recipient restriction | DB constraints and final transport independently reject real recipients; only info@nestorahomelb.com permitted |
| Wrong mode/project/send flag | Final SMTP boundary rejects absent/wrong mode/project and disabled send gate; cannot enable real-customer path |
| EN/AR content | Correct RTL, escaping, no raw HTML injection, no unresolved field tokens in actual mail |
| Mail clients and widths | Inbox preview, logo, 320/375/768/desktop widths in Gmail/Hostinger/Outlook as applicable; long names/Arabic/amounts remain readable |
| Admin Reply-To | Sandbox Reply targets business mailbox; checkout contact only escaped body data; future real-customer Reply-To remains separate |
| Customer Reply-To | Clicking Reply addresses info@nestorahomelb.com |
| Guest links | No privileged/account link sent to unverified guest; admin link has no token and still requires admin login |
| Real inbox proof | Two distinct [TEST] subjects, independent SMTP acceptances and own-mailbox inbox receipts; exact order values and no extra messages |
| Retention | Bounded cleanup redacts terminal snapshots after 30 days even when sending disabled; uniqueness tombstones retained |
| Rollback | No new starts after Edge/DB gates disabled; existing submitting calls reconciled; original notification/checkout preserved |

Do not consume a production permit or send a diagnostic customer email to prove
any of these conditions. Record results/approved addresses in a private staging
evidence location, with credentials and unnecessary PII excluded from reports.
Existing SQL concurrency/fault scenarios are approval-gated. Do not create fake
orders or simulate SMTP faults against Hostinger; use isolated fixtures/adapters
for offline fault tests. Initial live budget is TWO attempts per rolling day;
increasing it for retry scenarios requires separate review and approval.
