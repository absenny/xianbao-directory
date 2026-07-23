'use strict';

const knowledge = require('./knowledge');

// 确定性哈希：同一关键词每次生成内容稳定，不同关键词内容各异
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h;
}
function pick(arr, seed) { return arr[((seed % arr.length) + arr.length) % arr.length]; }
function pickSome(arr, seed, n) {
  const out = [];
  const seen = new Set();
  let s = (seed >>> 0);
  let guard = 0;
  while (out.length < n && guard < arr.length * 3) {
    const idx = (((s + out.length * 7 + guard * 3) % arr.length) + arr.length) % arr.length;
    if (!seen.has(idx)) { seen.add(idx); out.push(arr[idx]); }
    guard++;
  }
  return out;
}

// 时间/节点类修饰词，用于写"时效性"段落
const TIME_TOKENS = new Set(['2026最新', '今日', '本周', '本月', '双十一', '618', '年货节', '开学季', '双十二', '五一大促', '国庆大促', '限时', '今日更新', '实时推送', '最新', '预告', '蹲一个']);

// 通用句库：跨分类复用，靠 {kw} 代入关键词；每池多写几句以增强多样性
const SENTENCES = {
  what: [
    '{kw}是围绕该主题的优惠与参与方式汇总，帮用户以更低的成本获得同等权益或服务。',
    '关于{kw}，核心是把活动规则、领取路径与到账周期一次讲清，避免踩坑。',
    '{kw}属于日常可参与的实惠渠道，关键在于认准官方入口与活动时间。',
    '简单说，{kw}就是把分散在各平台的同类优惠聚合起来，方便按需取用。',
    '{kw}的价值在于"信息差"——提前知道、按规则操作，几乎是无门槛的实惠来源。',
    '理解{kw}，本质是先看清"优惠从哪来、规则怎么定、自己是否符合"，再决定是否参与。',
    '对多数用户而言，{kw}不是一夜暴富的渠道，而是把日常开销一点点省下来的积累方式。'
  ],
  why: [
    '把它纳入日常清单，能稳定降低相关品类的开销，积少成多。',
    '相比临时凑单，提前掌握{kw}的节奏，往往能赶上力度更大的节点活动。',
    '很多用户忽略{kw}，其实只要按规则参与，几乎零成本就能省下一笔。',
    '{kw}的好处是确定性高：规则透明、入口官方，参与风险低。',
    '围绕{kw}做长期跟踪，更容易抓到平台的大额放量与限时加码。',
    '把{kw}当作习惯而非偶然动作，省下的钱会在两个月后变得明显。',
    '{kw}最容易被低估的地方在于：单笔省得少，但一年几十次叠加就很可观。'
  ],
  how: [
    '进入对应平台官方活动页，确认自己符合参与资格与地域/账户限制。',
    '按页面提示完成领取或报名，注意保存活动截图与订单凭证。',
    '在到账周期内核对权益是否到位，若未到账及时联系官方客服。',
    '把{kw}相关活动加入日历提醒，避免错过短期窗口。',
    '先小额试参与，确认规则与到账无误后再加大投入。',
    '关注平台App站内信与官方公告，部分加码只在站内推送。',
    '对比同类型多个入口（官方 App、支付平台、银行活动），选当前力度最大的一条路径。',
    '参与前截图活动规则页，万一与到账不符可作为申诉依据。'
  ],
  note: [
    '只走官方入口，凡要求先转账、先交押金再返利的说法都需警惕。',
    '留意活动有效期与名额限制，部分优惠先到先得。',
    '保护好个人账户与验证码，不要向他人泄露，也不要代他人刷单。',
    '涉及银行卡或支付绑定，请确认是平台官方收单，而非个人收款码。',
    '同一活动勿用非正规手段批量操作，以免被风控限制参与资格。',
    '跨平台比价后再参与，避免被"伪优惠"误导。',
    '把优惠当作锦上添花，不要为用券而买不需要的东西，否则反而多花。',
    '大额参与前先算清楚"实付 = 原价 - 优惠 - 运费"，别被面额迷惑。'
  ],
  faq: [
    ['{kw}需要付费才能参与吗？', '正规渠道通常免费，凡要交会员费、押金、解冻费的一律视为风险信号。'],
    ['{kw}多久到账？', '到账以活动规则为准，多数在达成条件后数小时至数日内，逾期联系官方客服。'],
    ['一个账号能多次参与吗？', '一般按活动规则限制，以页面说明为准，切勿使用非正规手段批量操作。'],
    ['如何确认活动真实有效？', '认准平台官方域名与App内活动入口，谨慎对待群聊转发、私信推送的链接。'],
    ['{kw}和活动页面写的不一样怎么办？', '以平台官方活动页实时规则为准，本页仅作整理参考，不构成参与承诺。'],
    ['{kw}和普通优惠有什么不同？', '区别在于聚合与节奏：把分散的同类优惠集中呈现，并提示最佳参与时点。'],
    ['没抢到 {kw} 的大额券怎么办？', '多数活动会循环放量，关注整点、会员日与次轮，不必为一两次错过焦虑。']
  ]
};

function buildListing(keyword, category, site, parts, ptypes) {
  const seed = hash(keyword + '|' + category);
  const title = `${keyword} - ${category}实用攻略与参与入口`;
  const meta = `${keyword}是什么、怎么参与、有哪些注意事项？本站整理${category}方向的${keyword}原创攻略、避坑要点、省钱示例与官方入口。`;

  const kn = knowledge.knowledgeFor(category);

  // 通用段：扩容提升长度与多样性
  const what = pickSome(SENTENCES.what, seed, 3).map(s => s.replace('{kw}', keyword)).join('');
  const why = pickSome(SENTENCES.why, seed >>> 3, 3).map(s => s.replace('{kw}', keyword)).join('');
  const howSteps = pickSome(SENTENCES.how, seed >>> 5, 4 + (seed % 2)); // 4~5 步
  const notes = pickSome(SENTENCES.note, seed >>> 7, 4 + (seed % 2)); // 4~5 条
  const faqRaw = pickSome(SENTENCES.faq, seed >>> 9, 4 + (seed % 2)).map(([q, a]) => [q.replace('{kw}', keyword), a.replace('{kw}', keyword)]);

  // 分类专属"常青知识"：让不同分类读起来有差异、有营养
  const types = pickSome(kn.types, seed >>> 11, 2).join('');
  const who = pickSome(kn.who, seed >>> 13, 2).join('');
  const rhythm = pickSome(kn.rhythm, seed >>> 15, 2).join('');
  const channels = pickSome(kn.channels, seed >>> 17, Math.min(4, kn.channels.length));
  const example = pickSome(kn.example, seed >>> 19, 2).join('');
  const mistakes = pickSome(kn.mistakes, seed >>> 21, 3);

  // 组合部件驱动的"时效/渠道"段落，保证不同组合内容各异且贴合关键词
  const timePart = (parts || []).find((p, i) => (ptypes || [])[i] === 'modifier' && TIME_TOKENS.has(p));
  const platPart = (parts || []).find((p, i) => (ptypes || [])[i] === 'platform');
  const scenePart = (parts || []).find((p, i) => (ptypes || [])[i] === 'scene');
  const actionPart = (parts || []).find((p, i) => (ptypes || [])[i] === 'action');

  let extra = '';
  if (timePart) extra += `就时效而言，${timePart}通常是平台放量更集中的窗口，建议提前把${keyword}加入提醒，避免错过短期加码。`;
  if (platPart) extra += `从渠道看，${platPart}是该方向最常被使用的参与入口，认准${platPart}官方App或站内活动页更稳妥。`;
  if (scenePart) extra += `本页也覆盖了${scenePart}场景下的参与要点，不同场景的规则与额度可能略有差异，以页面说明为准。`;
  if (actionPart && actionPart !== '攻略') extra += `如果你想看更具体的${actionPart}，下文已按步骤拆解，照做即可。`;
  if (!extra) extra = `本词为基础词，建议同时参考同分类下的组合词（如带平台、时间、场景的版本）以获取更细的参与路径。`;

  const body = {
    what, why,
    types, who, rhythm, channels, example,
    extra,
    how: howSteps,
    notes,
    mistakes,
    faq: faqRaw
  };

  const complianceBanner = site.dictId === 'wangzhuan'
    ? '风险提示：凡是要求先垫资、先交会员费、拉人头返利的一律是诈骗。本站只收录合规透明渠道，参与前请认准官方入口。'
    : null;

  return { title, meta, keyword, category, body, complianceBanner };
}

function buildCategoryIntro(categoryName, site, count) {
  const seed = hash(categoryName);
  const lines = pickSome([
    `${categoryName}汇总了当前可参与的实惠渠道与活动节点（共整理 ${count} 个相关词），建议结合自身需求择优参与。`,
    `在${categoryName}方向，节奏比力度更重要——提前关注往往比临时凑单更划算，本页已按关键词聚合。`,
    `${categoryName}内容持续更新，重点标注官方入口与有效期，降低踩坑概率。`,
    `${categoryName}覆盖基础词与"平台/时间/场景"组合词，方便按自身情况精准检索。`
  ], seed, 1);
  return lines[0].replace('{count}', count);
}

function buildHomeIntro(site, dictName, total) {
  const seed = hash(site.name + dictName);
  const lines = pickSome([
    `${site.name}聚焦${dictName}方向，已整理 ${total} 个可检索的优惠关键词（含组合词），帮你把日常开销省下来。`,
    `这里按分类汇总${dictName}相关活动与线报，所有内容均标注来源与有效期，理性参与。`,
    `${site.name}是一个${dictName}目录站，目标是让优惠信息更透明、更好找，关键词之间互相索引以增强检索。`
  ], seed, 1);
  return lines[0];
}

module.exports = { buildListing, buildCategoryIntro, buildHomeIntro };
