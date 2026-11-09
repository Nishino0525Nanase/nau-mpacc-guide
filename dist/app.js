/* Buildless, relative-path application for GitHub Pages. No network calls except site data. */
(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const app = $('#app');
  const header = $('.site-header');
  const updateHeaderOffset = () => document.documentElement.style.setProperty('--header-offset', `${Math.ceil(header.getBoundingClientRect().height) + 8}px`);
  updateHeaderOffset();
  if ('ResizeObserver' in window) new ResizeObserver(updateHeaderOffset).observe(header);
  else window.addEventListener('resize', updateHeaderOffset, {passive:true});
  const dialog = $('#detail-dialog');
  const state = { data: null, view: 'mentors', query: '', direction: '', savedOnly: false, reviewCoverage: '', internGroup: '', internCity: '', internStatus: 'current', postQuery: '', postTopic: '', postCategory: '', postLimit: 20, chapter: 'life-01', saved: {}, compareIds: [], dialogType: '', contactMentorId: '', contactMode: 'outline', contactEdits: {}, postCodes: {}, lastFocus: null, lastFocusId: null };
  const icons = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10.6" cy="10.6" r="6.8"/><path d="m16 16 5 5"/></svg>',
    bookmark: '<svg viewBox="0 0 18 22" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M3 2h12v18l-6-4-6 4z"/></svg>'
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const array = value => Array.isArray(value) ? value : value == null ? [] : [value];
  const textOf = value => typeof value === 'object' && value !== null ? (value.text || value.label || value.value || value.summary || JSON.stringify(value)) : String(value ?? '');
  const normalize = value => String(value || '').toLocaleLowerCase().replace(/\s/g, '');
  const emit = (action, extra = {}) => window.dispatchEvent(new CustomEvent('nau:action', { detail: { action, view: state.view, ...extra } }));
  const validUrl = value => { try { const url = new URL(value, window.location.href); return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
  const external = (url, label, className = '') => { const safe = validUrl(url); return safe ? `<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer"${className ? ` class="${className}"` : ''}>${label}</a>` : label; };
  const source = code => state.data.sourceRegistry?.[code];
  const screenshotPath = value => typeof value === 'string' && /^\.\/evidence\/(?:xhs|refresh-20261110)\/[A-Za-z0-9][A-Za-z0-9_-]{0,160}\.(?:png|jpe?g|webp)$/i.test(value) ? value : '';
  const screenshotSource = value => {
    if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return '';
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
  };

  function screenshotItems(items, defaultSourceUrl = '') {
    const seen = new Set();
    return array(items).filter(item => {
      if (!item || typeof item !== 'object' || !screenshotPath(item.src) || seen.has(item.src)) return false;
      seen.add(item.src);
      return true;
    }).map(item => ({...item, src:screenshotPath(item.src), sourceUrl:screenshotSource(item.sourceUrl) || screenshotSource(defaultSourceUrl)}));
  }

  function postScreenshots(post) {
    const codes = [...new Set([...array(post.sourceIds), ...array(state.postCodes[post.id])])];
    return screenshotItems([...array(post.screenshots), ...codes.flatMap(code => array(source(code)?.screenshots))], post.url || post.canonicalUrl);
  }

  function screenshotsHtml(items, defaultSourceUrl = '') {
    const shots = screenshotItems(items, defaultSourceUrl);
    if (!shots.length) return '';
    const dimension = (value, fallback) => Number.isInteger(value) && value >= 1 && value <= 16000 ? value : fallback;
    return `<section class="evidence-screenshots" aria-label="来源页面与评论截图"><div class="evidence-screenshots-heading"><h4>来源页面与评论截图</h4><span>${shots.length} 张 · 点图查看原图</span></div><div class="evidence-screenshots-grid">${shots.map((item, index) => {
      const caption = textOf(item.caption || `截图 ${index + 1}`);
      const scope = array(item.scope).map(textOf).filter(Boolean).join('；') || '仅保留画面中可见的内容，未展示部分仍需打开原帖核对。';
      return `<figure class="evidence-shot"><div class="evidence-shot-media"><a class="evidence-shot-open" href="${esc(item.src)}" target="_blank" rel="noopener noreferrer" aria-label="${esc('查看截图原图：' + caption)}"><img class="evidence-shot-thumb" src="${esc(item.src)}" alt="${esc(item.alt || caption)}" width="${dimension(item.width, 1200)}" height="${dimension(item.height, 900)}" loading="lazy" decoding="async" data-evidence-shot></a><span class="evidence-shot-fallback" hidden>截图暂时无法载入，请打开下方原帖核对。</span></div><figcaption><strong>${esc(caption)}</strong><p><span>截图范围：</span>${esc(scope)}</p><div class="evidence-shot-links"><a href="${esc(item.src)}" target="_blank" rel="noopener noreferrer">查看原图 ↗</a>${item.sourceUrl ? external(item.sourceUrl, '打开原帖 ↗') : ''}</div></figcaption></figure>`;
    }).join('')}</div></section>`;
  }

  document.addEventListener('error', event => {
    const image = event.target;
    if (image?.matches?.('img[data-life-image]')) {
      const media = image.closest('.life-photo-media');
      const link = media?.querySelector('.life-photo-open');
      const fallback = media?.querySelector('.life-photo-fallback');
      if (link) link.hidden = true;
      if (fallback) fallback.hidden = false;
      return;
    }
    if (!image?.matches?.('img[data-evidence-shot]')) return;
    const media = image.closest('.evidence-shot-media');
    const link = media?.querySelector('.evidence-shot-open');
    const fallback = media?.querySelector('.evidence-shot-fallback');
    if (link) link.hidden = true;
    if (fallback) fallback.hidden = false;
  }, true);
  const directionName = id => state.data.directions.find(d => d.id === id)?.label || id;
  const shortDirection = id => ({ G1: '智能会计与智能财务', G2: '管理会计与内部控制', G3: '资本市场与财务管理', G4: '政府会计与国家治理', G5: '注会审计与财会监督', G6: '大数据审计与会计智能化' }[id] || directionName(id));
  const isSaved = id => Object.prototype.hasOwnProperty.call(state.saved, id);

  function inline(value) {
    if (value && typeof value === 'object') {
      if (value.url) return external(value.url, inline(value.label || value.text || value.url));
      return inline(textOf(value));
    }
    return esc(value).replace(/\n/g, '<br>').replace(/\[([^\[\]]+)\]/g, (whole, inner) => {
      const codes = inner.split(/[\s、,，;；]+/).filter(Boolean);
      const expanded = [];
      for (const code of codes) {
        const range = code.match(/^([A-Z]*)(\d+)[—–-]([A-Z]*)(\d+)$/);
        if (range && (range[1] === range[3] || !range[3]) && +range[4] - +range[2] < 15) {
          for (let i = +range[2]; i <= +range[4]; i++) expanded.push(range[1] + String(i).padStart(range[2].length, '0'));
        } else expanded.push(code);
      }
      if (!expanded.length || !expanded.every(c => source(c))) return whole;
      return expanded.map(c => {
        const s = source(c), url = validUrl(s.url || s.originalUrl || s.canonicalUrl);
        return url ? `<a class="citation" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc((s.title || s.label || c) + (s.date ? ' · ' + s.date : ''))}">[${esc(c)}]</a>` : `[${esc(c)}]`;
      }).join('');
    });
  }

  function blockHtml(block) {
    if (!block) return '';
    if (block.type === 'screenshots') return screenshotsHtml(block.items, block.sourceUrl);
    if (block.type === 'heading') {
      const tag = block.level >= 3 ? 'h4' : 'h3';
      return `<${tag}>${inline(block.text)}</${tag}>`;
    }
    if (block.type === 'details') return `<details class="source-disclosure"><summary>${inline(block.text || '展开查看')}</summary><div>${array(block.blocks).map(blockHtml).join('')}</div></details>`;
    if (block.type === 'table') return `<div class="table-scroll" role="region" aria-label="${esc(array(block.headers).map(textOf).join('、'))}" tabindex="0"><table class="content-table"><thead><tr>${array(block.headers).map(h => `<th scope="col">${inline(h)}</th>`).join('')}</tr></thead><tbody>${array(block.rows).map(row => `<tr>${array(row).map(cell => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    if (block.type === 'source') return `<div class="source-link-block">${external(block.url, esc(block.text || block.title || '查看来源'))} <span aria-hidden="true">↗</span></div>`;
    if (block.type === 'list') return `<ul class="tip-list">${array(block.items).map(item => `<li>${inline(item)}</li>`).join('')}</ul>`;
    if (block.type === 'card') return '';
    if (block.type === 'toc') return '';
    return block.text ? `<p${block.small ? ' class="small-text"' : ''}>${inline(block.text)}</p>` : '';
  }

  function heading(kicker, title, description, count = '') {
    return `<div class="section-heading"><div><span class="small-label">${esc(kicker)}</span><h2>${esc(title)}</h2><p>${description}</p></div>${count ? `<div class="section-count">${count}</div>` : ''}</div>`;
  }

  function searchField(id, placeholder, value) {
    return `<div class="search-field">${icons.search}<label class="sr-only" for="${id}">${esc(placeholder)}</label><input type="search" id="${id}" placeholder="${esc(placeholder)}" value="${esc(value)}" autocomplete="off"><button class="search-clear" type="button" data-action="clear-search" data-input="${id}" aria-label="清空搜索"${value ? '' : ' hidden'}>×</button></div>`;
  }

  function emptyState(title, description, action = '') {
    return `<div class="empty-state"><div class="empty-mark" aria-hidden="true">⌕</div><h3>${esc(title)}</h3><p>${esc(description)}</p>${action}</div>`;
  }

  function saveButton(mentor, inDetail = false) {
    const saved = isSaved(mentor.id);
    return inDetail ? `<button type="button" class="button secondary" data-action="save" data-id="${esc(mentor.id)}" aria-pressed="${saved}">${icons.bookmark}${saved ? '已加入联系清单' : '加入联系清单'}</button>` : `<button type="button" class="save-button" data-action="save" data-id="${esc(mentor.id)}" aria-label="${saved ? '从联系清单移除' : '将'}${esc(mentor.name)}${saved ? '' : '加入联系清单'}" aria-pressed="${saved}" title="${saved ? '已加入联系清单' : '加入联系清单'}">${icons.bookmark}</button>`;
  }

  const compared = id => state.compareIds.includes(id);
  const comparedMentors = () => state.compareIds.map(id => state.data.mentors.find(m => m.id === id)).filter(Boolean);

  function compareButton(mentor) {
    const selected = compared(mentor.id);
    return `<button type="button" class="compare-toggle" data-action="compare-toggle" data-id="${esc(mentor.id)}" aria-pressed="${selected}" aria-label="${selected ? '从对比中移除' : '将'}${esc(mentor.name)}${selected ? '' : '加入对比'}">${selected ? '已选对比' : '加入对比'}</button>`;
  }

  function renderCompareBar() {
    const target = $('#mentor-tools');
    if (!target) return;
    const mentors = comparedMentors();
    target.innerHTML = `<div class="mentor-tools-heading"><div><strong>导师对比 <span>${mentors.length} / 3</span></strong><p>选两至三位，放在一起核对研究内容与证据。</p></div><div class="mentor-tools-actions"><button type="button" class="button" data-action="compare-open"${mentors.length < 2 ? ' disabled' : ''}>开始对比</button><button type="button" class="button secondary" data-action="contact-prepare">联系准备</button>${mentors.length ? '<button type="button" class="text-button" data-action="compare-clear">清空对比</button>' : ''}</div></div>${mentors.length ? `<div class="compare-selection" aria-label="已选对比导师">${mentors.map(m => `<button type="button" data-action="compare-toggle" data-id="${esc(m.id)}" aria-label="从对比中移除${esc(m.name)}">${esc(m.name)} <span aria-hidden="true">×</span></button>`).join('')}</div>` : ''}`;
  }

  function syncCompareButtons() {
    $$('[data-action="compare-toggle"].compare-toggle').forEach(button => {
      const mentor = state.data.mentors.find(m => m.id === button.dataset.id);
      if (!mentor) return;
      const selected = compared(mentor.id);
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label', selected ? `从对比中移除${mentor.name}` : `将${mentor.name}加入对比`);
      button.textContent = selected ? '已选对比' : '加入对比';
    });
  }

  function toggleCompare(id) {
    const mentor = state.data.mentors.find(m => m.id === id);
    if (!mentor) return;
    const index = state.compareIds.indexOf(id);
    if (index < 0 && state.compareIds.length >= 3) { notify('最多同时对比三位导师，请先移除一位。'); return; }
    if (index >= 0) state.compareIds.splice(index, 1);
    else state.compareIds.push(id);
    if (state.view === 'mentors') renderMentorResults();
    syncCompareButtons();
    if (state.dialogType === 'comparison') openComparison();
    notify(index >= 0 ? `已将${mentor.name}移出对比` : `已将${mentor.name}加入对比（${state.compareIds.length}/3）`);
  }

  function clearCompare() {
    state.compareIds = [];
    if (state.view === 'mentors') renderMentorResults();
    syncCompareButtons();
    if (state.dialogType === 'comparison') openComparison();
    notify('已清空本次对比');
  }

  function comparisonEvidence(mentor, official) {
    if (!official && mentor.studentReviews) return studentReviewSection(mentor, true);
    const entries = array(mentor.evidence).filter(e => official ? e.kind === 'official' && e.id !== `${mentor.id}-official` : e.kind !== 'official');
    if (!entries.length) return `<p class="compare-empty">${official ? '尚无单独的培养或教学实例；可继续核对教师主页。' : '尚未取得可归属的个人经历反馈，需向近年直系学生核实。'}</p>`;
    return entries.slice(0, 3).map(item => `<details class="compare-evidence"><summary>${esc(item.statusLabel || item.category || (official ? '官方记录' : '反馈线索'))}${item.date ? ` · ${esc(item.date)}` : ''}</summary><p class="compare-population">${esc(official ? '官方资料' : ({firsthand:'本人经历自述',secondhand:'二手转述',uncertain:'身份或细节待核实'}[item.kind] || '反馈线索'))} · ${esc(item.population || '接触身份未说明')}</p><p>${inline(item.text)}</p><p class="evidence-limit">${inline(item.limitations || '仅限该条来源描述的对象和情境，不能概括所有学生的体验。')}</p>${item.url ? external(item.url, '原始来源 ↗') : ''}</details>`).join('') + (entries.length > 3 ? `<p class="compare-empty">另有 ${entries.length-3} 条记录，可在完整资料中继续核对。</p>` : '');
  }

  const reviewStatusLabels = {
    mpacc_guidance: 'MPAcc指导亲历',
    guidance_unspecified: '指导经历 · 阶段未明',
    non_mpacc_guidance: '非MPAcc指导经历',
    course_only: '课程接触或二手线索',
    weak_mentions: '笼统提名 · 弱线索',
    not_found: '暂无可归属学生评价'
  };

  function dossierReviews(mentor) {
    return array(mentor.studentReviews?.reviews).filter(item => item && item.attribution?.status === 'confirmed');
  }

  function reviewStatus(mentor) {
    if (!mentor.studentReviews) return 'legacy';
    if (!dossierReviews(mentor).length) return 'not_found';
    const status = mentor.studentReviews.coverageStatus;
    return Object.prototype.hasOwnProperty.call(reviewStatusLabels, status) ? status : 'weak_mentions';
  }

  function reviewCoverageLabel(mentor) {
    const status = reviewStatus(mentor);
    if (status === 'legacy') return mentor.feedbackStatus || '个人评价待补充';
    if (status === 'not_found') return reviewStatusLabels.not_found;
    return mentor.studentReviews.coverageLabel || reviewStatusLabels[status];
  }

  function reviewFilterMatches(mentor) {
    if (!state.reviewCoverage) return true;
    const status = reviewStatus(mentor);
    if (state.reviewCoverage === 'has_records') return dossierReviews(mentor).length > 0;
    if (state.reviewCoverage === 'other_guidance') return ['guidance_unspecified','non_mpacc_guidance'].includes(status);
    return status === state.reviewCoverage;
  }

  function reviewSourceConcentrationHtml(mentors) {
    const posts = new Map();
    for (const review of mentors.flatMap(dossierReviews)) {
      let noteId = '';
      for (const value of [review.canonicalUrl, review.sourceUrl]) {
        try {
          const url = new URL(value);
          if (!['xiaohongshu.com', 'rednote.com'].includes(url.hostname.toLowerCase().replace(/^www\./, ''))) continue;
          const match = url.pathname.match(/\/(?:explore|discovery\/item)\/([a-f0-9]{24})(?:\/|$)/i);
          if (match) { noteId = match[1].toLowerCase(); break; }
        } catch (_) {}
      }
      if (!noteId) continue;
      if (!posts.has(noteId)) posts.set(noteId, {id:noteId, records:0, codes:new Set()});
      const post = posts.get(noteId);
      post.records++;
      for (const code of array(review.sourceIds)) if (/^[A-Z]\d{2,3}$/.test(code)) post.codes.add(code);
    }
    if (!posts.size) return '';
    const sorted = [...posts.values()].sort((a,b) => b.records-a.records || a.id.localeCompare(b.id));
    const records = sorted.reduce((sum, post) => sum+post.records, 0);
    const largest = sorted.slice(0,2);
    const concentration = largest.length === 2 ? `其中记录最多的两帖（${largest.map(post => esc([...post.codes].sort().join('／') || post.id.slice(-6).toUpperCase())).join('、')}）合计 <strong>${largest.reduce((sum, post) => sum+post.records,0)}</strong> 条。` : '';
    return `<p class="review-coverage-note">小红书相关记录 <strong>${records}</strong> 条，按帖子编号去重来自 <strong>${posts.size}</strong> 篇原帖。${concentration}全站 <strong>${array(state.data.socialPosts).length}</strong> 条社交索引还包含生活、背景与排除线索，不等于同数量的导师亲历来源；同帖多条记录、同人跟评不算独立口碑样本。</p>`;
  }

  function reviewCoverageHtml() {
    const mentors = state.data.mentors;
    if (!mentors.some(m => m.studentReviews)) return '';
    const withRecords = mentors.filter(m => dossierReviews(m).length).length;
    const direct = mentors.filter(m => reviewStatus(m) === 'mpacc_guidance').length;
    const aliases = [...new Set(array(state.data.ambiguousMentorAliases).flatMap(item => {
      if (item?.status === 'search_only') return [];
      const value = typeof item === 'string' ? item : item?.alias;
      if (typeof value !== 'string' || !/^[A-Za-z\s/／]+$/.test(value)) return [];
      return value.split(/[/／]+/).flatMap(part => {
        const words = part.trim().split(/\s+/).filter(Boolean);
        return words.length && words.every(word => word.length === 1) ? [words.join('')] : words;
      }).filter(alias => /^[A-Za-z]{1,6}$/.test(alias)).map(alias => alias.toUpperCase());
    }))];
    return `<section class="review-coverage" aria-label="逐位学生评价覆盖"><div><span class="small-label">STUDENT EXPERIENCES</span><h3>先看谁说了什么，再看推荐与提醒</h3><p>学生反馈按MPAcc指导、其他指导经历和课程接触分别标注，可用下方筛选查找。</p><p class="review-coverage-note">可归属记录表示评价指向的老师可确认；课程印象、转述、弱提名与指导亲历分别标注。</p></div><details class="alias-guide"><summary>缩写评价怎样归人</summary><p>拼音缩写只作检索线索。LH、WY在名录中都可能对应多位老师，需要原文全名、作者明确确认或可核对的上下文，才归到具体老师。</p>${aliases.length ? `<p>缩写线索：${aliases.map(esc).join('、')}。未确认内容不进入任何具体老师的评价。</p>` : '<p>未确认的缩写或只有姓氏的评论，保留为核实线索，不据此给老师作推荐或避雷结论。</p>'}</details></section>`;
  }

  function reviewFilterHtml() {
    if (!state.data.mentors.some(m => m.studentReviews)) return '';
    const options = [['','全部评价覆盖'],['has_records','有可归属记录'],['mpacc_guidance','明确MPAcc指导亲历'],['other_guidance','其他指导经历'],['course_only','课程接触或二手线索'],['weak_mentions','笼统提名／弱线索'],['not_found','暂无可归属评价']];
    return `<div class="review-filter"><label for="review-coverage">按学生评价筛选</label><select id="review-coverage">${options.map(([value,label]) => `<option value="${value}"${state.reviewCoverage === value ? ' selected' : ''}>${label}</option>`).join('')}</select><span>筛选的是证据类型，不是老师评分。</span></div>`;
  }

  function supportedReviewPoints(mentor, key) {
    const eligibility = key === 'recommendationPoints' ? 'eligibleForRecommendation' : 'eligibleForConcern';
    const ids = new Set(dossierReviews(mentor).filter(item => item.contextAssessment?.[eligibility] !== false).map(item => item.id).filter(Boolean));
    return array(mentor.studentReviews?.[key]).filter(point => point && typeof point === 'object' && point.text && array(point.reviewIds).some(id => ids.has(id)));
  }

  function reviewPointHtml(point) {
    const codes = array(point.sourceIds).filter(code => typeof code === 'string' && source(code));
    return `<li><p>${inline(point.text)}${codes.length ? ` ${inline('[' + codes.join('、') + ']')}` : ''}</p>${point.scope ? `<small>${inline(point.scope)}</small>` : ''}</li>`;
  }

  function studentReviewRecord(item, compact = false) {
    const experience = {guidance:'具体指导经历',course:'课程接触',general:'笼统提名或印象',interview:'学生访谈中的经历'}[item.experienceType] || '学生经历记录';
    const limits = array(item.limits).map(textOf).filter(Boolean).join('；');
    const readingScope = array(item.readingScope).map(textOf).filter(Boolean).join('；');
    const firsthandScope = array(item.firsthandScope).map(textOf).filter(Boolean).join('；');
    const hearsayParts = array(item.hearsayParts).map(textOf).filter(Boolean).join('；');
    const voice = item.firsthand === true ? (hearsayParts ? '本人经历自述 · 含转述（分开标注）' : '本人经历自述') : item.firsthand === false ? '转述／他人信息' : '亲历情况未明确';
    const tone = item.experienceType === 'general' && item.firsthand !== true
      ? (item.contextAssessment?.displayLabel || '仅提名／语气与身份待核')
      : ({positive:'正面体验',negative:'需重视的具体体验',mixed:'体验有利弊',neutral:'经历描述'}[item.polarity] || '经历描述');
    const identity = [item.degree || '专业／学位未说明',item.year ? `年级／经历年份：${textOf(item.year)}` : '年级／经历年份未说明',item.relationship || '与老师的接触关系未说明'];
    const codes = array(item.sourceIds).filter(code => typeof code === 'string' && source(code));
    return `<details class="student-review-record${compact ? ' compact' : ''}"><summary><span>${esc(experience)} · ${esc(tone)}</span><small>${esc(item.narrator || '评论者未记录')} · ${esc(item.date || '日期未显示')}</small></summary><div class="student-review-meta"><span>${esc(voice)}</span><p>${identity.map(esc).join(' · ')}</p>${firsthandScope ? `<p class="review-experience-scope"><strong>本人亲历范围：</strong>${inline(firsthandScope)}</p>` : ''}${hearsayParts ? `<p class="review-experience-scope"><strong>转述／朋友经历的部分：</strong>${inline(hearsayParts)}</p>` : ''}</div><p>${inline(item.text || item.summary || '')}</p>${array(item.specifics).length ? `<ul class="tip-list">${array(item.specifics).map(value => `<li>${inline(value)}</li>`).join('')}</ul>` : ''}<p class="review-attribution"><strong>归属依据：</strong>${item.attribution?.alias ? `原帖写法 ${esc(item.attribution.alias)}；` : ''}${inline(item.attribution?.reason || '原始材料明确指向这位老师。')}</p><p class="evidence-limit"><strong>适用边界：</strong>${inline(limits || '仅限记录中的具体身份、时间与经历，其他情况需另行核实。')}</p>${readingScope ? `<details class="review-reading-scope"><summary>材料范围</summary><p>${inline(readingScope)}</p></details>` : ''}${screenshotsHtml(item.screenshots, item.sourceUrl)}<div class="source-actions">${item.sourceUrl ? external(item.sourceUrl, esc(item.sourceTitle || '打开评价原始来源') + ' ↗') : ''}${codes.length ? inline('[' + codes.join('、') + ']') : ''}</div></details>`;
  }

  function studentReviewSection(mentor, compact = false) {
    const dossier = mentor.studentReviews;
    if (!dossier) {
      const feedback = array(mentor.evidence).filter(item => item.kind !== 'official');
      return `<section class="dialog-section student-review-section"><h3>${compact ? '' : '<span class="section-number">01</span>'}学生个人评价</h3><p class="dialog-content-intro">${esc(mentor.feedbackStatus || '个人评价待补充')}</p>${feedback.length ? feedback.map(renderEvidence).join('') : '<p class="review-gap">目前尚未取得可归属的学生个人体验。可先向近年直系学生了解具体指导过程。</p>'}</section>`;
    }
    const reviews = dossierReviews(mentor);
    const positive = supportedReviewPoints(mentor, 'recommendationPoints');
    const concerns = supportedReviewPoints(mentor, 'concerns');
    const questions = array(dossier.verificationQuestions).filter(Boolean);
    const gaps = array(dossier.gaps).filter(Boolean);
    if (compact) return `<div class="compare-student-reviews"><p class="review-coverage-badge">${esc(reviewCoverageLabel(mentor))}</p>${dossier.summary ? `<p>${inline(dossier.summary)}</p>` : ''}${positive.length ? `<h4>被推荐的具体理由</h4><ul class="review-point-list">${positive.map(reviewPointHtml).join('')}</ul>` : ''}${concerns.length ? `<h4>避雷与适配提醒</h4><ul class="review-point-list">${concerns.map(reviewPointHtml).join('')}</ul>` : ''}${reviews.length ? reviews.slice(0,2).map(item => studentReviewRecord(item,true)).join('') : '<p class="compare-empty">暂无可归属的学生个人评价，不能据此作口碑推荐或排除。</p>'}${reviews.length > 2 ? `<p class="compare-empty">另有 ${reviews.length-2} 条经历，见完整资料。</p>` : ''}${questions.length ? `<details class="review-questions"><summary>联系时需要核实的问题</summary><ul class="tip-list">${questions.map(item => `<li>${inline(item)}</li>`).join('')}</ul></details>` : ''}</div>`;
    return `<section class="dialog-section student-review-section" aria-label="学生个人评价"><h3><span class="section-number">01</span>学生个人评价</h3><p class="review-coverage-badge">${esc(reviewCoverageLabel(mentor))} · ${reviews.length} 条可归属记录</p>${dossier.summary ? `<p class="dialog-content-intro">${inline(dossier.summary)}</p>` : ''}${positive.length ? `<section class="review-assessment"><h4>被推荐的具体理由</h4><ul class="review-point-list">${positive.map(reviewPointHtml).join('')}</ul></section>` : '<p class="review-gap">现有个人体验材料不足以形成具体推荐理由，联系前可继续补证。</p>'}${concerns.length ? `<section class="review-assessment concerns"><h4>避雷与适配提醒 · 限定具体经历</h4><ul class="review-point-list">${concerns.map(reviewPointHtml).join('')}</ul></section>` : ''}${reviews.length ? `<div class="student-review-records"><h4>原文与评论 · 逐条看身份与过程</h4>${reviews.map(item => studentReviewRecord(item)).join('')}</div>` : '<p class="review-gap">暂无可归属的公开学生体验。官方论文、案例和课程记录在下方单独呈现。</p>'}${questions.length ? `<section class="review-questions"><h4>联系前向直系学生核实</h4><ul class="tip-list">${questions.map(item => `<li>${inline(item)}</li>`).join('')}</ul></section>` : ''}${gaps.length ? `<details class="review-gaps"><summary>还需核实的信息</summary><ul class="tip-list">${gaps.map(item => `<li>${inline(item)}</li>`).join('')}</ul></details>` : ''}</section>`;
  }

  function currentContact(mentor) {
    const fields = array(mentor.profileFields).filter(f => /联系方式|邮箱/.test(f.label || ''));
    const values = [...new Set([mentor.email, ...fields.map(f => textOf(f.value))].filter(value => typeof value === 'string' && value.trim()))];
    return `<p>${values.length ? values.map(contactHtml).join('<br>') : '当前公开联系方式未见，需核对教师主页。'}</p>${mentor.profileUrl ? external(mentor.profileUrl, '核对教师主页 ↗') : ''}`;
  }

  function openComparison() {
    const mentors = comparedMentors();
    if (mentors.length < 2) {
      openDialog('选导工具 / 本次对比', '<h2 id="dialog-title">导师对比</h2><p class="dialog-content-intro">请在导师卡片中选择两至三位，再一起核对资料。</p><button type="button" class="button secondary" data-action="compare-close">返回导师列表继续选择</button>', 'comparison');
      return;
    }
    const rows = [
      ['研究内容', m => `<p class="compare-directions">${m.directions.map(id => esc(shortDirection(id))).join(' · ')}</p><p>${inline(m.research || '研究方向未公开，需核实。')}</p>`],
      ['公开记录与作品', m => comparisonEvidence(m, true)],
      ['学生经历与边界', m => comparisonEvidence(m, false)],
      ['名额与联系顺位', m => `<p>${inline(m.quotaStatus || state.data.meta.quotaNote || '当年名额未公开，需核对本级双选通知并向导师确认。')}</p><p>我的联系顺位：${esc(state.saved[m.id] || '尚未加入联系清单')}</p>`],
      ['当前公开联系', currentContact],
      ['接着了解', m => `<div class="compare-cell-actions"><button type="button" class="text-button" data-action="mentor" data-id="${esc(m.id)}">查看${esc(m.name)}完整资料</button><button type="button" class="text-button" data-action="contact-prepare" data-id="${esc(m.id)}">联系准备：${esc(m.name)}</button></div>`]
    ];
    openDialog('选导工具 / 并排核对', `<h2 id="dialog-title">导师对比</h2><p class="dialog-content-intro">并排看研究内容、具体作品和反馈的接触身份，再决定下一步向谁了解。公开名单、获奖案例和课程体验各自保留适用范围。</p><p class="compare-scroll-note">表格可横向滚动；点开证据可看身份、限制与原始来源。</p><div class="mentor-compare-scroll" role="region" aria-label="导师并排对比表" tabindex="0"><table class="mentor-compare-table"><thead><tr><th scope="col">核对项目</th>${mentors.map(m => `<th scope="col"><strong>${esc(m.name)}</strong><small>${esc(m.title || '职称未公开')}</small><button type="button" class="text-button" data-action="compare-toggle" data-id="${esc(m.id)}" aria-label="从对比中移除${esc(m.name)}">移出对比</button></th>`).join('')}</tr></thead><tbody>${rows.map(([title, html]) => `<tr><th scope="row">${esc(title)}</th>${mentors.map(m => `<td>${html(m)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="source-actions"><button type="button" class="button secondary" data-action="compare-close">返回列表调整</button><button type="button" class="text-button" data-action="compare-clear">清空本次对比</button></div>`, 'comparison');
  }

  function contactPreparationText(mentor, mode) {
    const name = mentor?.name || '【导师姓名】';
    const research = mentor?.research || '【老师公开研究方向】';
    if (mode === 'draft') return `邮件标题：MPAcc导师联系咨询—【姓名】—【拟入学年级】\n\n${name}老师您好：\n\n我是【姓名】，目前【学校、专业及年级／拟入学项目】。我正在了解您公开介绍中的研究方向：${research}\n\n我准备进一步阅读【具体论文或案例名称及年份】，对【一个具体问题】比较感兴趣。希望结合【自己的真实课程、项目或实习背景；无则删除本句】，向您请教是否与您的近期工作契合。\n\n想请问您在【本级／年份】是否接收MPAcc学生，以及现阶段建议优先准备哪些文献、方法或数据。如方便，也想了解论文与实践训练的大致安排。\n\n附件为【一页简历及确有需要的材料】。感谢您抽空阅读，期待您的建议。\n\n祝工作顺利！\n【姓名】\n【联系方式】`;
    return `联系${name}前的准备提纲\n\n一、先核对\n□ 本级双选通知、导师资格及当年可选情况；公开名单不等于仍有名额。\n□ 当前教师主页和公开联系方式；旧页联系方式先核实。\n□ 公开研究方向：${research}\n□ 准备读的具体论文／案例：【名称、年份及一个想问的问题】。\n\n二、准备自己的材料\n□ 一页简历：【学校、专业、年级／拟入学项目、相关技能与真实经历】。\n□ 如对方需要，再补充【成绩、项目或实习材料】，核对内容真实且适合发送。\n□ 把兴趣缩小为【研究对象—具体问题—目前能取得的材料】。\n\n三、向老师了解\n□ 【本级／年份】是否接收MPAcc学生，后续正式双选怎样办理？\n□ 日常交流、组会、论文选题和反馈通常怎样安排？\n□ 论文数据、方法训练与实践项目通常如何获取和推进？\n□ 实习与课程、论文进度如何协调，有哪些需要提前沟通的事项？\n\n四、向近年直系学生核实\n□ 对方的专业、年级、实际指导关系及经历年份。\n□ 请对方举一次具体指导、修改或实习协调的例子，再判断适用性。\n\n最后检查\n□ 将【占位符】全部填写，只保留真实经历。\n□ 每封联系文字对应一位老师，保留合理回复时间，并记录下一步。`;
  }

  const contactEditKey = () => `${state.contactMentorId || 'generic'}:${state.contactMode}`;

  function openContactPreparation(id = '', mode = state.contactMode) {
    const mentor = state.data.mentors.find(m => m.id === id) || null;
    state.contactMentorId = mentor?.id || '';
    state.contactMode = mode === 'draft' ? 'draft' : 'outline';
    const key = contactEditKey();
    const text = Object.prototype.hasOwnProperty.call(state.contactEdits, key) ? state.contactEdits[key] : contactPreparationText(mentor, state.contactMode);
    openDialog('选导工具 / 联系准备', `<h2 id="dialog-title">联系导师前，先把问题准备具体</h2><p class="dialog-content-intro">先核对公开资料，再填写自己的真实信息。下面的文本可自行修改后使用。</p><label class="contact-mentor-label" for="contact-mentor">选择一位老师</label><select id="contact-mentor"><option value="">通用准备模板</option>${state.data.mentors.map(m => `<option value="${esc(m.id)}"${m.id === state.contactMentorId ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select>${mentor?.profileUrl ? `<p class="contact-source">${external(mentor.profileUrl, '核对这位老师的官方介绍 ↗')}</p>` : ''}<div class="contact-mode-switch" role="group" aria-label="联系准备文本类型"><button type="button" data-action="contact-mode" data-mode="outline" aria-pressed="${state.contactMode === 'outline'}">准备提纲</button><button type="button" data-action="contact-mode" data-mode="draft" aria-pressed="${state.contactMode === 'draft'}">联系草稿</button></div><label class="sr-only" for="contact-copy-text">联系准备文本</label><textarea id="contact-copy-text" class="contact-copy-text" rows="17">${esc(text)}</textarea><div class="contact-copy-actions"><button type="button" class="button" data-action="copy-contact">复制当前文本</button><span id="contact-copy-status" role="status" aria-live="polite">发送前请填写占位符，并核对研究内容与联系方式。</span></div>`, 'contact');
  }

  async function copyContactPreparation() {
    const field = $('#contact-copy-text', dialog);
    const status = $('#contact-copy-status', dialog);
    if (!field) return;
    try {
      if (!window.isSecureContext || !navigator.clipboard?.writeText) throw new Error('manual-copy');
      await navigator.clipboard.writeText(field.value);
      if (status) status.textContent = '已复制。发送前请填写占位符，并只保留真实经历。';
      notify('联系文本已复制');
    } catch (_) {
      field.focus();
      field.select();
      if (status) status.textContent = '文本已选中，请按 Ctrl/Cmd+C 或长按选区复制。';
      notify('文本已选中，可手动复制');
    }
  }

  function mentorCard(mentor) {
    const status = isSaved(mentor.id) ? `<span class="tag warm">${esc(state.saved[mentor.id])}</span>` : '';
    return `<article class="mentor-card"><div class="mentor-card-head"><div><h3 class="mentor-name">${esc(mentor.name)}${mentor.hasDetailedCard ? '<span class="core-label">核心资料卡</span>' : ''}</h3><p class="title-line">${esc(mentor.title || '职称未公开')} · 125300名单内</p></div>${saveButton(mentor)}</div><div class="tags">${mentor.directions.map((id, i) => `<span class="tag${i ? ' secondary' : ''}">${esc(shortDirection(id))}</span>`).join('')}${status}</div><p class="mentor-research">${esc(mentor.research || '研究方向未公开')}</p><div class="mentor-feedback"><span class="evidence-dot" aria-hidden="true"></span><span>${esc(reviewCoverageLabel(mentor))}</span></div><div class="mentor-card-actions"><button type="button" class="card-action" data-action="mentor" data-id="${esc(mentor.id)}"><span>查看资料与反馈</span><span aria-hidden="true">↗</span><span class="sr-only">：${esc(mentor.name)}</span></button>${compareButton(mentor)}</div></article>`;
  }

  function filteredMentors() {
    const query = normalize(state.query);
    return state.data.mentors.filter(m => (!state.direction || m.directions.includes(state.direction)) && (!state.savedOnly || isSaved(m.id)) && reviewFilterMatches(m) && (!query || normalize([m.name, m.research, m.title, m.summary, m.qualification, ...m.directions.map(directionName), ...array(m.profileFields).map(f => textOf(f.value))].join(' ')).includes(query)));
  }

  function renderMentorResults() {
    const mentors = filteredMentors();
    const results = $('#mentor-results');
    if (!results) return;
    $('#mentor-result-count').innerHTML = `找到 <strong>${mentors.length}</strong> 位导师${state.savedOnly ? ' · 我的联系清单' : ''}`;
    $('#mentor-result-order').textContent = '按官方名单原序 · 不构成排名';
    results.innerHTML = mentors.length ? mentors.map(mentorCard).join('') : emptyState(state.savedOnly ? '清单里暂时没有匹配的导师' : '没有找到匹配的导师', state.savedOnly ? '点击导师卡右上角的书签，将感兴趣的老师加入清单。清单仅保存在当前浏览器。' : '试试搜索姓名、预算、智能财务、公司治理等关键词，或切换方向。', '<button type="button" class="button secondary" data-action="reset-mentors">查看全部导师</button>');
    renderCompareBar();
    const filter = $('#saved-filter');
    if (filter) filter.innerHTML = `${icons.bookmark}我的清单${Object.keys(state.saved).length ? ` (${Object.keys(state.saved).length})` : ''}`;
  }

  function researchHighlightsHtml() {
    const highlights = array((state.data.meta.research102?.highlights?.length ? state.data.meta.research102 : state.data.meta.continueResearch || state.data.meta.appResearch || state.data.meta.round3Research)?.highlights).filter(item => item?.title && item?.text).slice(0, 4);
    if (!highlights.length) return '';
    return `<details class="research-updates"><summary>具体训练与学习安排</summary><div class="research-updates-grid">${highlights.map(item => {
      const text = textOf(item.text);
      const extraCodes = array(item.sourceCodes).filter(code => typeof code === 'string' && source(code) && !text.includes(code));
      return `<article><h3>${esc(item.title)}</h3><p>${inline(text + (extraCodes.length ? ` [${extraCodes.join('、')}]` : ''))}</p></article>`;
    }).join('')}</div></details>`;
  }

  function renderMentors() {
    app.innerHTML = heading('01 / MENTOR DIRECTORY', '先选方向，再了解具体的人', '六类研究主题，帮助你建立自己的了解顺序。研究方向看官方资料，相处与训练看具体经历；每条反馈都保留接触身份与年份。', `<strong>${state.data.mentors.length}</strong> 位导师 · ${state.data.mentorCards.length} 张核心卡`) + reviewCoverageHtml() + researchHighlightsHtml() +
      `<div class="notice">${esc(state.data.meta.directionNote)} <button type="button" class="text-button" data-action="guide" data-section="0">读懂方向与报名的关系 ↗</button></div><div class="toolbar">${searchField('mentor-search', '搜索导师姓名、研究方向或关键词', state.query)}<button id="saved-filter" type="button" class="save-filter" data-action="saved-only" aria-pressed="${state.savedOnly}">${icons.bookmark}我的清单</button></div><div class="filter-groups"><div class="filter-line" role="group" aria-label="按研究方向筛选"><button class="filter-chip direction-chip" type="button" data-action="direction" data-id="" aria-pressed="${!state.direction}">全部方向<small>${state.data.mentors.length}</small></button>${state.data.directions.map(d => `<button class="filter-chip direction-chip" type="button" data-action="direction" data-id="${esc(d.id)}" aria-pressed="${state.direction === d.id}">${esc(shortDirection(d.id))}<small>${state.data.mentors.filter(m => m.directions.includes(d.id)).length}</small></button>`).join('')}</div><div class="direction-note">${state.direction ? `${esc(state.direction)} · ${esc(directionName(state.direction))}。交叉归类可重复出现，不等同当年招生分组。` : '每位导师最多列两类，允许主方向与交叉方向；名录内不代表当年仍有名额。'}</div></div>${reviewFilterHtml()}<section class="mentor-tools" id="mentor-tools" aria-label="导师对比与联系准备"></section><div class="results-bar"><span id="mentor-result-count" role="status" aria-live="polite"></span><span id="mentor-result-order"></span></div><div class="mentor-grid" id="mentor-results"></div><section class="goal-section" aria-labelledby="goal-title"><span class="small-label">FIND YOUR STARTING POINT</span><h3 id="goal-title">从你想要的研究生生活出发</h3><div class="goal-grid">${state.data.targetProfiles.map(p => `<details class="goal-card"><summary>${esc(p.title.replace(/^希望/, ''))}</summary><div class="goal-content article-body">${array(p.blocks).map(blockHtml).join('') || `<p>${inline(p.summary)}</p>`}</div><div class="source-actions">${p.mentorIds.map(id => {const m = state.data.mentors.find(m => m.id === id); return m ? `<button class="text-button" type="button" data-action="mentor" data-id="${esc(id)}">${esc(m.name)} ↗</button>` : '';}).join('')}</div></details>`).join('')}</div><div class="guide-action-row"><button type="button" class="text-button" data-action="guide" data-section="3">名额、双选与备选方案 ↗</button><button type="button" class="text-button" data-action="guide" data-section="4">怎样写一封具体的联系邮件 ↗</button><span>清单保存在当前浏览器，可标记优先联系、备选或仅了解。</span></div></section>`;
    renderMentorResults();
  }

  function renderEvidence(item) {
    const official = item.kind === 'official';
    const labels = {official:'官方资料',firsthand:'本人经历自述',secondhand:'二手转述',uncertain:'身份或细节待核实'};
    return `<article class="evidence-card${official ? ' official' : ''}"><div class="evidence-type"><strong>${esc(item.statusLabel || labels[item.kind] || '待核实线索')}</strong><small>${esc(item.date || '时间未公开')}</small></div><div class="evidence-context">${esc(item.population || '接触身份未说明')}${item.author ? ` · ${esc(item.author)}` : ''}${item.category ? ` · ${esc(item.category)}` : ''}</div><p>${inline(item.text)}</p>${item.limitations ? `<p class="evidence-limit">适用边界：${inline(item.limitations)}</p>` : ''}${item.url ? external(item.url, '查看原始来源 ↗') : ''}</article>`;
  }

  function openMentor(id) {
    const m = state.data.mentors.find(m => m.id === id);
    if (!m) return;
    const card = state.data.mentorCards.find(c => c.mentorId === id);
    const fields = m.profileFields?.length ? m.profileFields : (card?.profileFields || card?.fields || []);
    const official = array(m.evidence).filter(e => e.kind === 'official');
    openDialog('导师资料 / ' + (m.hasDetailedCard ? '核心资料卡' : '补充了解名录'), `<div class="dialog-heading"><div><h2 id="dialog-title">${esc(m.name)}</h2><div class="dialog-subtitle">${esc(m.qualification || m.title)}</div></div>${saveButton(m)}</div><div class="tags">${m.directions.map((d,i) => `<span class="tag${i ? ' secondary' : ''}">${esc(d)} · ${esc(directionName(d))}</span>`).join('')}</div>${card?.reason || m.summary ? `<p class="dialog-content-intro">${inline(card?.reason || m.summary)}</p>` : ''}${studentReviewSection(m)}<section class="dialog-section"><h3><span class="section-number">02</span>公开信息</h3><dl class="profile-fields">${fields.filter(f => f.label !== '姓名').map(f => `<div class="profile-row"><dt>${esc(f.label)}</dt><dd>${f.label.includes('联系') ? contactHtml(f.value) : inline(f.value)}</dd></div>`).join('')}</dl><div class="source-actions">${array(m.links).map(link => external(link.url, esc(link.label || '官方来源') + ' ↗')).join('')}</div></section>${official.length ? `<section class="dialog-section"><h3><span class="section-number">03</span>官方记录与具名个案</h3><p class="review-coverage-note">公开成果和集体教学记录单独核对，不当作学生个人口碑。</p>${official.map(renderEvidence).join('')}</section>` : ''}<div class="quota-note"><strong>名额与联系：</strong>${inline(m.quotaStatus || state.data.meta.quotaNote)}</div><div class="save-control">${saveButton(m, true)}<label for="contact-status">联系顺位</label><select id="contact-status" data-id="${esc(m.id)}"${isSaved(m.id) ? '' : ' disabled'}>${['优先联系','备选','仅了解'].map(status => `<option${state.saved[m.id] === status ? ' selected' : ''}>${status}</option>`).join('')}</select></div><div class="mentor-detail-tools">${compareButton(m)}<button type="button" class="button secondary" data-action="contact-prepare" data-id="${esc(m.id)}">联系准备：${esc(m.name)}</button></div>`);
    emit('mentor_open', {id, name:m.name});
  }

  function contactHtml(value) {
    const raw = textOf(value);
    return inline(raw).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, email => `<a href="mailto:${esc(email)}">${esc(email)}</a>`);
  }

  const internStatusLabels = {program_open:'项目网申窗口开放',program_announced:'项目公告 · 开放待核',listing_seen:'列表线索 · 状态待核',entry_only:'长期入口 · 需筛岗位',closed:'该窗口已结束',historical:'历史参考',upcoming:'尚未开放'};
  const internKindLabels = {internship_program:'实习项目',job_listing:'岗位列表线索',channel:'投递渠道',organization_reference:'机构资料 · 非招聘公告',historical:'历史公告',graduate_recruitment:'正式校招 · 非实习',preparation_program:'校园预备项目 · 非实习'};
  const internText = value => Array.isArray(value) ? value.map(internText).filter(Boolean).join('；') : value && typeof value === 'object' ? internText(value.text || value.label || value.value || value.summary || value.title || '') : String(value ?? '');
  const internCitations = ids => {
    const codes = array(ids).filter(code => typeof code === 'string' && source(code));
    return codes.length ? inline('[' + [...new Set(codes)].join('、') + ']') : '';
  };
  const internWebUrl = value => {try {const url = new URL(value);return /^https?:$/.test(url.protocol) ? url.href : '';}catch{return '';}};
  const internLink = (url,label,className='') => internWebUrl(url) ? external(url,esc(label),className) : '';
  const internList = values => array(values).filter(Boolean).length ? `<ul class="tip-list">${array(values).filter(Boolean).map(value=>`<li>${inline(internText(value))}</li>`).join('')}</ul>` : '';

  const internStatusOf = resource => {
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(resource.deadlineDate || '') && resource.deadlineDate < today ? 'closed' : resource.status;
  };

  function internResourceMatches(resource) {
    const status = internStatusOf(resource);
    if (state.internStatus === 'current' && (['closed','historical'].includes(status) || ['historical','graduate_recruitment','preparation_program'].includes(resource.kind))) return false;
    if (state.internCity === '__channels__') {
      if (resource.kind !== 'channel' && resource.status !== 'entry_only') return false;
    } else if (state.internCity && !array(resource.cityTags).includes(state.internCity)) return false;
    if (state.internStatus === 'programs') return ['program_open','program_announced'].includes(status) && ['internship_program','job_listing'].includes(resource.kind);
    if (state.internStatus === 'listings') return status === 'listing_seen';
    if (state.internStatus === 'channels') return resource.kind === 'channel' || status === 'entry_only';
    if (state.internStatus === 'past') return ['closed','historical'].includes(status) || resource.kind === 'historical';
    if (state.internStatus === 'upcoming') return status === 'upcoming';
    return true;
  }

  function internResourceHtml(resource) {
    const statusCode = internStatusOf(resource);
    const status = statusCode === 'closed' ? internStatusLabels.closed : resource.statusLabel || internStatusLabels[statusCode] || '状态未确认';
    const kind = internKindLabels[resource.kind] || '资源记录';
    const cities = array(resource.cityTags).filter(Boolean);
    const fields = [
      ['招募对象',resource.eligibility],['每周出勤',resource.attendance],['时长／周期要求',resource.duration],
      ['项目实施期',resource.period],['网申窗口／开始',resource.applicationWindow],['投递截止',resource.deadline]
    ];
    const past = ['closed','historical'].includes(statusCode) || resource.kind === 'historical';
    const action = resource.kind === 'organization_reference' ? '查看企业官方资料' : past ? '查看历史公告' : resource.kind === 'graduate_recruitment' ? '查看正式校招原文' : statusCode === 'listing_seen' ? '打开列表核实岗位状态' : statusCode === 'upcoming' ? '查看项目安排' : resource.kind === 'channel' || statusCode === 'entry_only' ? '进入官方招聘渠道' : '核对项目与申请入口';
    return `<details class="intern-resource" data-intern-resource="${esc(resource.id || '')}"><summary><span><strong>${esc(resource.title || '招聘资源')}</strong><small>${esc(kind)} · ${esc(cities.join('、') || '原文未明确岗位城市')}</small></span><span class="intern-status ${past ? 'past' : statusCode === 'program_open' ? 'published' : ''}">${esc(status)}</span></summary><div class="intern-resource-body">${resource.summary ? `<p>${inline(resource.summary)}</p>` : ''}${resource.geographyNote ? `<p class="intern-geography">${inline(resource.geographyNote)}</p>` : ''}<dl class="intern-fields">${fields.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${value ? inline(internText(value)) : '原文未公布，申请前核对'}</dd></div>`).join('')}</dl>${array(resource.requirements).length ? `<h5>原文列出的要求</h5>${internList(resource.requirements)}` : ''}${array(resource.steps).length ? `<h5>怎样查看与申请</h5>${internList(resource.steps)}` : ''}${array(resource.limits).length ? `<div class="intern-limit">${internList(resource.limits)}</div>` : ''}${screenshotsHtml(resource.screenshots, resource.url)}<div class="intern-resource-actions">${internLink(resource.url,action,'button secondary')}${internCitations(resource.sourceIds)}</div>${resource.postedDate ? `<p class="intern-source-date">公告日期：${esc(resource.postedDate)}</p>` : ''}</div></details>`;
  }

  function internFirmHtml(firm, resources) {
    const offices = array(firm.officeRecords);
    const entries = array(firm.entryLinks);
    return `<section class="intern-firm" data-intern-firm="${esc(firm.id)}"><div class="intern-firm-heading"><div><span class="intern-group-label">${({big_four:'四大',domestic:'国内所',enterprise:'企业财务与内审'}[firm.group] || '其他机构')}</span><h4>${esc(firm.name)}</h4></div><span>${resources.length} 条匹配资源</span></div>${firm.summary ? `<p class="intern-firm-summary">${inline(firm.summary)}</p>` : ''}${entries.length ? `<div class="intern-entry-links">${entries.map(entry=>internLink(entry.url,entry.label || '官方招聘入口')).filter(Boolean).join('')}</div>` : ''}${resources.map(internResourceHtml).join('')}${offices.length ? `<details class="intern-firm-notes"><summary>办公室与申请前要问的问题</summary><p class="intern-office-note">办公地址用于了解机构所在地；实习项目可能驻客户现场或出差，须另外核实。</p>${offices.map(office=>`<p class="intern-office"><strong>${esc(office.city || '所在地未公布')}${office.branch ? ' · ' + esc(office.branch) : ''}</strong> ${inline(office.address || '地址待核')}${internCitations(office.sourceIds)}${array(office.limits).length ? `<small>${inline(internText(office.limits))}</small>` : ''}</p>`).join('')}${array(firm.questions).length ? `<h5>沟通前记下这些问题</h5>${internList(firm.questions)}` : ''}${array(firm.prep).length ? `<h5>准备方向</h5>${internList(firm.prep)}` : ''}</details>` : (array(firm.questions).length ? `<details class="intern-firm-notes"><summary>申请前要问的问题</summary>${internList(firm.questions)}</details>` : '')}</section>`;
  }

  function renderInternshipResults() {
    const target = $('#internship-results');
    if (!target) return;
    const firms = array(state.data.internships?.firms).filter(firm=>!state.internGroup || firm.group === state.internGroup).map(firm=>({firm,resources:array(firm.resources).filter(internResourceMatches).sort((a,b)=>Number(array(b.cityTags).includes('南京'))-Number(array(a.cityTags).includes('南京')))})).filter(item=>item.resources.length);
    const count = firms.reduce((sum,item)=>sum+item.resources.length,0);
    const label = $('#internship-result-count');
    if (label) label.textContent = `${firms.length} 家机构 · ${count} 条匹配资源；不是实时在招岗位数`;
    target.innerHTML = firms.length ? firms.map(({firm,resources})=>internFirmHtml(firm,resources)).join('') : emptyState('没有符合筛选条件的资源','城市筛选只采用原文明确列出的项目城市；办公室或全国入口不等同该城市有实习岗位。','<button type="button" class="text-button" data-action="reset-internships">清除实习筛选</button>');
  }

  function internshipSupportHtml(data) {
    const zones = array(data.commuteZones), notes = array(data.commuteNotes), channels = array(data.campusChannels), plan = array(data.applicationPlan), extra = array(data.expansionInstitutions);
    const commute = zones.length || notes.length ? `<section class="intern-support"><h3>把实习地点和生活安排一起看</h3><div class="intern-zones">${zones.map(zone=>`<details class="intern-zone"><summary>${esc(zone.title)}</summary>${zone.summary ? `<p>${inline(zone.summary)}</p>` : ''}${zone.route ? `<p><strong>路线核对：</strong>${inline(internText(zone.route))}</p>` : ''}${internList(zone.planningNotes)}${array(zone.limits).length ? `<p class="intern-small">${inline(internText(zone.limits))}</p>` : ''}${internCitations(zone.sourceIds)}</details>`).join('')}</div>${notes.map(note=>`<p class="intern-small">${inline(internText(note.text))} ${internCitations(note.sourceIds)}</p>`).join('')}</section>` : '';
    const campus = channels.length ? `<section class="intern-support"><h3>校内渠道与实践手续</h3>${channels.map(channel=>`<details class="intern-zone"><summary>${esc(channel.title)}</summary>${channel.statusLabel ? `<p class="intern-small">${inline(channel.statusLabel)}</p>` : ''}${channel.summary ? `<p>${inline(channel.summary)}</p>` : ''}${array(channel.limits).length ? `<p class="intern-small">${inline(internText(channel.limits))}</p>` : ''}<div class="intern-resource-actions">${internLink(channel.url,'核对校方原文')}${internCitations(channel.sourceIds)}</div></details>`).join('')}</section>` : '';
    const preparation = plan.length ? `<section class="intern-support"><h3>按自己的申请阶段准备</h3>${plan.map((step,index)=>`<details class="intern-plan"><summary><span>${String(index+1).padStart(2,'0')}</span>${esc(step.title)}</summary>${step.text ? `<p>${inline(step.text)}</p>` : ''}${internList(step.items)}<p class="intern-small">${step.origin === 'editorial' ? '具体门槛以岗位原文为准。' : '具体经历与适用范围见原始来源。'} ${internCitations(step.sourceIds)}</p></details>`).join('')}</section>` : '';
    const expansion = extra.length ? `<details class="intern-support intern-extra"><summary>校内合作机构与实践基地</summary><p class="intern-small">合作或实践基地记录用于拓展了解，不代表当前有名额，也不是校方推荐排序。</p>${extra.map(item=>`<p><strong>${esc(item.name)}</strong> ${inline(item.summary || '')} ${internLink(item.url,'原始记录')}${internCitations(item.sourceIds)}${item.statusDetail ? `<small>${inline(item.statusDetail)}</small>` : ''}${array(item.limits).length ? `<small>${inline(internText(item.limits))}</small>` : ''}</p>`).join('')}</details>` : '';
    return commute + campus + preparation + expansion;
  }

  function internshipHubHtml() {
    const data = state.data.internships;
    if (!data || !array(data.firms).length) return '';
    const firms = array(data.firms), resources = firms.flatMap(firm=>array(firm.resources));
    const cityOrder = city => ['南京','苏州','上海','杭州'].indexOf(city)+1 || 99;
    const cities = [...new Set(resources.flatMap(resource=>array(resource.cityTags)).filter(Boolean))].sort((a,b)=>cityOrder(a)-cityOrder(b) || a.localeCompare(b,'zh-CN'));
    const rulesHtml = array(data.rules).length ? `<details class="intern-reading-rules"><summary>申请前，先把这几项对齐</summary>${internList(data.rules)}</details>` : '';
    const select = (id,label,options,value) => `<div><label for="${id}">${esc(label)}</label><select id="${id}">${options.map(([key,text])=>`<option value="${esc(key)}"${key===value?' selected':''}>${esc(text)}</option>`).join('')}</select></div>`;
    return `<section class="internship-hub" aria-label="事务所与企业实习资源"><div class="intern-hub-intro"><span class="small-label">INTERNSHIP NOTEBOOK</span><h3>先找到渠道，再核对适合自己的项目</h3><p>${inline(data.intro || '从南京出发，分清项目、投递渠道和历史参考，再核对自己的年级与可出勤时间。')}</p><p class="intern-count"><strong>${firms.length}</strong> 家机构 · <strong>${resources.length}</strong> 条资源记录</p><p class="intern-small">条目包含实习项目、列表线索、长期入口与历史参考，不等于同数量的在招岗位。</p></div><div class="intern-scope">${inline(data.scopeNote || '办公室所在地与项目实际工作地点需要分别核对。')}${data.firmGroupNote ? `<p>${inline(data.firmGroupNote)}</p>` : ''}</div>${rulesHtml}<div class="intern-filters">${select('intern-group','机构类型',[['','全部机构'],['big_four','四大'],['domestic','国内所'],['enterprise','企业财务／内审']],state.internGroup)}${select('intern-city','原文明示的项目地区',[['','全部地域'],...cities.map(city=>[city,city]),['__channels__','仅看投递渠道']],state.internCity)}${select('intern-status','资源性质与状态',[['current','当前入口与项目'],['','全部资料（含往期）'],['programs','已发布的实习项目'],['listings','岗位列表 · 状态待核'],['channels','长期投递渠道'],['past','窗口已结束／历史参考'],['upcoming','尚未开放的项目']],state.internStatus)}</div><div class="results-bar"><span id="internship-result-count" role="status" aria-live="polite"></span><button type="button" class="text-button" data-action="reset-internships">清除实习筛选</button></div><div id="internship-results" class="intern-firms"></div>${internshipSupportHtml(data)}${data.sourceNote ? `<p class="intern-source-note">${inline(data.sourceNote)}</p>` : ''}</section>`;
  }

  function renderLife() {
    const chapters = state.data.lifeChapters;
    let chapter = chapters.find(c => c.id === state.chapter) || chapters[0];
    state.chapter = chapter.id;
    const i = chapters.indexOf(chapter);
    const hasInternships = Boolean(state.data.internships && array(state.data.internships.firms).length);
    const showInternships = hasInternships && chapter.id === 'life-09';
    const chapterBody = chapter.blocks.map(blockHtml).join('');
    const chapterImages = window.NAULifeImages?.renderChapter?.(chapter.id, state.data.lifeImageIndex) || '';
    const imageShortcut = array(state.data.lifeImageIndex?.entries).length ? '<div class="life-image-shortcut"><button type="button" class="text-button" data-action="life-images">图片与原帖索引 <span aria-hidden="true">↗</span></button><span>按章节找图片，点图查看原图与来源。</span></div>' : '';
    app.innerHTML = heading('02 / CAMPUS & GRADUATE LIFE', '在南审，慢慢把生活安顿好', '从入学与住宿，到课程、实习、论文和办事。以浦口校区为主，涉及本科、MAud、莫愁或历史年份的经验，在正文里分别说明。', `<strong>${chapters.length}</strong> 章 · 可逐条返回来源`) + `${imageShortcut}${hasInternships ? '<a class="intern-life-shortcut" href="#life/life-09"><span>实习准备</span>查看四大、国内所与企业财务内审资源 <span aria-hidden="true">↗</span></a>' : ''}<div class="life-mobile-index"><label for="mobile-chapter">选择章节</label><select id="mobile-chapter">${chapters.map(c => `<option value="${esc(c.id)}"${c.id === chapter.id ? ' selected' : ''}>${esc(c.title)}</option>`).join('')}</select></div><div class="life-layout"><aside class="chapter-sidebar"><div class="sidebar-label"><span>阅读目录</span><span>CONTENTS</span></div><nav aria-label="学习生活章节目录">${chapters.map(c => `<a class="chapter-link" href="#life/${esc(c.id)}"${c.id === chapter.id ? ' aria-current="page"' : ''}><span class="chapter-number">${String(c.number).padStart(2,'0')}</span><span>${esc(c.title.replace(/^第[一二三四五六七八九十十二]+章\s*/,''))}</span></a>`).join('')}</nav></aside><article class="article-panel" id="current-chapter"><div class="article-kicker">CHAPTER ${String(chapter.number).padStart(2,'0')} / ${String(chapters.length).padStart(2,'0')}</div><h2 class="article-title">${esc(chapter.title)}</h2>${chapterImages}<div class="article-body">${showInternships ? internshipHubHtml() + `<details class="intern-legacy-chapter"><summary>奖助、预算与原职业准备资料</summary>${chapterBody}</details>` : chapterBody}</div><nav class="chapter-pagination" aria-label="章节翻页">${i > 0 ? `<a href="#life/${esc(chapters[i-1].id)}"><small>← 上一章</small>${esc(chapters[i-1].title)}</a>` : '<span></span>'}${i < chapters.length-1 ? `<a href="#life/${esc(chapters[i+1].id)}"><small>下一章 →</small>${esc(chapters[i+1].title)}</a>` : '<span></span>'}</nav></article></div>`;
    if (showInternships) renderInternshipResults();
  }

  function socialCodes(post) {
    const short = state.postCodes[post.id] || array(post.sourceIds).filter(s => /^[A-Z]\d{2,3}$/.test(s));
    return short.length ? short.join(' / ') : post.id.slice(-7).toUpperCase();
  }

  function publicPosts() {
    return state.data.socialPosts.filter(post => !post.screenedOnly && !String(post.category || '').includes('排除') && post.category !== '仅筛选记录');
  }

  function filteredPosts() {
    const q = normalize(state.postQuery);
    return publicPosts().filter(p => (!state.postTopic || p.topic === state.postTopic) && (!state.postCategory || p.category === state.postCategory) && (!q || (/^[a-z]\d{2,3}$/.test(q) ? (state.postCodes[p.id] || []).some(code=>normalize(code)===q) : normalize([p.title,p.author,p.summary,p.population,p.campus,p.date,p.verificationStatus,...(state.postCodes[p.id] || []),...array(p.comments).map(c => textOf(c))].join(' ')).includes(q))));
  }

  function postCard(p) {
    const shots = postScreenshots(p);
    return `<article class="post-card"><div class="post-topline"><span class="post-platform">${esc(p.platform)} / ${esc(p.topic)}</span><span class="post-codes">${esc(socialCodes(p))}</span></div><h3 class="post-title">${esc(p.title)}</h3><div class="post-byline">${esc(p.author || '作者未记录')} · ${esc(p.date || '日期未显示')}</div><p class="post-summary">${esc(p.summary || '查看原始来源了解具体内容，并结合作者身份与年份使用。')}</p><div class="tags"><span class="tag${p.category.includes('排除') || p.screenedOnly ? ' secondary' : ' warm'}">${esc(p.category)}</span></div><div class="post-population">接触身份：${esc(p.population || '未说明')}${p.campus && p.campus !== '未说明' ? ` · ${esc(p.campus)}` : ''}</div>${shots.length ? `<p class="post-shot-count">附 ${shots.length} 张原帖／评论截图</p>` : ''}<div class="post-actions"><button type="button" data-action="post" data-id="${esc(p.id)}">${shots.length ? '展开截图与摘记' : '查看内容与来源'} <span aria-hidden="true">↗</span><span class="sr-only">：${esc(p.title)}</span></button>${external(p.url || p.canonicalUrl, '打开原帖 ↗')}</div></article>`;
  }

  function renderPostResults() {
    const posts = filteredPosts(), visible = posts.slice(0, state.postLimit);
    $('#post-result-count').innerHTML = `找到 <strong>${posts.length}</strong> 条来源`;
    $('#post-results').innerHTML = visible.length ? visible.map(postCard).join('') : emptyState('没有找到这类原帖', '换一个关键词，或清除主题与采用类别筛选。', '<button type="button" class="button secondary" data-action="reset-posts">查看全部原帖</button>');
    $('#post-load-more').innerHTML = posts.length > visible.length ? `<div class="load-more-wrap"><button class="button secondary" type="button" data-action="more-posts">再看 ${Math.min(20, posts.length-visible.length)} 条 <span aria-hidden="true">↓</span></button><span class="showing-note">已展示 ${visible.length} / ${posts.length} 条</span></div>` : visible.length ? `<div class="load-more-wrap"><span class="showing-note">已展示全部 ${posts.length} 条筛选结果</span></div>` : '';
  }

  function renderPosts() {
    const topics = [...new Set(publicPosts().map(p => p.topic).filter(Boolean))];
    const cats = [...new Set(publicPosts().map(p => p.category).filter(Boolean))];
    app.innerHTML = heading('03 / SOURCE NOTEBOOK', '建议的背后，是这些原始来源', '按主题查找校园生活、课程体验和选导参考。每条资料保留作者、日期与原始链接。', `<strong>${publicPosts().length}</strong> 条来源`) + `<div class="notice">${esc(state.data.meta.platformNote)} 社交平台原页可能需要登录，请结合来源日期和适用范围使用。</div><div class="posts-toolbar">${searchField('post-search','搜索标题、作者、来源编号或经历关键词',state.postQuery)}<div class="select-field"><label for="post-topic">内容主题</label><select id="post-topic"><option value="">全部主题</option>${topics.map(t => `<option${state.postTopic===t?' selected':''}>${esc(t)}</option>`).join('')}</select></div><div class="select-field"><label for="post-category">采用类别</label><select id="post-category"><option value="">全部类别</option>${cats.map(c => `<option${state.postCategory===c?' selected':''}>${esc(c)}</option>`).join('')}</select></div></div><div class="results-bar"><span id="post-result-count" role="status" aria-live="polite"></span><button type="button" class="text-button" data-action="reset-posts">清除筛选</button></div><div class="posts-grid" id="post-results"></div><div id="post-load-more"></div>`;
    renderPostResults();
  }

  function openPost(id) {
    const p = state.data.socialPosts.find(p => p.id === id);
    if (!p) return;
    const comments = array(p.comments);
    const shownScreenshots = new Set();
    const uniqueScreenshotsHtml = items => screenshotsHtml(screenshotItems(items, p.url || p.canonicalUrl).filter(item => {
      if (shownScreenshots.has(item.src)) return false;
      shownScreenshots.add(item.src);
      return true;
    }), p.url || p.canonicalUrl);
    openDialog('原帖摘记 / ' + socialCodes(p), `<div class="dialog-heading"><div><h2 id="dialog-title">${esc(p.title)}</h2><div class="dialog-subtitle">${esc(p.platform)} · ${esc(p.author || '作者未记录')} · ${esc(p.date || '日期未显示')}</div></div></div><div class="tags"><span class="tag warm">${esc(p.category)}</span><span class="tag secondary">${esc(p.topic)}</span></div><dl class="profile-fields"><div class="profile-row"><dt>接触身份</dt><dd>${esc(p.population || '未说明')}</dd></div><div class="profile-row"><dt>适用校区</dt><dd>${esc(p.campus || '未说明')}</dd></div><div class="profile-row"><dt>核实状态</dt><dd>${esc(p.verificationStatus || '见采用边界')}</dd></div>${p.promotion ? `<div class="profile-row"><dt>商业或导流线索</dt><dd>${esc(p.promotion)}</dd></div>` : ''}</dl><section class="dialog-section"><h3>内容要点</h3><p class="dialog-content-intro">${inline(p.summary || '本条只保留筛选范围，未形成可采用的具体内容。')}</p>${array(p.tips).length ? `<ul class="tip-list">${array(p.tips).map(t => `<li>${inline(t)}</li>`).join('')}</ul>` : ''}</section>${comments.length ? `<section class="dialog-section"><h3>可见评论与回复摘记</h3>${comments.map(c => typeof c === 'string' ? `<div class="comment-block"><p>${inline(c)}</p></div>` : `<div class="comment-block"><small>${esc(c.author || c.user || '评论者未记录')}${c.date_display || c.date ? ' · ' + esc(c.date_display || c.date) : ''}</small>${c.identity || c.stage ? `<small> · ${esc([c.identity,c.stage].filter(Boolean).join(' / '))}</small>` : ''}<p>${inline(c.text || c.summary || c.content || c)}</p>${c.assessment || c.limitation || c.limitations ? `<p class="evidence-limit">${inline(c.assessment || c.limitation || c.limitations)}</p>` : ''}${uniqueScreenshotsHtml(c.screenshots)}</div>`).join('')}</section>` : ''}${uniqueScreenshotsHtml(postScreenshots(p))}<section class="dialog-section"><h3>适用范围</h3><div class="evidence-note">${inline(p.reviewReason || '')}${p.limitations ? `<p>${inline(p.limitations)}</p>` : ''}</div>${array(p.readingScopes).length ? `<ul class="tip-list">${array(p.readingScopes).map(scope => `<li>${inline(scope)}</li>`).join('')}</ul>` : ''}</section><div class="source-actions">${external(p.url || p.canonicalUrl, '打开原帖 ↗', 'button secondary')}</div>`);
    emit('post_open', {id});
  }

  function renderDownloads() {
    const socialCount = publicPosts().length;
    const officialCount = array(state.data.officialEvidence).length;
    app.innerHTML = heading('04 / TAKE THE GUIDE WITH YOU', '下载一份，留给需要的时候', `Word 保留基础正文和导师卡片；Excel 提供原帖目录与官方补充证据。网页当前收录 ${socialCount} 条原帖与访谈，可逐条返回原始来源核对。`) + `<div class="download-grid">${state.data.downloads.map(d => `<article class="download-card"><div class="file-icon" aria-hidden="true">${esc(d.format.toUpperCase())}</div><h3>${esc(d.title)}</h3><p>${esc(d.format.toLowerCase() === 'xlsx' ? `原帖与官方补充证据目录；网页当前可查 ${socialCount} 条原帖与访谈${officialCount ? `、${officialCount} 条官方资料` : ''}，附适用人群与证据边界。` : d.description)}</p><a class="button" href="${esc(d.url)}" download data-download="${esc(d.id)}">下载${d.format.toLowerCase()==='docx'?' Word':' Excel'}文件 <span aria-hidden="true">↓</span></a><div class="download-meta">${esc(d.format.toUpperCase())}${d.bytes ? ` · ${Math.round(d.bytes/1024)} KB` : ''}</div></article>`).join('')}</div><section class="app-edition" aria-labelledby="app-edition-title"><div class="app-edition-heading"><span class="small-label">KEEP IT CLOSE</span><h3 id="app-edition-title">应用版</h3><p>将手记放到桌面或主屏幕，随时回来接着读。</p></div><div id="app-edition-cards" class="app-edition-grid"></div></section><div class="reading-notes"><h3>这份资料，怎样使用更顺手</h3><p><strong>选导之前：</strong>先看本级培养方向，再从导师名录中选出几位，逐条核对研究内容、训练方式与当年名额。联系清单可以帮助你保留第二顺位。</p><p><strong>读学生经历时：</strong>接触身份和具体过程比笼统的好评更有用。本科课程印象、朋友转述和往届MPAcc经历，分别能回答不同问题。</p><p><strong>准备入学时：</strong>先确认校区、楼栋与本级通知，再购置用品、安排实习和核对奖助；攻略中的来源编号都能回到相应公开页面。</p><p><strong>标注说明：</strong>“未公开”指本次整理未见可靠公开信息；“待核实”指身份、阶段或时效仍有缺口。两者均不等同于该事项不存在。</p></div>`;
    window.NAUEdition?.mount(state.data.meta.appEdition);
  }

  function openGuide(section) {
    const s = state.data.mentorGuideSections?.[Number(section)];
    if (!s) return;
    openDialog('选导阅读 / 操作建议', `<h2 id="dialog-title" class="article-title">${esc(s.title)}</h2><div class="article-body">${s.blocks.map(blockHtml).join('')}</div>`);
    emit('guide_open', {id:s.id});
  }

  function openShortLetter() {
    const page = $('#short-letter-template');
    if (!page?.innerHTML.trim()) return;
    const copy = page.innerHTML.replace('<h3>', '<h2 id="dialog-title">').replace('</h3>', '</h2>');
    openDialog('纸页背面', `<article class="quiet-letter-page">${copy}<div class="letter-page-turn"><button type="button" class="text-button letter-code-entry" data-action="letter-code">封存的一页 <span aria-hidden="true">↗</span></button></div></article>`, 'quiet-letter');
  }

  function openQuietLetter() {
    const page = $('#quiet-letter-template');
    if (page?.innerHTML.trim()) openDialog('纸页背面', `<article class="quiet-letter-page">${page.innerHTML}<div class="letter-page-turn"><button type="button" class="text-button" data-action="short-letter">← 回到小信</button></div></article>`, 'quiet-letter');
  }

  function openLetterCode() {
    openDialog('夹页', '<section class="letter-code-page"><h2 id="dialog-title">封存的一页</h2><p>用一段旧日期，翻开这一页。</p><form id="letter-code-form" novalidate><label for="letter-code">八位日期</label><input id="letter-code" type="password" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="YYYYMMDD" aria-describedby="letter-code-hint letter-code-error"><p id="letter-code-hint" class="letter-code-hint">按年月日填写。</p><p id="letter-code-error" class="letter-code-error" role="alert" hidden></p><div class="letter-code-actions"><button type="button" class="text-button" data-action="short-letter">← 回到小信</button><button type="submit" class="button secondary">翻开</button></div></form></section>', 'letter-code');
    $('#letter-code').focus({preventScroll:true});
  }

  function openLifeImages() {
    const content = window.NAULifeImages?.renderIndex?.(state.data.lifeImageIndex, state.data.lifeChapters);
    if (content) openDialog('学习生活 / 图片与原帖', `<h2 id="dialog-title" class="article-title">图片与原帖索引</h2>${content}`, 'life-images');
  }

  document.addEventListener('submit', event => {
    if (event.target.id !== 'letter-code-form') return;
    event.preventDefault();
    const input = $('#letter-code');
    if (input.value === '20230613') {
      input.value = '';
      openQuietLetter();
      return;
    }
    const error = $('#letter-code-error');
    error.textContent = input.value.length === 8 ? '日期似乎不对，再想一想。' : '请输入八位日期。';
    error.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    input.focus({preventScroll:true});
    input.select();
  });

  function openDialog(eyebrow, html, type = '') {
    if (!dialog.open) {
      state.lastFocus = document.activeElement;
      state.lastFocusId = state.lastFocus?.dataset?.id || null;
    }
    state.dialogType = type;
    $('#dialog-eyebrow').textContent = eyebrow;
    $('#dialog-content').innerHTML = html;
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    document.body.style.overflow = 'hidden';
    $('#dialog-close').focus({preventScroll:true});
  }

  function closeDialog() {
    state.dialogType = '';
    if (dialog.open) dialog.close();
    document.body.style.overflow = '';
    if (state.lastFocus?.isConnected) state.lastFocus.focus({preventScroll:true});
    else if (state.lastFocusId) app.querySelector(`[data-action="mentor"][data-id="${CSS.escape(state.lastFocusId)}"]`)?.focus({preventScroll:true});
  }

  function notify(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('visible'), 2600);
  }

  function persistSaved() {
    try { localStorage.setItem('nau-guide-contact-list-v1', JSON.stringify(state.saved)); } catch { notify('当前浏览器无法保存，清单将在本次页面内保留。'); }
  }

  function toggleSaved(id) {
    const mentor = state.data.mentors.find(m => m.id === id);
    if (!mentor) return;
    const remove = isSaved(id);
    if (remove) delete state.saved[id]; else state.saved[id] = '优先联系';
    persistSaved();
    if (state.view === 'mentors') renderMentorResults();
    if (dialog.open) {
      $$(`[data-action="save"][data-id="${CSS.escape(id)}"]`, dialog).forEach(btn => {
        btn.setAttribute('aria-pressed', String(!remove));
        if (btn.classList.contains('button')) btn.innerHTML = icons.bookmark + (remove ? '加入联系清单' : '已加入联系清单');
        else { btn.setAttribute('aria-label', remove ? `将${mentor.name}加入联系清单` : `从联系清单移除${mentor.name}`); btn.title = remove ? '加入联系清单' : '已加入联系清单'; }
      });
      const select = $('#contact-status',dialog);
      if (select) {select.disabled=remove;select.value=state.saved[id] || '优先联系';}
    }
    notify(remove ? `已将${mentor.name}移出清单` : `已将${mentor.name}加入联系清单`);
    emit('mentor_save', {id,saved:!remove});
  }

  function renderMusic() {
    if (window.NAUMusic?.mount) window.NAUMusic.mount(app, state.data.musicPlaylist);
    else app.innerHTML = emptyState('音乐栏目暂未载入', '请联网刷新页面后再试；其他指南内容仍可阅读。');
  }

  function route(scroll = true) {
    if (!state.data) return;
    const [view, id] = location.hash.replace(/^#/, '').split('/');
    const nextView = ['mentors','life','posts','downloads','music'].includes(view) ? view : 'mentors';
    const keepMusic = state.view === 'music' && nextView === 'music' && window.NAUMusic?.isMounted?.();
    if (state.view === 'music' && nextView !== 'music') window.NAUMusic?.leave?.();
    state.view = nextView;
    if (state.view === 'life' && id && state.data.lifeChapters.some(c => c.id === id)) state.chapter = id;
    $$('[data-nav]').forEach(link => link.dataset.nav === state.view ? link.setAttribute('aria-current','page') : link.removeAttribute('aria-current'));
    if (!keepMusic) ({mentors:renderMentors,life:renderLife,posts:renderPosts,downloads:renderDownloads,music:renderMusic})[state.view]();
    document.title = `${{mentors:'导师导览',life:'学习生活',posts:'原帖索引',downloads:'资料下载',music:'音乐小憩'}[state.view]} · 雨诺的南审手记`;
    if (scroll) requestAnimationFrame(() => app.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}));
    emit('page_view', {chapter:state.view==='life'?state.chapter:undefined});
  }

  document.addEventListener('click', event => {
    const currentLink = event.target.closest('a[href]');
    if (currentLink?.closest('.life-photo-chapters')) closeDialog();
    if(currentLink && currentLink.getAttribute('href') === location.hash && /^#(?:mentors|life|posts|downloads|music)(?:\/.*)?$/.test(location.hash)){
      event.preventDefault();
      route(true);
    }
    const action = event.target.closest('[data-action]');
    if (action) {
      const id = action.dataset.id;
      switch(action.dataset.action) {
        case 'short-letter': if (!dialog.open) action.focus({preventScroll:true}); openShortLetter(); break;
        case 'quiet-letter': openQuietLetter(); break;
        case 'letter-code': openLetterCode(); break;
        case 'life-images': openLifeImages(); break;
        case 'compare-toggle': toggleCompare(id); break;
        case 'compare-open': openComparison(); break;
        case 'compare-clear': clearCompare(); break;
        case 'compare-close': closeDialog(); break;
        case 'contact-prepare': openContactPreparation(id || state.compareIds[0] || ''); break;
        case 'contact-mode': openContactPreparation(state.contactMentorId, action.dataset.mode); break;
        case 'copy-contact': copyContactPreparation(); break;
        case 'mentor': openMentor(id); break;
        case 'post': openPost(id); break;
        case 'save': toggleSaved(id); break;
        case 'guide': openGuide(action.dataset.section); break;
        case 'direction': state.direction=id; $$('[data-action="direction"]').forEach(b=>b.setAttribute('aria-pressed', String(b.dataset.id===id))); $('.direction-note').textContent=id?`${id} · ${directionName(id)}。交叉归类可重复出现，不等同当年招生分组。`:'每位导师最多列两类，允许主方向与交叉方向；名录内不代表当年仍有名额。'; renderMentorResults(); emit('direction_filter',{id}); break;
        case 'saved-only': state.savedOnly=!state.savedOnly;action.setAttribute('aria-pressed',String(state.savedOnly));renderMentorResults();break;
        case 'reset-mentors': state.query='';state.direction='';state.savedOnly=false;state.reviewCoverage='';renderMentors();break;
        case 'reset-posts': state.postQuery='';state.postTopic='';state.postCategory='';state.postLimit=20;renderPosts();break;
        case 'reset-internships': state.internGroup='';state.internCity='';state.internStatus='current';renderLife();break;
        case 'more-posts': {const prior=state.postLimit;state.postLimit+=20;renderPostResults();const first=$$('.post-card')[prior];if(first){first.setAttribute('tabindex','-1');first.focus({preventScroll:true});first.scrollIntoView({behavior:'smooth',block:'nearest'});}break;}
        case 'clear-search': {const input=$('#'+action.dataset.input);input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();break;}
      }
    }
    const download = event.target.closest('[data-download]');
    if(download)emit('download',{id:download.dataset.download});
  });
  document.addEventListener('input', event => {
    if (event.target.id === 'letter-code') {
      $('#letter-code-error').hidden = true;
      event.target.removeAttribute('aria-invalid');
      return;
    }
    if(event.target.id==='contact-copy-text'){state.contactEdits[contactEditKey()]=event.target.value;return;}
    if(event.target.id==='mentor-search'){state.query=event.target.value;renderMentorResults();}
    else if(event.target.id==='post-search'){state.postQuery=event.target.value;state.postLimit=20;renderPostResults();}
    else return;
    event.target.parentElement.querySelector('.search-clear').hidden=!event.target.value;
  });
  document.addEventListener('change', event => {
    if(['intern-group','intern-city','intern-status'].includes(event.target.id)){
      state[{ 'intern-group':'internGroup','intern-city':'internCity','intern-status':'internStatus' }[event.target.id]]=event.target.value;
      renderInternshipResults();
    }
    else if(event.target.id==='review-coverage'){state.reviewCoverage=event.target.value;renderMentorResults();}
    else if(event.target.id==='contact-mentor'){openContactPreparation(event.target.value);$('#contact-mentor',dialog)?.focus({preventScroll:true});}
    else if(event.target.id==='mobile-chapter')location.hash='life/'+event.target.value;
    else if(event.target.id==='post-topic'){state.postTopic=event.target.value;state.postLimit=20;renderPostResults();}
    else if(event.target.id==='post-category'){state.postCategory=event.target.value;state.postLimit=20;renderPostResults();}
    else if(event.target.id==='contact-status'){state.saved[event.target.dataset.id]=event.target.value;persistSaved();if(state.view==='mentors')renderMentorResults();notify('已更新联系顺位');}
  });
  $('#dialog-close').addEventListener('click',closeDialog);
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeDialog();}});
  $('#back-top').addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
  let scrollQueued=false;
  window.addEventListener('scroll',()=>{if(!scrollQueued){requestAnimationFrame(()=>{$('#back-top').hidden=window.scrollY<650;scrollQueued=false;});scrollQueued=true;}},{passive:true});
  window.addEventListener('hashchange',()=>{closeDialog();route(true);});

  async function boot() {
    try {
      const response=await fetch('./data/site-data.json?v=edition1', {cache:'no-cache'});
      if(!response.ok){const failure=new Error('资料文件返回 '+response.status);failure.missingOfflineData=response.headers.get('X-Guide-Offline')==='missing';throw failure;}
      const data=await response.json();
      if(!Array.isArray(data.mentors)||!Array.isArray(data.lifeChapters)||!Array.isArray(data.socialPosts))throw new Error('资料格式不完整');
      state.data=data;
      window.dispatchEvent(new CustomEvent('nau:data-ready', {detail:{offlineCache:response.headers.get('X-Guide-Offline')==='cached'}}));
      for(const post of data.socialPosts){
        const codes=array(post.sourceIds).filter(code=>/^[A-Z]\d{2,3}$/.test(code));
        for(const [code,entry] of Object.entries(data.sourceRegistry||{})){
          if(!/^[A-Z]\d{2,3}$/.test(code))continue;
          if(entry.postId===post.id||entry.original_id===post.id||array(entry.sourceIds).includes(post.id)||String(entry.canonicalUrl||entry.url||'').includes('/'+post.id))codes.push(code);
        }
        state.postCodes[post.id]=[...new Set(codes)];
      }
      try {const saved=JSON.parse(localStorage.getItem('nau-guide-contact-list-v1')||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))state.saved=Object.fromEntries(Object.entries(saved).filter(([id,status])=>data.mentors.some(m=>m.id===id)&&['优先联系','备选','仅了解'].includes(status)));}catch{}
      const counts=[data.mentors.length,data.mentorCards.length,data.lifeChapters.length,publicPosts().length];
      $$('.hero-stats strong').forEach((s,i)=>s.textContent=counts[i]);
      if (Array.isArray(data.officialEvidence)) $('.panel-footnote').innerHTML = `<span class="mini-cross" aria-hidden="true">+</span>另有 ${data.officialEvidence.length} 条官方资料 · 分开核验`;
      route(false);
    } catch(error) {
      const offlineMissing=error.missingOfflineData || navigator.onLine===false;
      app.innerHTML=emptyState(offlineMissing?'此设备还没有可离线阅读的资料':'指南内容暂时未能载入',offlineMissing?'首次使用请先联网打开本页，等待资料载入。之后可离线查看导师、生活章节和原帖摘记；原帖原网页仍需要联网。':'请刷新页面重试，或检查当前网络连接。','<button type="button" class="button secondary" onclick="location.reload()">重新载入</button>')+`<p class="error-details">${esc(error.message)}</p>`;
      console.error('Guide load failed:',error);
    }
  }
  boot();
})();
