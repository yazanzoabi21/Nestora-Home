# Sitemap generation and Hostinger deployment

## Commands

Run `npm ci`, then `npm run build`. The npm prebuild hook queries Supabase using
the existing production environment's publishable key, generates `public/sitemap.xml`,
and stops the build if any query fails. Angular copies public assets into
`dist/nestora-home/browser`; the postbuild hook validates the XML, URLs, robots.txt,
and presence of the rewrite configuration. Use `npm run build` in CI/Hostinger;
direct `ng build` bypasses npm lifecycle hooks.

Optional CI overrides: `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Only
publishable or legacy anon keys are accepted. No service-role key is needed or
supported. Reads run as an anonymous visitor under existing RLS; nothing is written
to Supabase. No database migrations are required.

## Included URLs

- `/` (included as requested; Angular currently redirects it to `/shop`).
- `/shop` (homepage), `/shop/products`, `/shop/new-arrivals`,
  `/shop/best-sellers`, `/shop/flash-deals`, `/contact-us`, `/faq`.
- Every publicly readable product not marked inactive, using the stored slug or
  its UUID when there is no slug: `/shop/products/<identifier>`. Out-of-stock
  products remain accessible and are included.
- Active child categories whose parent is active:
  `/shop/products?category=<slug>`. This is the existing category route.
  Parent categories have no supported category page and are excluded. Slugs use
  the same stored-slug/name fallback as CategoriesService.
- Published, active content with an existing route: `/about-us`,
  `/shipping-policy`, `/return-policy`, `/privacy-policy`.
- Public promotions with slugs that are active within their date window:
  `/shop/promotions/<slug>`.

Private pages and redirect aliases such as `/shop/home` and `/shop/all-products`
are excluded. The full generated URL inventory is in `public/sitemap.xml` and the
build's `sitemap.xml`; it is not committed because catalog data changes. Content
lastmod comes from `updated_at`. Other entries omit lastmod rather than inventing
an update date. Pagination reads all rows, even beyond Supabase's response limit.
Duplicate URLs are removed, XML is escaped, and protocol limits are enforced.

## Refresh after catalog changes

Run `npm run sitemap:refresh` after products, category visibility/slugs, content,
or promotions change, then `npm run sitemap:validate`. This writes a fresh sitemap
atomically into `dist/nestora-home/browser` without rebuilding Angular. Upload
only that `sitemap.xml` to the deployed document root. For a complete release,
run `npm run build` instead. Promotion start/end times also require regeneration.

A static deployment cannot observe database changes by itself. A CI scheduler
or approved Hostinger cron workflow can run the refresh command with this checkout
and Node dependencies and publish the resulting file. No schedule or deployment
is configured by this change. Sitemap and robots files are outside the Angular
service-worker asset caches, so refreshing does not invalidate its manifest.

## Deploy manually

1. Back up the current Hostinger document root and inspect its `.htaccess`.
   Preserve required HTTPS/domain/security rules above the new static-file and
   SPA rules; remove any conflicting blanket redirect to `/shop`.
2. Upload the **contents** of `dist/nestora-home/browser` to the domain's document
   root (typically `public_html`). Include the hidden `.htaccess` file, sitemap.xml,
   and robots.txt. Do not upload the enclosing browser directory.
3. Purge any Hostinger/CDN cache of `/sitemap.xml` and `/robots.txt`.
4. Run `npm run sitemap:verify-live`. It fetches both URLs without following
   redirects, requires HTTP 200 and XML/plain-text content types, parses XML,
   checks the URL inventory and private-route exclusions, and verifies the robots
   sitemap declaration. This command must pass after deployment.
5. In Google Search Console, resubmit `https://nestorahomelb.com/sitemap.xml`.
   Discovery/indexing may take time; a valid sitemap does not guarantee indexing.

## Diagnosis and validation limits

Before this fix, the live sitemap endpoint returned HTTP 200 **text/html** containing
the Angular shell. Angular's wildcard redirects unrecognized paths to `/shop`.
There were no crawler assets or rewrite configuration in the repository.

The Hostinger connector required reauthentication, so the current remote
`.htaccess` could not be read. Local build validation verifies the packaged rules;
it does not execute Apache/LiteSpeed. The live endpoint remains unchanged until
manual deployment, and the post-deployment live check is required.
