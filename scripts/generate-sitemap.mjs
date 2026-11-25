import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'https://nestorahomelb.com';
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--output')) {
  throw new Error('Usage: node scripts/generate-sitemap.mjs [--output directory]');
}
const output = resolve(root, args[1] ?? 'public');

try {
  // Reuse the application's public configuration; never load a service-role key.
  const environment = await readFile(resolve(root, 'src/environments/environment.prod.ts'), 'utf8');
  const configValue = (name) => environment.match(new RegExp(`${name}:\\s*['"]([^'"]+)['"]`))?.[1];
  const url = process.env.SUPABASE_URL ?? configValue('supabaseUrl');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? configValue('supabaseAnonKey');
  let publicKey = key?.startsWith('sb_publishable_');
  if (!publicKey && key?.split('.').length === 3) {
    try {
      publicKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon';
    } catch {
      publicKey = false;
    }
  }
  if (!url || !publicKey) throw new Error('A Supabase URL and publishable/anon key are required. Secret keys are rejected.');
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  async function readAll(table, columns, filters = {}) {
    const rows = [];
    let expected;
    do {
      let query = supabase.from(table).select(columns, { count: 'exact' }).order('id');
      for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
      const { data, error, count } = await query
        .range(rows.length, rows.length + 499)
        .abortSignal(AbortSignal.timeout(30_000));
      if (error) throw new Error(`Cannot read public ${table}: ${error.message}`);
      if (expected !== undefined && expected !== count) throw new Error(`${table} changed during generation; retry.`);
      expected = count;
      if (expected === null || (!data.length && rows.length < expected)) throw new Error(`Incomplete ${table} response.`);
      rows.push(...data);
    } while (rows.length < expected);
    return rows;
  }

  const [products, categories, content, promotions] = await Promise.all([
    readAll('products', 'id,slug,is_active'),
    readAll('categories', 'id,name,slug,parent_id,is_active'),
    readAll('customer_content_pages', 'id,slug,updated_at', { is_active: true, is_published: true }),
    readAll('promotions', 'id,slug,is_active,start_date,end_date'),
  ]);
  const entries = new Map();
  const add = (path, lastmod) => {
    const loc = new URL(path, origin).href;
    if (new URL(loc).origin !== origin) throw new Error('Unexpected sitemap origin.');
    entries.set(loc, lastmod && Number.isFinite(Date.parse(lastmod)) ? new Date(lastmod).toISOString() : null);
  };
  // Explicit public route allowlist: private routes cannot be accidentally discovered.
  ['/', '/shop', '/shop/products', '/shop/flash-deals', '/shop/new-arrivals',
    '/shop/best-sellers', '/contact-us', '/faq'].forEach((path) => add(path));
  for (const product of products.filter((row) => row.is_active !== false)) {
    // The detail loader accepts persisted slugs and falls back to UUID identifiers.
    add(`/shop/products/${encodeURIComponent(product.slug || product.id)}`);
  }
  const activeCategoryIds = new Set(categories.filter((row) => row.is_active !== false).map((row) => row.id));
  const publicCategories = categories.filter((row) => row.is_active !== false && row.parent_id && activeCategoryIds.has(row.parent_id));
  for (const category of publicCategories) {
    const slug = category.slug || category.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    if (!slug) throw new Error(`Category ${category.id} has no routable slug.`);
    add(`/shop/products?category=${encodeURIComponent(slug)}`);
  }
  const contentRoutes = new Set(['about-us', 'shipping-policy', 'return-policy', 'privacy-policy']);
  for (const page of content) {
    if (contentRoutes.has(page.slug)) add(`/${page.slug}`, page.updated_at);
  }
  const now = Date.now();
  const activePromotions = promotions.filter((row) => row.is_active !== false && row.slug &&
    (!row.start_date || Date.parse(row.start_date) <= now) &&
    (!row.end_date || Date.parse(row.end_date) >= now));
  for (const promotion of activePromotions) add(`/shop/promotions/${encodeURIComponent(promotion.slug)}`);
  const escapeXml = (value) => value.replace(/[<>&"']/g, (character) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  })[character]);
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    [...entries].map(([loc, lastmod]) => `  <url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`).join('\n') +
    '\n</urlset>\n';
  if (entries.size > 50_000 || Buffer.byteLength(xml) > 50 * 1024 * 1024) {
    throw new Error('Sitemap protocol limit exceeded; split into a sitemap index before publishing.');
  }
  await mkdir(output, { recursive: true });
  const target = resolve(output, 'sitemap.xml');
  await writeFile(`${target}.tmp`, xml, 'utf8');
  await rename(`${target}.tmp`, target);
  console.log(`Generated ${entries.size} URLs in ${target}`);
  console.log(`Public products: ${products.filter((row) => row.is_active !== false).length}; routable categories: ${publicCategories.length}; content pages: ${content.filter((row) => contentRoutes.has(row.slug)).length}; promotions: ${activePromotions.length}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Sitemap generation failed.');
  process.exitCode = 1;
}
