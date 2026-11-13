// Reader-facing rows for the download workbook. No spreadsheet authoring here.
const list = value => Array.isArray(value) ? value : value == null ? [] : [value];
const text = value => value == null ? '' : Array.isArray(value) ? value.map(text).filter(Boolean).join('\n') : typeof value === 'object' ? text(value.text ?? value.label ?? value.value ?? value.summary ?? '') : String(value);
const unique = values => [...new Set(values.filter(Boolean))];
const safeUrl = value => {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return '';
  try { const u = new URL(value); return ['http:','https:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; }
};
const urlOf = value => [value?.url, value?.canonicalUrl, value?.canonical_url, value?.originalUrl].map(safeUrl).find(Boolean) || '';
const sourceCodes = (site, values) => unique(list(values).flatMap(value => typeof value === 'string' ? value.split(/[\s、,，;；／/]+/) : []).filter(code => Object.hasOwn(site.sourceRegistry || {}, code)));
const citationCodes = (site, value) => {
  const found = [];
  for (const match of text(value).matchAll(/\[([^\[\]]+)\]/g)) {
    for (const token of match[1].split(/[\s、,，;；／/]+/)) {
      const range = token.match(/^([A-Z]*)(\d+)[—–-]([A-Z]*)(\d+)$/);
      if (range && (!range[3] || range[1] === range[3]) && +range[4] - +range[2] >= 0 && +range[4] - +range[2] <= 20) {
        for (let n = +range[2]; n <= +range[4]; n++) found.push(range[1] + String(n).padStart(range[2].length,'0'));
      } else found.push(token);
    }
  }
  return sourceCodes(site, found);
};
const isPublicPost = post => !post.screenedOnly && !String(post.category || '').includes('排除') && post.category !== '仅筛选记录';
const addLink = (links, rowIndex, colIndex, url, label = '打开来源') => { if (safeUrl(url)) links.push({rowIndex,colIndex,url:safeUrl(url),label}); };

function sourceDirectory(site) {
  const links = [];
  const rows = Object.entries(site.sourceRegistry || {}).map(([code, source], rowIndex) => {
    const url = urlOf(source);
    addLink(links,rowIndex,10,url,'打开原文');
    return [code,text(source.platform || source.kind),text(source.title || source.label),text(source.date),text(source.population),text(source.summary || source.points),
      unique([text(source.limitations),text(source.limits)]).join('\n'),
      unique([text(source.readingScope),text(source.readingScopes),text(source.latestPublicReadingScope)]).join('\n'),
      text(source.author),text(source.category),url,text(source.advisorNames)];
  });
  return {name:'完整来源目录',title:'完整来源目录',note:`${rows.length}项来源登记。编号可与其他表对应；同一页面可能对应不同用途，登记项数不是独立帖子或评价人数。`,
    headers:['来源编号','平台或来源类别','标题','日期原样','适用人群','内容摘要','适用限制','阅读范围','作者或部门','采用类别','原文链接','提及导师'],
    rows,widths:[16,22,54,25,48,72,78,68,28,28,54,24],links,tableName:'DownloadSourceRegistry20261113'};
}

function postIndex(site) {
  const links = [], posts = list(site.socialPosts), visible = posts.filter(isPublicPost).length;
  const rows = posts.map((post,rowIndex) => {
    const codes = sourceCodes(site,post.sourceIds);
    const url = urlOf(post);
    addLink(links,rowIndex,12,url,'打开原帖');
    return [codes.join('、') || text(post.id),isPublicPost(post) ? '网站可见' : '仅存筛选记录',text(post.platform),text(post.title),text(post.author),text(post.date),
      text(post.population),text(post.campus),text(post.summary),text(post.tips),
      unique([text(post.limitations),text(post.reviewReason)]).join('\n'),text(post.readingScopes),url,text(post.topic),text(post.category),text(post.id)];
  });
  return {name:'帖子索引',title:'帖子索引',note:`${posts.length}条原始记录，其中${visible}条网站可见，其余为筛选保留记录。校方访谈、实习公告与个人帖子分别标注，不能合计为导师亲历。`,
    headers:['来源编号','采用状态','平台','标题','作者','日期原样','适用人群','校区','内容摘要','具体要点','适用限制','阅读范围','原帖链接','主题','资料类别','记录编号'],
    rows,widths:[17,20,24,54,28,25,50,25,74,82,82,70,54,34,30,40],links,tableName:'NauTable4'};
}

function officialIndex(site) {
  const links = [];
  const rows = list(site.officialEvidence).map((item,rowIndex) => {
    const url = urlOf(item);
    addLink(links,rowIndex,8,url,'打开原文');
    return [unique([...sourceCodes(site,item.sourceIds),...list(item.ids).map(text)]).join('、'),text(item.topic),text(item.summary),text(item.population),text(item.limits),
      text(item.title),text(item.author),text(item.date_display),url,text(item.use_status),text(item.guide_categories),text(item.feedback_index_label),text(item.reading_scopes)];
  });
  return {name:'官方核实',title:'官方核实',note:`${rows.length}条官方资料记录。资格、历史活动、具名访谈和集体教学分开使用；官方成果不等于学生个人口碑，年份与学位范围见各行。`,
    headers:['来源编号','核实主题','官方内容','适用人群','适用限制','标题','作者或部门','日期原样','原文链接','采用状态','方向归类','反馈索引','阅读范围'],
    rows,widths:[18,28,82,52,82,56,30,26,54,40,22,42,70],links,tableName:'NauTable3'};
}

function lifePoints(site) {
  const rows = [], links = [], seen = new Set();
  const append = (row, url) => {
    const key = [row[1],row[2],row[10],url].join('\u0000');
    if (seen.has(key)) return;
    seen.add(key);
    const rowIndex = rows.length;
    rows.push(row);
    addLink(links,rowIndex,7,url,'打开首项来源');
  };
  for (const chapter of list(site.lifeChapters)) {
    let subheading = '';
    const walk = (blocks, inheritedCodes = []) => {
      for (const block of list(blocks)) {
        if (!block || block.readingArchive) continue;
        if (block.type === 'heading') { subheading = text(block.text); continue; }
        const codes = sourceCodes(site,block.sourceCodes?.length ? block.sourceCodes : inheritedCodes);
        const entries = [];
        if (block.type === 'p') entries.push({point:text(block.text),context:subheading});
        else if (block.type === 'table') for (const record of list(block.rows)) {
          const vals = list(record).map(text);
          entries.push({point:vals.map((value,index) => `${text(block.headers?.[index]) || `项目${index+1}`}：${value}`).join('\n'),context:subheading});
        }
        else if (['list','checklist','callout'].includes(block.type)) {
          if (block.text) entries.push({point:text(block.text),context:text(block.title || subheading)});
          for (const item of list(block.items)) entries.push({point:text(item),context:text(block.title || subheading)});
        }
        else if (block.type === 'details') { walk(block.blocks,codes); continue; }
        for (const item of entries) {
          if (!item.point) continue;
          const exact = citationCodes(site,item.point);
          const selectedCodes = exact.length ? exact : codes;
          const sources = selectedCodes.map(code => site.sourceRegistry[code]);
          const first = sources.find(source => urlOf(source));
          const url = first ? urlOf(first) : '';
          append([text(chapter.title),item.point,item.context,unique(sources.map(source => text(source.population))).join('\n'),
            unique(sources.flatMap(source => [text(source.limitations),text(source.limits)])).join('\n'),
            unique(sources.map(source => text(source.author))).join('、'),unique(sources.map(source => text(source.date))).join('；'),url,
            first ? text(first.title || first.label) : '',selectedCodes.length ? '生活简版正文' : '生活简版编辑建议',selectedCodes.join('、'),`${chapter.id}:brief:${rows.length+1}`],url);
        }
      }
    };
    walk(chapter.blocks);
  }
  for (const tip of list(site.tipsIndex)) {
    const url = urlOf(tip);
    append([text(tip.topic),text(tip.point),text(tip.context),text(tip.scope),text(tip.limits),text(tip.author),text(tip.date_display),url,text(tip.post_title),text(tip.status),text(tip.source_ids),text(tip.id)],url);
  }
  return {name:'生活学习要点',title:'生活学习要点',note:'16章简版正文与已存生活学习摘记。先看内容，再核对身份、校区、日期和限制；来源链接指向该行首项依据，全部编号可在完整来源目录检索。',
    headers:['主题','可用内容','原始情境','适用范围','适用限制','作者或部门','日期原样','来源链接','来源标题','资料类型或状态','来源编号','记录编号'],
    rows,widths:[28,82,72,52,84,28,26,54,54,34,26,42],links,tableName:'NauTable1'};
}

export function sourceSheets(site) {
  if (!site || typeof site !== 'object' || !site.sourceRegistry) throw new Error('Missing current site data');
  return [sourceDirectory(site),postIndex(site),officialIndex(site),lifePoints(site)];
}
