'use strict';

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function metaTags(site, page) {
  const title = escapeHtml(page.title || site.name);
  const desc = escapeHtml(page.description || site.tagline || '');
  const canonical = (site.domain ? `https://${site.domain}` : '') + (page.path || '/');
  return `<title>${title}</title>
  <meta name="description" content="${desc}" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:type" content="website" />`;
}

function jsonLd(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
}

function sitemap(urls) {
  const items = urls.map(u => `  <url><loc>${escapeHtml(u)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`;
}

function robotsTxt(domain) {
  const base = domain ? `https://${domain}` : '';
  return `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`;
}

function slugify(s) {
  return String(s).trim().toLowerCase()
    .replace(/[\s/]+/g, '-')
    .replace(/[^\w一-龥-]/g, '')
    .replace(/-+/g, '-').replace(/^-|-$/g, '') || 'item';
}

module.exports = { escapeHtml, metaTags, jsonLd, sitemap, robotsTxt, slugify };
