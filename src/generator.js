'use strict';
const fs = require('fs');
const path = require('path');
const content = require('./content');
const seo = require('./seo');
const combo = require('./combo');

const OUT_ROOT = path.join(__dirname, '..', 'output');

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function encodeSlug(slug) { return encodeURIComponent(slug); }

// 页脚全分类导航：让每个页面都链向所有分类枢纽，形成密集内部关联
function catNav(site, m) {
  if (!m) return '';
  const cats = Object.keys(m.byCat)
    .map(cat => `<a href="cat-${encodeSlug(seo.slugify(cat))}.html">${seo.escapeHtml(cat)}</a>`)
    .join('<span class="sep"> · </span>');
  return `<nav class="footcats"><a href="index.html">首页</a><span class="sep"> · </span>${cats}</nav>`;
}

function strHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

// 跨分类"热门频道"：从其他分类稳定选取若干入口，打破分类孤岛、增强内部关联
function crossCategoryLinks(m, slug, cat) {
  const cats = Object.keys(m.byCat).filter(c => c !== cat);
  if (!cats.length) return [];
  const seed = strHash(slug);
  const out = [];
  const seen = new Set();
  const nCats = Math.min(3, cats.length);
  for (let i = 0; i < nCats; i++) {
    const c = cats[(seed + i * 7) % cats.length];
    const arr = m.byCat[c] || [];
    if (!arr.length) continue;
    for (let j = 0; j < 2; j++) {
      const sl = arr[(seed + i * 53 + j * 17) % arr.length];
      if (sl !== slug && !seen.has(sl)) { seen.add(sl); out.push(sl); }
    }
  }
  return out;
}

function renderLayout(site, page, bodyHtml, footerExtra) {
  const nav = `<nav class="top"><a href="index.html">${seo.escapeHtml(site.name)}</a></nav>`;
  const footer = `<footer>
${footerExtra || ''}
<p>${seo.escapeHtml(site.name)} · 聚焦${seo.escapeHtml(site.dictName || '')}方向 · 内容仅供参考，参与前请认准官方渠道</p></footer>`;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<link rel="stylesheet" href="style.css" />
${seo.metaTags(site, page)}
</head>
<body>
${nav}
<main>
${bodyHtml}
</main>
${footer}
</body>
</html>`;
}

function renderHome(site, m) {
  const intro = content.buildHomeIntro(site, m.dictName, m.total);
  const cats = Object.keys(m.byCat).map(cat => {
    const cslug = seo.slugify(cat);
    return `<li><a href="cat-${encodeSlug(cslug)}.html">${seo.escapeHtml(cat)}</a>（${m.byCat[cat].length}）</li>`;
  }).join('');

  // 最新收录：每个分类取前 3 个词，确定性展示
  const latest = [];
  Object.keys(m.byCat).slice(0, 8).forEach(cat => {
    m.byCat[cat].slice(0, 3).forEach(slug => {
      const e = m.entries[slug];
      latest.push(`<li><a href="${encodeSlug(slug)}.html">${seo.escapeHtml(e.kw)}</a></li>`);
    });
  });

  const body = `
<section class="hero">
  <h1>${seo.escapeHtml(site.name)}</h1>
  <p class="tag">${seo.escapeHtml(site.tagline || '')}</p>
  <p>${seo.escapeHtml(intro)}</p>
</section>
<section>
  <h2>分类导航（${Object.keys(m.byCat).length} 类 / 共 ${m.total} 词）</h2>
  <ul class="cat-list">${cats}</ul>
</section>
<section>
  <h2>最新收录</h2>
  <ul class="latest">${latest.join('')}</ul>
</section>
${seo.jsonLd({ '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, description: site.tagline || '' })}
`;
  return renderLayout(site, { title: site.name + ' - ' + (site.tagline || ''), description: site.tagline }, body, catNav(site, m));
}

function renderCategory(site, m, cat) {
  const cslug = seo.slugify(cat);
  const count = (m.byCat[cat] || []).length;
  const intro = content.buildCategoryIntro(cat, site, count);
  const sample = (m.byCat[cat] || []).slice(0, 80); // 分类页展示样本，完整词见 sitemap
  const items = sample.map(slug => {
    const e = m.entries[slug];
    return `<li class="card"><a href="${encodeSlug(slug)}.html"><strong>${seo.escapeHtml(e.kw)}</strong></a></li>`;
  }).join('');
  const more = count > sample.length ? `<p class="muted">本分类共 ${count} 个相关词，完整列表见 <a href="sitemap-${encodeSlug(cslug)}.xml">sitemap-${seo.escapeHtml(cslug)}.xml</a>（供搜索引擎抓取）。</p>` : '';
  // 相关分类：链向其他分类枢纽，强化分类间内部关联
  const relCats = Object.keys(m.byCat).filter(c => c !== cat).slice(0, 8)
    .map(c => `<li><a href="cat-${encodeSlug(seo.slugify(c))}.html">${seo.escapeHtml(c)}</a></li>`).join('');

  const body = `
<nav class="crumbs"><a href="index.html">首页</a> › ${seo.escapeHtml(cat)}</nav>
<section>
  <h1>${seo.escapeHtml(cat)}</h1>
  <p>${seo.escapeHtml(intro)}</p>
  <ul class="grid">${items}</ul>
  ${more}
</section>
<section class="relcats">
  <h2>相关分类</h2>
  <ul class="cat-list">${relCats}</ul>
</section>
<a class="back" href="index.html">← 返回首页</a>
${seo.jsonLd({ '@context': 'https://schema.org', '@type': 'CollectionPage', name: cat })}
`;
  return renderLayout(site, { title: cat + ' - ' + site.name, description: intro, path: '/cat-' + encodeSlug(cslug) + '.html' }, body, catNav(site, m));
}

// 爬虫触发时即时渲染单条组合词页面（写入磁盘后可被静态直出）
function renderListingOnDemand(site, m, slug, entry) {
  const c = content.buildListing(entry.kw, entry.cat, site, entry.parts, entry.ptypes);
  const relSlugs = combo.relatedSlugs(m, entry.cat, slug, 22);
  const related = relSlugs.map(s => {
    const e = m.entries[s];
    return `<li><a href="${encodeSlug(s)}.html">${seo.escapeHtml(e.kw)}</a></li>`;
  }).join('');
  const crossSlugs = crossCategoryLinks(m, slug, entry.cat);
  const crossHtml = crossSlugs.map(s => {
    const e = m.entries[s];
    return `<li><a href="${encodeSlug(s)}.html">${seo.escapeHtml(e.kw)}</a></li>`;
  }).join('');
  const partsTags = (entry.parts || []).map(p => `<span class="tag">${seo.escapeHtml(p)}</span>`).join('');
  const banner = c.complianceBanner ? `<div class="warn">${seo.escapeHtml(c.complianceBanner)}</div>` : '';
  const cslug = seo.slugify(entry.cat);

  const howHtml = c.body.how.map(s => `<li>${seo.escapeHtml(s)}</li>`).join('');
  const notesHtml = c.body.notes.map(s => `<li>${seo.escapeHtml(s)}</li>`).join('');
  const faqHtml = c.body.faq.map(([q, a]) => `<div class="qa"><p class="q">Q: ${seo.escapeHtml(q)}</p><p class="a">A: ${seo.escapeHtml(a)}</p></div>`).join('');
  const channelsHtml = c.body.channels.map(s => `<li>${seo.escapeHtml(s)}</li>`).join('');
  const mistakesHtml = c.body.mistakes.map(s => `<li>${seo.escapeHtml(s)}</li>`).join('');

  const body = `
<nav class="crumbs"><a href="index.html">首页</a> › <a href="cat-${encodeSlug(cslug)}.html">${seo.escapeHtml(entry.cat)}</a> › ${seo.escapeHtml(entry.kw)}</nav>
<section class="listing">
  <h1>${seo.escapeHtml(c.title)}</h1>
  ${banner}
  <div class="tags">${partsTags}</div>
  <h2>什么是${seo.escapeHtml(entry.kw)}</h2>
  <p>${seo.escapeHtml(c.body.what)}</p>
  <h2>为什么值得关注</h2>
  <p>${seo.escapeHtml(c.body.why)}</p>
  <h2>常见优惠类型</h2>
  <p>${seo.escapeHtml(c.body.types)}</p>
  <h2>适合人群</h2>
  <p>${seo.escapeHtml(c.body.who)}</p>
  <h2>时间节奏</h2>
  <p>${seo.escapeHtml(c.body.rhythm)}</p>
  <h2>主要渠道</h2>
  <ul>${channelsHtml}</ul>
  <h2>省钱示例</h2>
  <p>${seo.escapeHtml(c.body.example)}</p>
  <h2>参与要点</h2>
  <p>${seo.escapeHtml(c.body.extra)}</p>
  <h2>怎么参与</h2>
  <ol>${howHtml}</ol>
  <h2>注意事项</h2>
  <ul>${notesHtml}</ul>
  <h2>常见误区</h2>
  <ul>${mistakesHtml}</ul>
  <h2>常见问题</h2>
  ${faqHtml}
</section>
<aside>
  <h3>相关推荐（关键词互相叠加）</h3>
  <ul class="related">${related}</ul>
  <h3>热门频道（跨分类推荐）</h3>
  <ul class="related cross">${crossHtml}</ul>
  <a class="back" href="cat-${encodeSlug(cslug)}.html">← 返回${seo.escapeHtml(entry.cat)}</a>
</aside>
${seo.jsonLd({
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: c.body.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } }))
})}
`;
  return renderLayout(site, { title: c.title, description: c.meta, path: '/' + encodeSlug(slug) + '.html' }, body, catNav(site, m));
}

// 预生成：首页 + 分类页 + robots + style（列表页按需即时生成）
function generateStatic(site, m) {
  site.dictName = m.dictName;
  const siteOut = OUT_ROOT;
  ensureDir(siteOut);
  fs.writeFileSync(path.join(siteOut, 'index.html'), renderHome(site, m), 'utf8');
  Object.keys(m.byCat).forEach(cat => {
    const cslug = seo.slugify(cat);
    fs.writeFileSync(path.join(siteOut, `cat-${cslug}.html`), renderCategory(site, m, cat), 'utf8');
  });
  fs.writeFileSync(path.join(siteOut, 'robots.txt'), seo.robotsTxt(site.domain), 'utf8');
  const cssSrc = path.join(__dirname, '..', 'public', 'style.css');
  if (fs.existsSync(cssSrc)) fs.copyFileSync(cssSrc, path.join(siteOut, 'style.css'));
  return { pages: 1 + Object.keys(m.byCat).length, total: m.total, categories: Object.keys(m.byCat).length };
}

function sitemapIndex(site, m) {
  const base = site.domain ? `https://${site.domain}` : '';
  const items = Object.keys(m.byCat).map(cat => {
    const cslug = seo.slugify(cat);
    return `  <sitemap><loc>${base}/sitemap-${encodeSlug(cslug)}.xml</loc></sitemap>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</sitemapindex>
`;
}

function sitemapForCategory(site, m, cat) {
  const base = site.domain ? `https://${site.domain}` : '';
  const items = (m.byCat[cat] || []).map(slug => `  <url><loc>${base}/${encodeSlug(slug)}.html</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</urlset>
`;
}

module.exports = {
  generateStatic, renderListingOnDemand, renderHome, renderCategory,
  sitemapIndex, sitemapForCategory, OUT_ROOT
};
