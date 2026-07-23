'use strict';
const fs = require('fs');
const path = require('path');
const seo = require('./seo');

const DICT_DIR = path.join(__dirname, '..', 'data', 'dictionaries');
const MANIFEST_FILE = path.join(__dirname, '..', 'data', 'manifest.json');

// 确定性哈希，用于相关词选取的"稳定随机"
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h;
}

function loadDictionaries() {
  return fs.readdirSync(DICT_DIR).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(DICT_DIR, f), 'utf8')));
}
function getDictionary(id) {
  return loadDictionaries().find(d => d.id === id) || null;
}
function listDictionarySummaries() {
  return loadDictionaries().map(d => ({
    id: d.id, name: d.name, description: d.description, compliance: d.compliance,
    categoryCount: (d.categories || []).length
  }));
}

// 冗余/歧义检测：若两个词互为子串，组合后会产生重复或语义不清，跳过
function overlaps(a, b) {
  return a.includes(b) || b.includes(a);
}

/**
 * 枚举字典中所有"语义明确"的合法组合，输出 manifest。
 * 规则：
 *  - 每个 base 单独成词（degree 1，作为规范页）
 *  - 与单个槽位值组合（degree 2）
 *  - 与两个不同槽位集的值组合（degree 3，杜绝同类槽位叠加造成的歧义）
 *  - 组合成员间不得互为子串，保证清晰无歧义
 *  - slug 全局唯一；冲突时追加序号消歧
 */
function buildManifest(config) {
  const dict = getDictionary(config.dictId);
  if (!dict) throw new Error('字典不存在: ' + config.dictId);
  const slots = dict.slots || {};
  const entries = {};
  const byCat = {};
  const seenKw = new Set();
  let total = 0;
  let skipped = 0;

  function commit(kw, cat, deg, parts, types) {
    if (seenKw.has(kw)) { skipped++; return; }
    seenKw.add(kw);
    let slug = seo.slugify(kw);
    let i = 1;
    const baseSlug = slug;
    while (entries[slug]) slug = baseSlug + '-' + (i++);
    entries[slug] = { kw, cat, deg, parts, ptypes: types || [] };
    (byCat[cat] = byCat[cat] || []).push(slug);
    total++;
  }

  (dict.categories || []).forEach(cat => {
    const use = cat.use || [];
    const bases = cat.bases || [];
    // degree 1：基础词
    bases.forEach(b => commit(b, cat.name, 1, [], []));
    // degree 2：base + 单槽位
    use.forEach(sk => {
      const vals = slots[sk] || [];
      bases.forEach(b => vals.forEach(v => {
        if (overlaps(b, v)) return;
        commit(`${b} ${v}`, cat.name, 2, [v], [sk]);
      }));
    });
    // degree 3：base + 两不同槽位（避免同类槽位叠加 -> 永不出现"双十一 618"这种矛盾）
    for (let i = 0; i < use.length; i++) {
      for (let j = i + 1; j < use.length; j++) {
        const va = slots[use[i]] || [];
        const vb = slots[use[j]] || [];
        bases.forEach(b => va.forEach(a => vb.forEach(c => {
          if (overlaps(b, a) || overlaps(b, c) || overlaps(a, c)) return;
          commit(`${b} ${a} ${c}`, cat.name, 3, [a, c], [use[i], use[j]]);
        })));
      }
    }
  });

  const manifest = {
    dictId: dict.id,
    dictName: dict.name,
    compliance: dict.compliance || '',
    total,
    skipped,
    builtAt: new Date().toISOString(),
    byCat,
    entries
  };
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest), 'utf8');
  return manifest;
}

function readManifest() {
  if (!fs.existsSync(MANIFEST_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')); }
  catch (e) { return null; }
}

// 确保 manifest 存在且与当前字典一致；否则重建
function ensureManifest(config) {
  const m = readManifest();
  if (m && m.dictId === config.dictId && m.total > 0) return m;
  return buildManifest(config);
}

function getEntry(m, slug) { return (m && m.entries[slug]) || null; }

// 同分类内的相关词（稳定选取，用于内链关键词叠加）
function relatedSlugs(m, cat, excludeSlug, n) {
  const arr = (m && m.byCat[cat]) || [];
  const out = [];
  if (!arr.length) return out;
  const seed = hash(excludeSlug || cat);
  for (let k = 0; k < arr.length && out.length < n; k++) {
    const sl = arr[(seed + k * 131) % arr.length];
    if (sl !== excludeSlug) out.push(sl);
  }
  return out;
}

// 分类名 -> slug 反查
function catSlugToName(m, catSlug) {
  if (!m) return null;
  const names = Object.keys(m.byCat);
  const hit = names.find(n => seo.slugify(n) === catSlug);
  return hit || null;
}

// 导出全部组合词为纯文本词库
function exportKeywordDictionary(m) {
  if (!m) return '';
  const lines = [];
  Object.keys(m.byCat).forEach(cat => {
    lines.push(`# ${cat}（${m.byCat[cat].length}）`);
    m.byCat[cat].forEach(slug => {
      const e = m.entries[slug];
      if (e) lines.push(e.kw);
    });
    lines.push('');
  });
  return lines.join('\n');
}

module.exports = {
  loadDictionaries, getDictionary, listDictionarySummaries,
  buildManifest, readManifest, ensureManifest,
  getEntry, relatedSlugs, catSlugToName, exportKeywordDictionary,
  MANIFEST_FILE
};
