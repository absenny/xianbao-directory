'use strict';
// 全量静态构建：生成首页/分类页/robots/style + 全部 sitemap + 全部列表页
// 用于纯静态托管部署（远程无 Node 服务时，列表页需预先落盘）
const fs = require('fs');
const path = require('path');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const combo = require('./src/combo');
const gen = require('./src/generator');
const seo = require('./src/seo');

const m = combo.ensureManifest(config);
const site = Object.assign({}, config, { dictName: m.dictName });

// 1) 预生成骨架（首页/分类页/robots/style）
const r = gen.generateStatic(site, m);
console.log('骨架页:', JSON.stringify(r));

// 2) sitemap 索引 + 各分类 sitemap
fs.writeFileSync(path.join(gen.OUT_ROOT, 'sitemap.xml'), gen.sitemapIndex(site, m));
Object.keys(m.byCat).forEach(cat => {
  fs.writeFileSync(
    path.join(gen.OUT_ROOT, `sitemap-${seo.slugify(cat)}.xml`),
    gen.sitemapForCategory(site, m, cat)
  );
});
console.log('sitemap 索引 + 分类 sitemap 已生成');

// 3) 全部列表页（这是"上万个静态页面"的主体）
const slugs = Object.keys(m.entries);
let n = 0;
const t0 = Date.now();
for (const slug of slugs) {
  const e = m.entries[slug];
  const html = gen.renderListingOnDemand(site, m, slug, e);
  fs.writeFileSync(path.join(gen.OUT_ROOT, slug + '.html'), html, 'utf8');
  n++;
  if (n % 5000 === 0) console.log(`  已生成 ${n}/${slugs.length} ...`);
}
console.log(`列表页生成完成: ${n} 个, 耗时 ${(Date.now() - t0) / 1000}s`);
console.log(`总计静态文件(含骨架/sitemap): ${n + r.pages + Object.keys(m.byCat).length + 1}`);
