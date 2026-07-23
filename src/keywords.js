'use strict';
const fs = require('fs');
const path = require('path');

const DICT_DIR = path.join(__dirname, '..', 'data', 'dictionaries');

function loadDictionaries() {
  const files = fs.readdirSync(DICT_DIR).filter(f => f.endsWith('.json'));
  return files.map(f => JSON.parse(fs.readFileSync(path.join(DICT_DIR, f), 'utf8')));
}

function getDictionary(id) {
  const dicts = loadDictionaries();
  return dicts.find(d => d.id === id) || null;
}

function listDictionarySummaries() {
  return loadDictionaries().map(d => ({
    id: d.id, name: d.name, description: d.description, compliance: d.compliance,
    categoryCount: d.categories.length
  }));
}

/**
 * 依据站点配置，构建目录结构 + 长尾关键词。
 * 返回: { dict, categories: [{ name, listings: [{ keyword, longtail: [] }] }] }
 */
function buildSitePlan(site) {
  const dict = getDictionary(site.dictId);
  if (!dict) throw new Error('字典不存在: ' + site.dictId);

  const perCat = Math.max(1, parseInt(site.listingsPerCategory, 10) || 8);
  const perKw = Math.max(1, parseInt(site.longtailPerKeyword, 10) || 5);
  const modifiers = dict.modifiers.longtail;

  const categories = dict.categories.map(cat => {
    const seeds = (cat.seeds || []).slice();
    // 若站点提供了额外种子词，均匀混入
    if (site.extraSeeds && site.extraSeeds.length) {
      site.extraSeeds.forEach((s, i) => { if (i % cat.seeds.length === 0) seeds.push(s); });
    }
    const picked = seeds.slice(0, perCat);
    const listings = picked.map(kw => {
      // 组合长尾词：种子词 + 修饰词，去重并截取
      const seen = new Set();
      const longtail = [];
      modifiers.forEach(m => {
        const t = `${kw}${m}`;
        if (!seen.has(t)) { seen.add(t); longtail.push(t); }
      });
      // 随机化截取，使每个站/每次生成略有差异（仍是真实可搜的词）
      const shuffled = longtail.sort(() => 0); // 稳定
      return { keyword: kw, longtail: shuffled.slice(0, perKw) };
    });
    return { name: cat.name, listings };
  });

  return { dict, categories };
}

/**
 * 导出所有长尾词为纯文本字典（用于站长做词库/拓词）。
 */
function exportKeywordDictionary(site) {
  const plan = buildSitePlan(site);
  const lines = [];
  plan.categories.forEach(cat => {
    lines.push(`# ${cat.name}`);
    cat.listings.forEach(l => {
      lines.push(l.keyword);
      l.longtail.forEach(t => lines.push(t));
    });
    lines.push('');
  });
  return lines.join('\n');
}

module.exports = { loadDictionaries, getDictionary, listDictionarySummaries, buildSitePlan, exportKeywordDictionary };
