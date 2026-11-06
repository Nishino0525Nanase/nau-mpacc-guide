/* Source-image indexes. Rendering only: no requests, storage, or account actions. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const array = value => Array.isArray(value) ? value : [];
  const kinds = [
    ['map', '校园地图'], ['takeaway', '外卖与取餐'], ['food', '吃饭与采购'],
    ['parcel', '快递与办事'], ['housing', '宿舍与用品'], ['travel', '出行路线'],
    ['course', '课程与学习'], ['service', '校园服务'],
  ];
  const kindNames = Object.fromEntries(kinds);
  const imagePath = value => typeof value === 'string' && /^\.\/evidence\/(?:life|xhs)\/[A-Za-z0-9][A-Za-z0-9_-]{0,160}\.(?:png|jpe?g|webp)$/i.test(value) ? value : '';
  const sourceUrl = value => {
    if (typeof value !== 'string') return '';
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  };
  const dimension = (value, fallback) => Number.isInteger(value) && value > 0 && value <= 20000 ? value : fallback;

  function entriesOf(index) {
    const seen = new Set();
    return array(Array.isArray(index) ? index : index?.entries).flatMap((entry, number) => {
      if (!entry || typeof entry !== 'object') return [];
      const imageSeen = new Set();
      const images = array(entry.images).flatMap(image => {
        if (!image || typeof image !== 'object') return [];
        const src = imagePath(image.src);
        if (!src || imageSeen.has(src)) return [];
        imageSeen.add(src);
        return [{...image, src}];
      });
      if (!images.length) return [];
      const url = sourceUrl(entry.sourceUrl);
      const key = String(entry.id || `${url}|${entry.title || ''}|${number}`);
      if (seen.has(key)) return [];
      seen.add(key);
      return [{...entry, id:key, sourceUrl:url, kind:kindNames[entry.kind] ? entry.kind : 'service',
        chapterIds:array(entry.chapterIds).filter(id => typeof id === 'string' && /^life-\d{2}$/.test(id)), images}];
    });
  }

  function counts(entries) {
    const sourceKey = entry => {
      if (!entry.sourceUrl) return String(entry.sourceCode || entry.id);
      const url = new URL(entry.sourceUrl);
      const note = url.pathname.match(/\/(?:explore|discovery\/item)\/([0-9a-f]{24})(?:\/|$)/i);
      if (note && /(?:xiaohongshu|rednote)\.com$/i.test(url.hostname)) return `xhs:${note[1].toLowerCase()}`;
      return `${url.hostname.replace(/^www\./, '').toLowerCase()}${url.pathname}`;
    };
    return {
      images: new Set(entries.flatMap(entry => entry.images.map(image => image.src))).size,
      sources: new Set(entries.map(sourceKey)).size,
    };
  }

  function imageHtml(image, title, number) {
    const caption = image.caption || `${title} · 图 ${number}`;
    return `<figure class="life-photo"><div class="life-photo-media"><a class="life-photo-open" href="${esc(image.src)}" target="_blank" rel="noopener noreferrer" aria-label="${esc('查看大图：' + caption)}"><img src="${esc(image.src)}" alt="${esc(image.alt || caption)}" width="${dimension(image.width, 1200)}" height="${dimension(image.height, 900)}" loading="lazy" decoding="async" data-life-image></a><span class="life-photo-fallback" hidden>图片暂时无法载入，可打开下方来源页核对。</span></div><figcaption>${esc(caption)}</figcaption></figure>`;
  }

  function cardHtml(entry, chapters, showChapters) {
    const title = entry.title || entry.sourceTitle || '来源图片';
    const byline = [entry.sourceAuthor, entry.sourceDate].filter(Boolean).map(esc).join(' · ');
    const chaptersHtml = showChapters ? entry.chapterIds.map(id => {
      const chapter = chapters.find(item => item.id === id);
      if (!chapter) return '';
      const label = String(chapter.title || id).replace(/^第[一二三四五六七八九十十二]+章\s*/, '');
      return `<a href="#life/${esc(id)}">${esc(label)} <span aria-hidden="true">↗</span></a>`;
    }).filter(Boolean).join('') : '';
    const hostname = entry.sourceUrl ? new URL(entry.sourceUrl).hostname.toLowerCase() : '';
    const xhs = ['xiaohongshu.com','rednote.com','xhslink.com','xhslink.cn'].some(host => hostname === host || hostname.endsWith('.' + host));
    const label = xhs ? '打开小红书原帖 ↗' : '打开来源页 ↗';
    const remaining = entry.images.slice(1);
    const cover = imageHtml(entry.images[0], title, 1);
    const coverHtml = Number(entry.images[0].bytes) > 4 * 1024 * 1024 ? `<details class="life-photo-more"><summary>展开原图 · 约 ${(entry.images[0].bytes / 1024 / 1024).toFixed(1)} MB</summary>${cover}</details>` : `<div class="life-photo-cover">${cover}</div>`;
    return `<article class="life-photo-card${entry.primary ? ' life-photo-card-wide' : ''}"><div class="life-photo-card-top"><span class="life-photo-kind">${esc(kindNames[entry.kind])}</span>${entry.sourceCode ? `<span class="life-photo-code">${esc(entry.sourceCode)}</span>` : ''}<span class="life-photo-count">${entry.images.length} 张图</span></div><h4>${esc(title)}</h4>${byline ? `<p class="life-photo-byline">${byline}</p>` : ''}${coverHtml}${remaining.length ? `<details class="life-photo-more"><summary>再看 ${remaining.length} 张图片</summary><div class="life-photo-expanded">${remaining.map((image, index) => imageHtml(image, title, index + 2)).join('')}</div></details>` : ''}${entry.scopeNote ? `<p class="life-photo-scope">${esc(entry.scopeNote)}</p>` : ''}${entry.sourceUrl ? `<div class="life-photo-source"><span>${esc(entry.sourceTitle || '图片来源')}</span><a href="${esc(entry.sourceUrl)}" target="_blank" rel="noopener noreferrer">${label}</a></div>` : ''}${chaptersHtml ? `<div class="life-photo-chapters"><span>对应章节</span>${chaptersHtml}</div>` : ''}</article>`;
  }

  function cardsHtml(entries, chapters, showChapters) {
    const main = entries.filter(entry => !entry.archived);
    const other = entries.filter(entry => entry.archived);
    return `${main.length ? `<div class="life-photo-cards">${main.map(entry => cardHtml(entry, chapters, showChapters)).join('')}</div>` : ''}${other.length ? `<details class="life-photo-archives"><summary>高清大图与其他地图参考</summary><div class="life-photo-cards">${other.map(entry => cardHtml(entry, chapters, showChapters)).join('')}</div></details>` : ''}`;
  }

  function renderChapter(chapterId, index) {
    const entries = entriesOf(index).filter(entry => entry.chapterIds.includes(chapterId));
    if (!entries.length) return '';
    const count = counts(entries);
    return `<section class="life-photo-index" aria-label="本章图片索引"><div class="life-photo-heading"><div><span class="small-label">PICTURE NOTES</span><h3>本章图片索引</h3></div><span>${count.images} 张图 · ${count.sources} 个来源</span></div><p class="life-photo-intro">点图查看大图，原帖与来源页见图片下方。</p>${cardsHtml(entries, [], false)}<p class="life-photo-note">地图、营业与配送安排以当前通知和现场情况为准。</p></section>`;
  }

  function renderIndex(index, chapters = []) {
    const entries = entriesOf(index);
    if (!entries.length) return '<p class="life-photo-empty">暂未归档可展示的来源图片。</p>';
    const count = counts(entries);
    const chapterList = array(chapters).filter(chapter => chapter && typeof chapter === 'object');
    const groups = kinds.map(([kind, label]) => ({kind, label, entries:entries.filter(entry => entry.kind === kind)})).filter(group => group.entries.length);
    return `<div class="life-photo-overview"><p class="life-photo-total"><strong>${count.images}</strong> 张来源图片，来自 <strong>${count.sources}</strong> 个原始来源。</p><p>按生活主题查看，或从图片下方跳到对应章节。</p><div class="life-photo-categories" aria-label="图片主题">${groups.map(group => `<span>${esc(group.label)}<small>${counts(group.entries).images}</small></span>`).join('')}</div></div>${groups.map(group => `<section class="life-photo-group" aria-label="${esc(group.label)}"><div class="life-photo-group-heading"><h3>${esc(group.label)}</h3><span>${counts(group.entries).images} 张图</span></div>${cardsHtml(group.entries, chapterList, true)}</section>`).join('')}<p class="life-photo-note">图中位置、营业、配送或课程安排具有时间范围，请结合原帖日期与当前通知使用。</p>`;
  }

  window.NAULifeImages = Object.freeze({renderChapter, renderIndex});
})();
