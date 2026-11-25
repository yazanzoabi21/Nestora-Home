import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const origin = 'https://nestorahomelb.com';
const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 1 && args[0] === '--live'), 'Usage: node scripts/validate-sitemap.mjs [--live]');
const live = args[0] === '--live';
const directory = new URL('../dist/nestora-home/browser/', import.meta.url);
async function load(name, type) {
  if (!live) return readFile(new URL(name, directory), 'utf8');
  const response = await fetch(`${origin}/${name}`, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200, `${name}: expected HTTP 200 without a redirect, got ${response.status}`);
  assert(type.test(response.headers.get('content-type') ?? ''), `${name}: incorrect Content-Type: ${response.headers.get('content-type')}`);
  return response.text();
}
try {
  const [xml, robots] = await Promise.all([
    load('sitemap.xml', /^(application|text)\/xml\b/i),
    load('robots.txt', /^text\/plain\b/i),
  ]);
  const dom = new JSDOM(xml, { contentType: 'application/xml' });
  const document = dom.window.document;
  assert.equal(document.documentElement.localName, 'urlset');
  assert.equal(document.documentElement.namespaceURI, 'http://www.sitemaps.org/schemas/sitemap/0.9');
  const entries = [...document.documentElement.children];
  assert(entries.length > 0 && entries.length <= 50_000);
  assert(Buffer.byteLength(xml) <= 50 * 1024 * 1024);
  const urls = entries.map((entry) => {
    assert.equal(entry.localName, 'url');
    assert.equal(entry.querySelectorAll('loc').length, 1);
    const loc = entry.querySelector('loc').textContent;
    const url = new URL(loc);
    assert.equal(url.origin, origin);
    assert(!url.hash && !url.username && !url.password);
    assert(!/\/(admin|super-admin|auth|cart|checkout|customer-account|account|wishlist|orders|verify-order-email)(\/|$)/.test(url.pathname), `Private URL: ${loc}`);
    if (url.search) {
      assert.equal(url.pathname, '/shop/products');
      assert.deepEqual([...url.searchParams.keys()], ['category']);
      assert(url.searchParams.get('category'));
    }
    const lastmod = entry.querySelector('lastmod');
    if (lastmod) assert(Number.isFinite(Date.parse(lastmod.textContent)));
    return loc;
  });
  assert.equal(new Set(urls).size, urls.length, 'Duplicate URLs');
  assert(urls.includes(`${origin}/`) && urls.includes(`${origin}/shop`));
  assert(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
  if (!live) {
    const htaccess = await readFile(new URL('.htaccess', directory), 'utf8');
    assert(htaccess.indexOf('%{REQUEST_FILENAME} -f') < htaccess.indexOf('RewriteRule ^ index.html'));
    assert(htaccess.includes('R=404,END'));
  }
  console.log(`Validated ${urls.length} unique public URLs, valid sitemap XML and robots.txt (${live ? origin : fileURLToPath(directory)}).`);
  dom.window.close();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Sitemap validation failed.');
  process.exitCode = 1;
}
