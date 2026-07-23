'use strict';
const path = require('path');
const combo = require('./src/combo');

const cfgFile = path.join(__dirname, 'config.json');
const cfg = JSON.parse(require('fs').readFileSync(cfgFile, 'utf8'));
const m = combo.buildManifest(cfg);
console.log(`字典: ${m.dictName} (${m.dictId})`);
console.log(`分类数: ${Object.keys(m.byCat).length}`);
console.log(`组合词总数: ${m.total}`);
console.log(`去重跳过: ${m.skipped}`);
console.log(`manifest: ${combo.MANIFEST_FILE}`);
