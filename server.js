'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const gen = require('./src/generator');
const combo = require('./src/combo');
const seo = require('./src/seo');

const PORT = process.env.PORT || 3100;
const ROOT = __dirname;
const OUT = gen.OUT_ROOT;
const PUBLIC = path.join(ROOT, 'public');
const CONFIG_FILE = path.join(ROOT, 'config.json');
const STATS_FILE = path.join(ROOT, 'data', 'gen-stats.json');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};

function readConfig() { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
function writeConfig(o) { fs.writeFileSync(CONFIG_FILE, JSON.stringify(o, null, 2), 'utf8'); }
function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
function serveFile(res, filePath, type) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) { send(res, 404, 'Not found'); return; }
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || type || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

// 内存缓存：manifest 与已生成计数（manifest 仅首次加载/重建时解析 11MB）
let M = null;
let GENERATED = 0;
try { if (fs.existsSync(STATS_FILE)) GENERATED = (JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')).generated) || 0; } catch (e) { GENERATED = 0; }

function ensure() {
  if (!M) M = combo.ensureManifest(readConfig());
  return M;
}
function persistStats() {
  try { fs.writeFileSync(STATS_FILE, JSON.stringify({ generated: GENERATED }), 'utf8'); } catch (e) {}
}

// 把请求路径映射到 output 下的相对路径（兼容 /output/ 前缀别名）
function localRel(pathname) {
  if (pathname.startsWith('/output/')) return pathname.slice('/output/'.length);
  return pathname;
}

const server = http.createServer((req, res) => {
  const u = url.parse(req.url, true);
  const p = u.pathname;
  const m = ensure();

  if (p.startsWith('/api/')) {
    if (p === '/api/config' && req.method === 'GET') return send(res, 200, readConfig());
    if (p === '/api/dictionaries' && req.method === 'GET') return send(res, 200, combo.listDictionarySummaries());
    if (p === '/api/config' && req.method === 'POST') {
      let body = ''; req.on('data', c => body += c);
      req.on('end', () => {
        try { const cfg = JSON.parse(body); cfg.id = ''; writeConfig(cfg); M = combo.ensureManifest(cfg); GENERATED = 0; persistStats(); gen.generateStatic(cfg, M); send(res, 200, { ok: true }); }
        catch (e) { send(res, 400, { error: e.message }); }
      });
      return;
    }
    if (p === '/api/generate' && req.method === 'POST') {
      try { const r = gen.generateStatic(readConfig(), M); send(res, 200, r); } catch (e) { send(res, 500, { error: e.message }); }
      return;
    }
    if (p === '/api/build-manifest' && req.method === 'POST') {
      try {
        const cfg = readConfig();
        M = combo.buildManifest(cfg);
        gen.generateStatic(cfg, M);
        send(res, 200, { ok: true, total: M.total, categories: Object.keys(M.byCat).length });
      } catch (e) { send(res, 500, { error: e.message }); }
      return;
    }
    if (p === '/api/stats' && req.method === 'GET') {
      return send(res, 200, { total: m.total, generated: GENERATED, categories: Object.keys(m.byCat).length, dictName: m.dictName });
    }
    if (p === '/api/keyworddict' && req.method === 'GET') {
      return send(res, 200, combo.exportKeywordDictionary(M), 'text/plain; charset=utf-8');
    }
    return send(res, 404, { error: 'unknown api' });
  }

  // 动态 sitemap 索引
  if (p === '/sitemap.xml') {
    return send(res, 200, gen.sitemapIndex(readConfig(), M), 'application/xml; charset=utf-8');
  }
  // 动态分类 sitemap（列出该分类全部组合词 URL，供爬虫抓取后触发按需生成）
  const sm = p.match(/^\/sitemap-(.+)\.xml$/);
  if (sm) {
    const catSlug = decodeURIComponent(sm[1]);
    const cat = combo.catSlugToName(M, catSlug);
    if (!cat) return send(res, 404, 'not found', 'application/xml; charset=utf-8');
    return send(res, 200, gen.sitemapForCategory(readConfig(), M, cat), 'application/xml; charset=utf-8');
  }

  if (p === '/robots.txt') return serveFile(res, path.join(OUT, 'robots.txt'));

  // 站点首页与后台入口
  if (p === '/') return serveFile(res, path.join(OUT, 'index.html'));
  if (p === '/admin' || p === '/admin.html') return serveFile(res, path.join(PUBLIC, 'admin.html'));

  // 内容路由：先查静态文件，未命中则按需即时生成
  const rel = decodeURIComponent(localRel(p));
  const rawFile = path.join(OUT, rel);
  if (fs.existsSync(rawFile) && !fs.statSync(rawFile).isDirectory()) return serveFile(res, rawFile);

  // 仅处理 .html（列表页/分类页的按需生成）
  if (!p.endsWith('.html')) return send(res, 404, 'Not found');

  // 归一化 slug：保证"同一个关键词"无论请求形式如何，都对应唯一文件（避免副本/路径冲突）
  const slug = seo.slugify(rel.replace(/^\/+/, '').replace(/\.html$/, '').replace(/\/$/, ''));
  const filePath = path.join(OUT, slug + '.html');
  if (fs.existsSync(filePath)) return serveFile(res, filePath); // 已按需生成过 → 静态直出

  // 分类页按需
  if (slug.startsWith('cat-')) {
    const cat = combo.catSlugToName(M, slug.slice(4));
    if (cat) {
      const html = gen.renderCategory(readConfig(), M, cat);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, html, 'utf8');
      return send(res, 200, html, 'text/html; charset=utf-8');
    }
    return send(res, 404, 'Not found');
  }

  // 列表页按需：命中 manifest 即即时生成并落盘，下次静态直出
  const entry = combo.getEntry(M, slug);
  if (entry) {
    const html = gen.renderListingOnDemand(readConfig(), M, slug, entry);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, html, 'utf8');
    GENERATED++;
    persistStats();
    return send(res, 200, html, 'text/html; charset=utf-8');
  }

  return send(res, 404, 'Not found');
});

server.listen(PORT, () => {
  const m = ensure();
  gen.generateStatic(readConfig(), m); // 启动即预生成首页/分类/robots/style
  console.log(`单站点目录生成器已启动: http://localhost:${PORT} | 词库规模: ${m.total}`);
});
