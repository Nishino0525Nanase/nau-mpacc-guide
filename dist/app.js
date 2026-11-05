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
  const state = { data: null, view: 'mentors', query: '', direction: '', savedOnly: false, postQuery: '', postTopic: '', postCategory: '', postLimit: 20, chapter: 'life-01', saved: {}, compareIds: [], dialogType: '', contactMentorId: '', contactMode: 'outline', contactEdits: {}, postCodes: {}, lastFocus: null, lastFocusId: null };
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
    const entries = array(mentor.evidence).filter(e => official ? e.kind === 'official' && e.id !== `${mentor.id}-official` : e.kind !== 'official');
    if (!entries.length) return `<p class="compare-empty">${official ? '尚无单独的培养或教学实例；可继续核对教师主页。' : '尚未取得可归属的个人经历反馈，需向近年直系学生核实。'}</p>`;
    return entries.slice(0, 3).map(item => `<details class="compare-evidence"><summary>${esc(item.statusLabel || item.category || (official ? '官方记录' : '反馈线索'))}${item.date ? ` · ${esc(item.date)}` : ''}</summary><p class="compare-population">${esc(official ? '官方资料' : ({firsthand:'本人经历自述',secondhand:'二手转述',uncertain:'身份或细节待核实'}[item.kind] || '反馈线索'))} · ${esc(item.population || '接触身份未说明')}</p><p>${inline(item.text)}</p><p class="evidence-limit">${inline(item.limitations || '仅限该条来源描述的对象和情境，不能概括所有学生的体验。')}</p>${item.url ? external(item.url, '原始来源 ↗') : ''}</details>`).join('') + (entries.length > 3 ? `<p class="compare-empty">另有 ${entries.length-3} 条记录，可在完整资料中继续核对。</p>` : '');
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
    return `<article class="mentor-card"><div class="mentor-card-head"><div><h3 class="mentor-name">${esc(mentor.name)}${mentor.hasDetailedCard ? '<span class="core-label">核心资料卡</span>' : ''}</h3><p class="title-line">${esc(mentor.title || '职称未公开')} · 125300名单内</p></div>${saveButton(mentor)}</div><div class="tags">${mentor.directions.map((id, i) => `<span class="tag${i ? ' secondary' : ''}">${esc(shortDirection(id))}</span>`).join('')}${status}</div><p class="mentor-research">${esc(mentor.research || '研究方向未公开')}</p><div class="mentor-feedback"><span class="evidence-dot" aria-hidden="true"></span><span>${esc(mentor.feedbackStatus || '个人指导反馈待补充了解')}</span></div><div class="mentor-card-actions"><button type="button" class="card-action" data-action="mentor" data-id="${esc(mentor.id)}"><span>查看资料与反馈</span><span aria-hidden="true">↗</span><span class="sr-only">：${esc(mentor.name)}</span></button>${compareButton(mentor)}</div></article>`;
  }

  function filteredMentors() {
    const query = normalize(state.query);
    return state.data.mentors.filter(m => (!state.direction || m.directions.includes(state.direction)) && (!state.savedOnly || isSaved(m.id)) && (!query || normalize([m.name, m.research, m.title, m.summary, m.qualification, ...m.directions.map(directionName), ...array(m.profileFields).map(f => textOf(f.value))].join(' ')).includes(query)));
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
    return `<details class="research-updates" open><summary>新增核验：具体训练与学习安排</summary><div class="research-updates-grid">${highlights.map(item => {
      const text = textOf(item.text);
      const extraCodes = array(item.sourceCodes).filter(code => typeof code === 'string' && source(code) && !text.includes(code));
      return `<article><h3>${esc(item.title)}</h3><p>${inline(text + (extraCodes.length ? ` [${extraCodes.join('、')}]` : ''))}</p></article>`;
    }).join('')}</div></details>`;
  }

  function renderMentors() {
    app.innerHTML = heading('01 / MENTOR DIRECTORY', '先选方向，再了解具体的人', '六类研究主题，帮助你建立自己的了解顺序。研究方向看官方资料，相处与训练看具体经历；每条反馈都保留接触身份与年份。', `<strong>${state.data.mentors.length}</strong> 位导师 · ${state.data.mentorCards.length} 张核心卡`) + researchHighlightsHtml() +
      `<div class="notice">${esc(state.data.meta.directionNote)} <button type="button" class="text-button" data-action="guide" data-section="0">读懂方向与报名的关系 ↗</button></div><div class="toolbar">${searchField('mentor-search', '搜索导师姓名、研究方向或关键词', state.query)}<button id="saved-filter" type="button" class="save-filter" data-action="saved-only" aria-pressed="${state.savedOnly}">${icons.bookmark}我的清单</button></div><div class="filter-groups"><div class="filter-line" role="group" aria-label="按研究方向筛选"><button class="filter-chip direction-chip" type="button" data-action="direction" data-id="" aria-pressed="${!state.direction}">全部方向<small>${state.data.mentors.length}</small></button>${state.data.directions.map(d => `<button class="filter-chip direction-chip" type="button" data-action="direction" data-id="${esc(d.id)}" aria-pressed="${state.direction === d.id}">${esc(shortDirection(d.id))}<small>${state.data.mentors.filter(m => m.directions.includes(d.id)).length}</small></button>`).join('')}</div><div class="direction-note">${state.direction ? `${esc(state.direction)} · ${esc(directionName(state.direction))}。交叉归类可重复出现，不等同当年招生分组。` : '每位导师最多列两类，允许主方向与交叉方向；名录内不代表当年仍有名额。'}</div></div><section class="mentor-tools" id="mentor-tools" aria-label="导师对比与联系准备"></section><div class="results-bar"><span id="mentor-result-count" role="status" aria-live="polite"></span><span id="mentor-result-order"></span></div><div class="mentor-grid" id="mentor-results"></div><section class="goal-section" aria-labelledby="goal-title"><span class="small-label">FIND YOUR STARTING POINT</span><h3 id="goal-title">从你想要的研究生生活出发</h3><div class="goal-grid">${state.data.targetProfiles.map(p => `<details class="goal-card"><summary>${esc(p.title.replace(/^希望/, ''))}</summary><div class="goal-content article-body">${array(p.blocks).map(blockHtml).join('') || `<p>${inline(p.summary)}</p>`}</div><div class="source-actions">${p.mentorIds.map(id => {const m = state.data.mentors.find(m => m.id === id); return m ? `<button class="text-button" type="button" data-action="mentor" data-id="${esc(id)}">${esc(m.name)} ↗</button>` : '';}).join('')}</div></details>`).join('')}</div><div class="guide-action-row"><button type="button" class="text-button" data-action="guide" data-section="3">名额、双选与备选方案 ↗</button><button type="button" class="text-button" data-action="guide" data-section="4">怎样写一封具体的联系邮件 ↗</button><span>清单保存在当前浏览器，可标记优先联系、备选或仅了解。</span></div></section>`;
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
    const feedback = array(m.evidence).filter(e => e.kind !== 'official');
    openDialog('导师资料 / ' + (m.hasDetailedCard ? '核心资料卡' : '补充了解名录'), `<div class="dialog-heading"><div><h2 id="dialog-title">${esc(m.name)}</h2><div class="dialog-subtitle">${esc(m.qualification || m.title)}</div></div>${saveButton(m)}</div><div class="tags">${m.directions.map((d,i) => `<span class="tag${i ? ' secondary' : ''}">${esc(d)} · ${esc(directionName(d))}</span>`).join('')}</div>${card?.reason || m.summary ? `<p class="dialog-content-intro">${inline(card?.reason || m.summary)}</p>` : ''}<section class="dialog-section"><h3><span class="section-number">01</span>公开信息</h3><dl class="profile-fields">${fields.filter(f => f.label !== '姓名').map(f => `<div class="profile-row"><dt>${esc(f.label)}</dt><dd>${f.label.includes('联系') ? contactHtml(f.value) : inline(f.value)}</dd></div>`).join('')}</dl><div class="source-actions">${array(m.links).map(link => external(link.url, esc(link.label || '官方来源') + ' ↗')).join('')}</div></section>${official.length ? `<section class="dialog-section"><h3><span class="section-number">02</span>官方记录与具名个案</h3>${official.map(renderEvidence).join('')}</section>` : ''}<section class="dialog-section"><h3><span class="section-number">03</span>学生自述与反馈线索</h3><div class="evidence-note">${esc(state.data.meta.evidenceNote)}</div>${feedback.length ? feedback.map(renderEvidence).join('') : `<p class="dialog-content-intro">本次尚未取得可归属的个人指导反馈。${esc(m.feedbackDetails?.limits || '可向近年直系MPAcc学生了解具体指导过程。')}</p>`}</section><div class="quota-note"><strong>名额与联系：</strong>${inline(m.quotaStatus || state.data.meta.quotaNote)}</div><div class="save-control">${saveButton(m, true)}<label for="contact-status">联系顺位</label><select id="contact-status" data-id="${esc(m.id)}"${isSaved(m.id) ? '' : ' disabled'}>${['优先联系','备选','仅了解'].map(status => `<option${state.saved[m.id] === status ? ' selected' : ''}>${status}</option>`).join('')}</select></div><div class="mentor-detail-tools">${compareButton(m)}<button type="button" class="button secondary" data-action="contact-prepare" data-id="${esc(m.id)}">联系准备：${esc(m.name)}</button></div>`);
    emit('mentor_open', {id, name:m.name});
  }

  function contactHtml(value) {
    const raw = textOf(value);
    return inline(raw).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, email => `<a href="mailto:${esc(email)}">${esc(email)}</a>`);
  }

  function renderLife() {
    const chapters = state.data.lifeChapters;
    let chapter = chapters.find(c => c.id === state.chapter) || chapters[0];
    state.chapter = chapter.id;
    const i = chapters.indexOf(chapter);
    app.innerHTML = heading('02 / CAMPUS & GRADUATE LIFE', '在南审，慢慢把生活安顿好', '从入学与住宿，到课程、实习、论文和办事。以浦口校区为主，涉及本科、MAud、莫愁或历史年份的经验，在正文里分别说明。', `<strong>${chapters.length}</strong> 章 · 可逐条返回来源`) + `<div class="life-mobile-index"><label for="mobile-chapter">选择章节</label><select id="mobile-chapter">${chapters.map(c => `<option value="${esc(c.id)}"${c.id === chapter.id ? ' selected' : ''}>${esc(c.title)}</option>`).join('')}</select></div><div class="life-layout"><aside class="chapter-sidebar"><div class="sidebar-label"><span>阅读目录</span><span>CONTENTS</span></div><nav aria-label="学习生活章节目录">${chapters.map(c => `<a class="chapter-link" href="#life/${esc(c.id)}"${c.id === chapter.id ? ' aria-current="page"' : ''}><span class="chapter-number">${String(c.number).padStart(2,'0')}</span><span>${esc(c.title.replace(/^第[一二三四五六七八九十十二]+章\s*/,''))}</span></a>`).join('')}</nav></aside><article class="article-panel" id="current-chapter"><div class="article-kicker">CHAPTER ${String(chapter.number).padStart(2,'0')} / ${String(chapters.length).padStart(2,'0')}</div><h2 class="article-title">${esc(chapter.title)}</h2><div class="article-body">${chapter.blocks.map(blockHtml).join('')}</div><nav class="chapter-pagination" aria-label="章节翻页">${i > 0 ? `<a href="#life/${esc(chapters[i-1].id)}"><small>← 上一章</small>${esc(chapters[i-1].title)}</a>` : '<span></span>'}${i < chapters.length-1 ? `<a href="#life/${esc(chapters[i+1].id)}"><small>下一章 →</small>${esc(chapters[i+1].title)}</a>` : '<span></span>'}</nav></article></div>`;
  }

  function socialCodes(post) {
    const short = state.postCodes[post.id] || array(post.sourceIds).filter(s => /^[A-Z]\d{2,3}$/.test(s));
    return short.length ? short.join(' / ') : post.id.slice(-7).toUpperCase();
  }

  function filteredPosts() {
    const q = normalize(state.postQuery);
    return state.data.socialPosts.filter(p => (!state.postTopic || p.topic === state.postTopic) && (!state.postCategory || p.category === state.postCategory) && (!q || (/^[a-z]\d{2,3}$/.test(q) ? (state.postCodes[p.id] || []).some(code=>normalize(code)===q) : normalize([p.title,p.author,p.summary,p.population,p.campus,p.date,p.verificationStatus,...(state.postCodes[p.id] || []),...array(p.comments).map(c => textOf(c))].join(' ')).includes(q))));
  }

  function postCard(p) {
    return `<article class="post-card"><div class="post-topline"><span class="post-platform">${esc(p.platform)} / ${esc(p.topic)}</span><span class="post-codes">${esc(socialCodes(p))}</span></div><h3 class="post-title">${esc(p.title)}</h3><div class="post-byline">${esc(p.author || '作者未记录')} · ${esc(p.date || '日期未显示')}</div><p class="post-summary">${esc(p.summary || '本条为检索筛选记录，详见阅读与采用边界。')}</p><div class="tags"><span class="tag${p.category.includes('排除') || p.screenedOnly ? ' secondary' : ' warm'}">${esc(p.category)}</span></div><div class="post-population">接触身份：${esc(p.population || '未说明')}${p.campus && p.campus !== '未说明' ? ` · ${esc(p.campus)}` : ''}</div><div class="post-actions"><button type="button" data-action="post" data-id="${esc(p.id)}">展开摘记与评论 <span aria-hidden="true">↗</span><span class="sr-only">：${esc(p.title)}</span></button>${external(p.url || p.canonicalUrl, '打开原帖 ↗')}</div></article>`;
  }

  function renderPostResults() {
    const posts = filteredPosts(), visible = posts.slice(0, state.postLimit);
    $('#post-result-count').innerHTML = `找到 <strong>${posts.length}</strong> 条来源`;
    $('#post-results').innerHTML = visible.length ? visible.map(postCard).join('') : emptyState('没有找到这类原帖', '换一个关键词，或清除主题与采用类别筛选。', '<button type="button" class="button secondary" data-action="reset-posts">查看全部原帖</button>');
    $('#post-load-more').innerHTML = posts.length > visible.length ? `<div class="load-more-wrap"><button class="button secondary" type="button" data-action="more-posts">再看 ${Math.min(20, posts.length-visible.length)} 条 <span aria-hidden="true">↓</span></button><span class="showing-note">已展示 ${visible.length} / ${posts.length} 条</span></div>` : visible.length ? `<div class="load-more-wrap"><span class="showing-note">已展示全部 ${posts.length} 条筛选结果</span></div>` : '';
  }

  function coverageHtml() {
    const continued = state.data.meta.research102 || state.data.meta.continueResearch;
    if (continued) {
      const additions = [];
      if (continued.newOfficialSources) additions.push(`<strong>${esc(continued.newOfficialSources)}</strong> 条官方来源`);
      if (continued.newSocialPosts) additions.push(`<strong>${esc(continued.newSocialPosts)}</strong> 篇社交原帖`);
      const update = continued.updatedSocialPosts ? `，并补读更新 <strong>${esc(continued.updatedSocialPosts)}</strong> 篇旧帖` : '';
      return `<section class="research-coverage reading-notes" aria-label="新增资料与采用口径"><h3>这轮补进了什么</h3><p>${additions.length ? `新增 ${additions.join('、')}${update}。` : continued.updatedSocialPosts ? `补读更新 <strong>${esc(continued.updatedSocialPosts)}</strong> 篇旧帖。` : '本轮继续核对来源，没有把重复材料计成新增。'}新增内容已归入对应的导师资料与学习生活章节，原始出处和实际阅读范围一并保留。</p><p>论文推荐、科研项目公示和教学案例分别标注；往届材料保留年份，不能直接推断当年名额或本级执行安排。社交材料只采用可核对的正文或回复，不把混合专业课程印象改写成导师日常指导结论。</p></section>`;
    }
    const latest = state.data.meta.appResearch;
    if (latest) return `<section class="research-coverage reading-notes" aria-label="新增资料与采用口径"><h3>这轮补进了什么</h3><p>新增 <strong>${esc(latest.newOfficialSources)}</strong> 条官方来源、<strong>${esc(latest.newSocialPosts)}</strong> 篇小红书原帖，并补读更新 <strong>${esc(latest.updatedSocialPosts)}</strong> 篇旧帖的回复。课程现场教学、论文个案与课程考核经验已写入对应章节，旧帖更新单列，不重复增加篇数。</p><p>历史制度只作延伸阅读；混合专业的选课评论保留身份限制。个人日常指导的新评价仍有限，课程体验不能直接当作导师相处评价。</p></section>`;
    const current = state.data.meta.round3Research;
    if (current) return `<section class="research-coverage reading-notes" aria-label="新增资料与采用口径"><h3>这轮补进了什么</h3><p>新增 <strong>${esc(current.studentPosts)}</strong> 篇小红书正文材料与 <strong>${esc(current.officialIndependentEvents)}</strong> 项官方培养及实践记录。具体课程任务、案例训练、论文与实习衔接已写进相应章节，来源与实际阅读范围一并保留。</p><p>导师补充主要是有对象、有年份的培养个案及集体教学记录。个人日常指导的新评价仍有限；课程体验中的亲历、第三方转述和未核验身份分别注明。</p></section>`;
    const r = state.data.meta.researchExpansion;
    if (!r) return '';
    return `<section class="research-coverage reading-notes" aria-label="检索覆盖与采用口径"><h3>检索更广，也把采用边界留下</h3><p>追加 <strong>${esc(r.queryCount)}</strong> 组检索，实际新读 <strong>${esc(r.newActuallyReadUniqueSources)}</strong> 个不同来源；其中 <strong>${esc(r.newIndexedSources)}</strong> 个纳入索引（${esc(r.newXhsSources)} 条小红书、${esc(r.newOtherPlatformSources)} 个其他平台来源）。另有 ${esc(r.newReadExcludedSources)} 个读后筛除，不用于主要建议。</p><p>${esc(r.newConditionalUsefulSources)} 条有条件的操作参考、${esc(r.newBackgroundSources)} 条背景材料分开标记。同一作者的多篇记录不当作多个独立学生样本。本轮未取得新的可靠个人导师日常指导证据，已有导师反馈继续保留原始身份和适用边界。</p></section>`;
  }

  function unreadLeadsHtml() {
    const leads = array(state.data.unreadLeads);
    if (!leads.length) return '';
    return `<section class="reading-notes unread-leads"><details><summary>继续核实的线索 · ${leads.length} 条正文未读</summary><p>下列条目只读到列表或摘要，未能打开正文；不计作已读来源，不用于导师或政策结论。</p><ul>${leads.map(p=>`<li>${external(p.url,esc(p.title || '待核实线索'))}<p>${esc(p.limitations || p.reading_scope || '正文尚未读取，需自行核实。')}</p></li>`).join('')}</ul></details></section>`;
  }

  function renderPosts() {
    const topics = [...new Set(state.data.socialPosts.map(p => p.topic).filter(Boolean))];
    const cats = [...new Set(state.data.socialPosts.map(p => p.category).filter(Boolean))];
    app.innerHTML = heading('03 / SOURCE NOTEBOOK', '建议的背后，是这些原始来源', '不只留结论，也留下作者身份、可见日期、具体评论与采用边界。可以按校园主题查找，也可以看看哪些线索被保留、哪些未用于推荐。', `<strong>${state.data.socialPosts.length}</strong> 条 · 实质去重`) + `<div class="notice">${esc(state.data.meta.platformNote)} 社交平台原页可能需要登录，显示内容也可能随时间变化；本页保留的是当次阅读记录。</div>${coverageHtml()}<div class="posts-toolbar">${searchField('post-search','搜索标题、作者、来源编号或经历关键词',state.postQuery)}<div class="select-field"><label for="post-topic">内容主题</label><select id="post-topic"><option value="">全部主题</option>${topics.map(t => `<option${state.postTopic===t?' selected':''}>${esc(t)}</option>`).join('')}</select></div><div class="select-field"><label for="post-category">采用类别</label><select id="post-category"><option value="">全部类别</option>${cats.map(c => `<option${state.postCategory===c?' selected':''}>${esc(c)}</option>`).join('')}</select></div></div><div class="results-bar"><span id="post-result-count" role="status" aria-live="polite"></span><button type="button" class="text-button" data-action="reset-posts">清除筛选</button></div><div class="posts-grid" id="post-results"></div><div id="post-load-more"></div>${unreadLeadsHtml()}`;
    renderPostResults();
  }

  function openPost(id) {
    const p = state.data.socialPosts.find(p => p.id === id);
    if (!p) return;
    const comments = array(p.comments);
    openDialog('原帖摘记 / ' + socialCodes(p), `<div class="dialog-heading"><div><h2 id="dialog-title">${esc(p.title)}</h2><div class="dialog-subtitle">${esc(p.platform)} · ${esc(p.author || '作者未记录')} · ${esc(p.date || '日期未显示')}</div></div></div><div class="tags"><span class="tag warm">${esc(p.category)}</span><span class="tag secondary">${esc(p.topic)}</span></div><dl class="profile-fields"><div class="profile-row"><dt>接触身份</dt><dd>${esc(p.population || '未说明')}</dd></div><div class="profile-row"><dt>适用校区</dt><dd>${esc(p.campus || '未说明')}</dd></div><div class="profile-row"><dt>核实状态</dt><dd>${esc(p.verificationStatus || '见采用边界')}</dd></div>${p.promotion ? `<div class="profile-row"><dt>商业或导流线索</dt><dd>${esc(p.promotion)}</dd></div>` : ''}</dl><section class="dialog-section"><h3>正文摘记</h3><p class="dialog-content-intro">${inline(p.summary || '本条只保留筛选范围，未形成可采用的具体内容。')}</p>${array(p.tips).length ? `<ul class="tip-list">${array(p.tips).map(t => `<li>${inline(t)}</li>`).join('')}</ul>` : ''}</section>${comments.length ? `<section class="dialog-section"><h3>可见评论与回复摘记</h3>${comments.map(c => typeof c === 'string' ? `<div class="comment-block"><p>${inline(c)}</p></div>` : `<div class="comment-block"><small>${esc(c.author || c.user || '评论者未记录')}${c.date_display || c.date ? ' · ' + esc(c.date_display || c.date) : ''}</small>${c.identity || c.stage ? `<small> · ${esc([c.identity,c.stage].filter(Boolean).join(' / '))}</small>` : ''}<p>${inline(c.text || c.summary || c.content || c)}</p>${c.assessment || c.limitation || c.limitations ? `<p class="evidence-limit">${inline(c.assessment || c.limitation || c.limitations)}</p>` : ''}</div>`).join('')}</section>` : ''}<section class="dialog-section"><h3>采用与阅读边界</h3><div class="evidence-note">${inline(p.reviewReason || '')}${p.limitations ? `<p>${inline(p.limitations)}</p>` : ''}</div>${array(p.readingScopes).length ? `<ul class="tip-list">${array(p.readingScopes).map(scope => `<li>${inline(scope)}</li>`).join('')}</ul>` : ''}</section><div class="source-actions">${external(p.url || p.canonicalUrl, '打开原帖 ↗', 'button secondary')}</div>`);
    emit('post_open', {id});
  }

  function renderDownloads() {
    const socialCount = state.data.socialPosts.length;
    const officialCount = array(state.data.officialEvidence).length;
    app.innerHTML = heading('04 / TAKE THE GUIDE WITH YOU', '下载一份，留给需要的时候', `Word 保留基础正文和导师卡片；Excel 提供原帖目录与官方补充证据。网页当前收录 ${socialCount} 条社交原帖，另有新增核验与操作说明，可逐条返回原始来源。`) + `<div class="download-grid">${state.data.downloads.map(d => `<article class="download-card"><div class="file-icon" aria-hidden="true">${esc(d.format.toUpperCase())}</div><h3>${esc(d.title)}</h3><p>${esc(d.format.toLowerCase() === 'xlsx' ? `原帖与官方补充证据目录；网页当前可查 ${socialCount} 条社交原帖${officialCount ? `、${officialCount} 条官方资料` : ''}，附适用人群与证据边界。` : d.description)}</p><a class="button" href="${esc(d.url)}" download data-download="${esc(d.id)}">下载${d.format.toLowerCase()==='docx'?' Word':' Excel'}文件 <span aria-hidden="true">↓</span></a><div class="download-meta">${esc(d.format.toUpperCase())}${d.bytes ? ` · ${Math.round(d.bytes/1024)} KB` : ''}</div></article>`).join('')}</div><section class="app-edition" aria-labelledby="app-edition-title"><div class="app-edition-heading"><span class="small-label">KEEP IT CLOSE</span><h3 id="app-edition-title">应用版</h3><p>将手记放到桌面或主屏幕，随时回来接着读。</p></div><div id="app-edition-cards" class="app-edition-grid"></div></section><div class="reading-notes"><h3>这份资料，怎样使用更顺手</h3><p><strong>选导之前：</strong>先看本级培养方向，再从导师名录中选出几位，逐条核对研究内容、训练方式与当年名额。联系清单可以帮助你保留第二顺位。</p><p><strong>读学生经历时：</strong>接触身份和具体过程比笼统的好评更有用。本科课程印象、朋友转述和往届MPAcc经历，分别能回答不同问题。</p><p><strong>准备入学时：</strong>先确认校区、楼栋与本级通知，再购置用品、安排实习和核对奖助；攻略中的来源编号都能回到相应公开页面。</p><p><strong>标注说明：</strong>“未公开”指本次整理未见可靠公开信息；“待核实”指身份、阶段或时效仍有缺口。两者均不等同于该事项不存在。</p></div>`;
    window.NAUEdition?.mount(state.data.meta.appEdition);
  }

  function openGuide(section) {
    const s = state.data.mentorGuideSections?.[Number(section)];
    if (!s) return;
    openDialog('选导阅读 / 操作建议', `<h2 id="dialog-title" class="article-title">${esc(s.title)}</h2><div class="article-body">${s.blocks.map(blockHtml).join('')}</div>`);
    emit('guide_open', {id:s.id});
  }

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

  function route(scroll = true) {
    if (!state.data) return;
    const [view, id] = location.hash.replace(/^#/, '').split('/');
    state.view = ['mentors','life','posts','downloads'].includes(view) ? view : 'mentors';
    if (state.view === 'life' && id && state.data.lifeChapters.some(c => c.id === id)) state.chapter = id;
    $$('[data-nav]').forEach(link => link.dataset.nav === state.view ? link.setAttribute('aria-current','page') : link.removeAttribute('aria-current'));
    ({mentors:renderMentors,life:renderLife,posts:renderPosts,downloads:renderDownloads})[state.view]();
    document.title = `${{mentors:'导师导览',life:'学习生活',posts:'原帖索引',downloads:'资料下载'}[state.view]} · 雨诺的南审手记`;
    if (scroll) requestAnimationFrame(() => app.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}));
    emit('page_view', {chapter:state.view==='life'?state.chapter:undefined});
  }

  document.addEventListener('click', event => {
    const currentLink = event.target.closest('a[href]');
    if(currentLink && currentLink.getAttribute('href') === location.hash && /^#(?:mentors|life|posts|downloads)(?:\/.*)?$/.test(location.hash)){
      event.preventDefault();
      route(true);
    }
    const action = event.target.closest('[data-action]');
    if (action) {
      const id = action.dataset.id;
      switch(action.dataset.action) {
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
        case 'reset-mentors': state.query='';state.direction='';state.savedOnly=false;renderMentors();break;
        case 'reset-posts': state.postQuery='';state.postTopic='';state.postCategory='';state.postLimit=20;renderPosts();break;
        case 'more-posts': {const prior=state.postLimit;state.postLimit+=20;renderPostResults();const first=$$('.post-card')[prior];if(first){first.setAttribute('tabindex','-1');first.focus({preventScroll:true});first.scrollIntoView({behavior:'smooth',block:'nearest'});}break;}
        case 'clear-search': {const input=$('#'+action.dataset.input);input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();break;}
      }
    }
    const download = event.target.closest('[data-download]');
    if(download)emit('download',{id:download.dataset.download});
  });
  document.addEventListener('input', event => {
    if(event.target.id==='contact-copy-text'){state.contactEdits[contactEditKey()]=event.target.value;return;}
    if(event.target.id==='mentor-search'){state.query=event.target.value;renderMentorResults();}
    else if(event.target.id==='post-search'){state.postQuery=event.target.value;state.postLimit=20;renderPostResults();}
    else return;
    event.target.parentElement.querySelector('.search-clear').hidden=!event.target.value;
  });
  document.addEventListener('change', event => {
    if(event.target.id==='contact-mentor'){openContactPreparation(event.target.value);$('#contact-mentor',dialog)?.focus({preventScroll:true});}
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
      const counts=[data.mentors.length,data.mentorCards.length,data.lifeChapters.length,data.socialPosts.length];
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
