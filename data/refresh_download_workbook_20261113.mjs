import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {FileBlob, SpreadsheetFile} from '@oai/artifact-tool';
import {sourceSheets} from './downloads_workbook_sources_20261113.mjs';
import {studentOutcomeSheet,studentOutcomeSections} from './downloads_workbook_outcomes_20261114.mjs';

// Run a copy of this builder and its data module in an OS tmp directory,
// with node_modules linked to CODEX_PRIMARY_RUNTIME_NODE_MODULES.
const repo=path.resolve(process.env.NAU_REPO_ROOT||process.cwd());
const outputDir=path.resolve(process.env.NAU_WORKBOOK_OUTPUT||path.join(repo,'../outputs/nau-workbook-refresh-20261113'));
const source=path.join(repo,'dist/downloads/evidence-index.xlsx');
const baseline=path.join(outputDir,'evidence-index.before.xlsx');
const site=JSON.parse(await fs.readFile(path.join(repo,'dist/data/site-data.json'),'utf8'));
const scopedAliasRefresh=process.argv.includes('--alias-comments');
const scopedFirmRefresh=process.argv.includes('--firm-outcomes');
const scopedContinuationRefresh=process.argv.includes('--continuation');
if([scopedAliasRefresh,scopedFirmRefresh,scopedContinuationRefresh].filter(Boolean).length>1)throw Error('Choose one scoped refresh mode');
const scopedRefresh=scopedAliasRefresh||scopedFirmRefresh||scopedContinuationRefresh;
const affectedSheetNames=new Set(scopedContinuationRefresh?['完整来源目录','帖子索引','官方核实','生活学习要点','学生公开去向']:scopedFirmRefresh?['完整来源目录','帖子索引','官方核实','学生公开去向']:['导师反馈','学生评价总览','姓名缩写对照']);
const allReviews=site.mentors.flatMap(m=>m.studentReviews.reviews);
const reviewTotal=allReviews.length;
const reviewedMentorTotal=site.mentors.filter(m=>m.studentReviews.reviews.length).length;
const contextTotal=allReviews.filter(r=>r.contextNotes).length;
const signalLabel=r=>r.attribution?.status==='confirmed'&&['explicit','strong'].includes(r.selectionSignal?.intensity)&&['avoid','recommend'].includes(r.selectionSignal?.direction)?'原帖'+(r.selectionSignal.intensity==='strong'?'强烈':'明确')+(r.selectionSignal.direction==='avoid'?'劝退':'推荐'):'';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const arr=v=>Array.isArray(v)?v:v==null?[]:[v];
const text=v=>v==null?'':Array.isArray(v)?v.map(text).filter(Boolean).join('\n'):typeof v==='object'?(v.text||v.label||v.summary||v.name||''):String(v);
const units=s=>[...text(s)].reduce((n,c)=>n+(/[\u0000-\u00ff]/.test(c)?1:2),0);
const rowHeight=(r,widths)=>Math.max(28,...r.map((v,i)=>text(v).split('\n').reduce((n,l)=>n+Math.max(1,Math.ceil(units(l)/Math.max(10,widths[i]-3))),0)*13.5+10));
const unique=v=>[...new Set(v.filter(Boolean))];
const safe=v=>{try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
const col=i=>{let s='';for(i++;i>0;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;};
const sourceLinks=codes=>unique(arr(codes)).map(c=>({code:c,url:safe(site.sourceRegistry[c]?.url||site.sourceRegistry[c]?.canonicalUrl||site.sourceRegistry[c]?.originalUrl),label:c+' '+text(site.sourceRegistry[c]?.title||site.sourceRegistry[c]?.label)})).filter(x=>x.url);
const publicUrl=p=>new URL(p.replace(/^\.\//,''),'https://nishino0525nanase.github.io/nau-mpacc-guide/').href;
const names=ids=>arr(ids).map(id=>site.mentors.find(m=>m.id===id)?.name||id).join('、');
const aliasStatusLabel=a=>a.status==='ambiguous'?(arr(a.mentorIds).length>1?'多位候选':'候选未确认'):({matched:'姓名已对应',search_only:'仅检索写法'}[a.status]||a.status);
const datasets=[];
await fs.mkdir(outputDir,{recursive:true});
try{await fs.access(baseline);}catch{await fs.copyFile(source,baseline);}
const sourceSha=sha(await fs.readFile(baseline));
if(process.argv.includes('--finish')){await finish();process.exit(0);}
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(baseline));
if(process.argv.includes('--profile')){
 const profile=await wb.inspect({kind:'workbook,sheet,table',maxChars:14000,tableMaxRows:2,tableMaxCols:3,tableMaxCellChars:60});
 await fs.writeFile(path.join(outputDir,'before-profile.ndjson'),profile.ndjson);
 for(const [name,range] of scopedContinuationRefresh?[...affectedSheetNames].map(name=>[name,'A2:F8']):[['学生公开去向','A2:F8'],['学生公开去向','A39:F48']]){
  const blob=await wb.render({sheetName:name,range,scale:1,format:'png'});
  await fs.writeFile(path.join(outputDir,'before-'+name+'-'+range.replace(':','-')+'.png'),new Uint8Array(await blob.arrayBuffer()));
 }
 console.log(JSON.stringify({profile:path.join(outputDir,'before-profile.ndjson'),sourceSha}));process.exit(0);
}
const addSpec=s=>{if(!scopedRefresh||affectedSheetNames.has(s.name))datasets.push({...s,headerRow:s.headerRow||6});};
for(const s of sourceSheets(site))addSpec(s);

// One row per attributable review, including the original identity boundary.
const reviewRows=[],reviewLinks=[];
const typeNames={guidance:'具体指导经历',course:'课程接触',general:'笼统提名或印象',interview:'访谈经历'};
for(const mentor of site.mentors)for(const r of mentor.studentReviews.reviews){
 const note=r.contextNotes,shots=arr(r.screenshots);
 const url=safe(r.sourceUrl||r.canonicalUrl)||sourceLinks(r.sourceIds)[0]?.url||'';
 const shot=shots[0]?.src||(note?.excerpt?.kind==='visible_quote'?note.excerpt.screenshotSrc:'');
 const row=[mentor.name,text(r.text),[r.degree||'未说明',r.relationship||'未说明',typeNames[r.experienceType]||r.experienceType,r.firsthand===true?'本人经历自述':r.firsthand===false?'转述／非本人':'亲历情况未明确'].join('；'),text(r.limits),r.narrator||'未留存',r.date||'未显示',url,r.sourceTitle||'',r.postAuthor||'',r.postDate||'',r.contextAssessment?.displayLabel||mentor.studentReviews.coverageLabel,text(r.sourceIds),r.id,note?({summary:'已存摘要',recorded_quote:'此前摘记原话',visible_quote:'截图可见片段'}[note.excerpt.kind]||''):'',text(note?.excerpt?.text),text(note?.context),text(note?.interpretation?.text),[text(note?.interpretation?.alternative),text(note?.limits),text(note?.excerpt?.scope)].filter(Boolean).join('\n'),shot?publicUrl(shot):''];
 const label=signalLabel(r);if(label)row[10]=[label,row[10]].filter(Boolean).join('；');
 const rowIndex=reviewRows.length;reviewRows.push(row);
 if(url)reviewLinks.push({rowIndex,colIndex:6,url,label:'打开原文'});
 if(shot)reviewLinks.push({rowIndex,colIndex:18,url:publicUrl(shot),label:'查看已存截图'});
}
addSpec({name:'导师反馈',title:'导师评价原文与语境',note:`${reviewTotal}条档案记录涉及${reviewedMentorTotal}位导师。原话、摘要与解读分别列示；同条评论提到多位导师的引用不算独立样本。`,headers:['教师全名','评价内容','接触关系与学位','适用边界','评论者','评论日期原样','原文链接','来源帖子','发帖者','发帖日期原样','评价性质','来源编号','评价编号','片段类型','原话或已存摘要','上下文','可能的意思','解读边界与截图范围','评论截图'],rows:reviewRows,links:reviewLinks,widths:[14,66,48,66,28,25,22,42,24,25,30,24,37,22,56,64,64,76,24],tableName:'NauTable2'});

// The teacher overview stays at the original 34-teacher grain.
const teacherRows=[],teacherLinks=[];
for(const m of site.mentors){const d=m.studentReviews,reviews=d.reviews,links=unique(reviews.map(r=>safe(r.sourceUrl||r.canonicalUrl)).filter(Boolean));
 const points=xs=>arr(xs).map(p=>[p.text,p.scope?('范围：'+p.scope):'',arr(p.reviewIds).length?('评价编号：'+text(p.reviewIds)):''].filter(Boolean).join('\n')).join('\n\n');
 const row=[m.name,d.coverageLabel,reviews.length?reviews.map(r=>r.text+'\n'+r.id).join('\n\n'):d.summary,reviews.map(r=>[r.narrator,'学位：'+(r.degree||'未说明'),'关系：'+(r.relationship||'未说明'),r.firsthand===true?'本人经历自述':r.firsthand===false?'转述／非本人':'亲历未明确',r.date].filter(Boolean).join('；')).join('\n\n'),points(d.recommendationPoints),points(d.concerns),text(d.verificationQuestions),[text(d.gaps),d.sampleCountNote].filter(Boolean).join('\n'),...Array.from({length:3},(_,i)=>links[i]||'')];
 const rowIndex=teacherRows.length;teacherRows.push(row);links.slice(0,3).forEach((url,i)=>teacherLinks.push({rowIndex,colIndex:8+i,url,label:'查看原文 '+(i+1)}));
}
addSpec({name:'学生评价总览',title:'学生评价总览',note:`${site.mentors.length}位导师，${reviewTotal}条档案记录。缩写对应姓名与本人亲历分别核对；完整评论与${contextTotal}条语境说明见导师反馈。`,headers:['导师','评价覆盖情况','原文内容与评价编号','评论者身份与接触年份','有经历支持的推荐理由','有经历支持的提醒','选导师前应核实的问题','资料缺口','原文来源1','原文来源2','原文来源3'],rows:teacherRows,links:teacherLinks,widths:[14,28,100,88,82,82,84,84,32,32,32],tableName:'StudentReviews103'});

const resources=[],resourceLinks=[];
const kindNames={internship_program:'实习项目',job_listing:'岗位列表线索',channel:'长期投递入口',historical:'历史公告',graduate_recruitment:'毕业生正式招聘',preparation_program:'校园准备项目'};
for(const firm of site.internships.firms)for(const r of firm.resources){
 const url=safe(r.url),links=sourceLinks(r.sourceIds),nanjing=arr(firm.officeRecords).filter(o=>o.city==='南京');
 const date=r.deadlineDate||r.deadline;const deadline=/^\d{4}-\d{2}-\d{2}$/.test(date||'')?new Date(date+'T00:00:00Z'):null;
 const row=[firm.name,firm.group==='big_four'?'四大':firm.group==='enterprise'?'企业':firm.group==='domestic'?'国内所':firm.group,r.title,kindNames[r.kind]||r.kind,[r.statusLabel,r.statusDetail].filter(Boolean).join('\n'),[text(r.cityTags),r.geographyNote].filter(Boolean).join('\n'),text(r.eligibility),text(r.applicationWindow),text(r.period),deadline,['每周出勤：'+(text(r.attendance)||'未公布'),'最短时长：'+(text(r.duration)||'未公布')].join('\n'),[r.summary,text(r.roleDirections),text(r.requirements),text(r.steps)].filter(Boolean).join('\n'),[text(r.limits),r.geographyNote].filter(Boolean).join('\n'),nanjing.map(o=>[o.district,o.branch,o.address].filter(Boolean).join(' ')).join('\n'),url,...Array.from({length:3},(_,i)=>links[i]?.url||''),r.id,text(r.sourceIds)];
 const rowIndex=resources.length;resources.push(row);if(url)resourceLinks.push({rowIndex,colIndex:14,url,label:'打开项目或渠道'});links.slice(0,3).forEach((x,i)=>resourceLinks.push({rowIndex,colIndex:15+i,url:x.url,label:x.code+' 原文'}));
}
for(const x of site.internships.expansionInstitutions||[]){const links=sourceLinks(x.sourceIds),url=safe(x.url)||links[0]?.url||'';const rowIndex=resources.length;resources.push([x.name,'校内合作拓展','实践基地及机构关注线索','合作基地介绍','非本期招聘',x.officeAddress||'',null,null,null,null,null,x.summary,[x.statusDetail,text(x.limits),'合作基地不保证个人实习名额。'].filter(Boolean).join('\n'),x.officeAddress||'',url,...Array.from({length:3},(_,i)=>links[i]?.url||''),x.id,text(x.sourceIds)]);if(url)resourceLinks.push({rowIndex,colIndex:14,url,label:'合作基地原文'});links.slice(0,3).forEach((x,i)=>resourceLinks.push({rowIndex,colIndex:15+i,url:x.url,label:x.code+' 原文'}));}
addSpec({name:'实习资源',title:'事务所与企业实习资源',note:'23家机构的53条项目或渠道，另列7条校内合作线索。申请窗口、实施期及明确截止分别列示；办公室不等于实际到岗点。',headers:['机构','分组','项目或渠道名称','资源性质','状态与适用时间','岗位城市及范围','申请对象','申请窗口','实习实施期','明确截止日期','出勤与最短时长','具体内容与准备','适用边界','南京办公室参考','项目或投递入口','原文依据1','原文依据2','原文依据3','资源编号','来源编号'],rows:resources,links:resourceLinks,widths:[18,18,44,24,60,62,56,44,46,19,45,90,90,62,30,30,30,30,38,28],tableName:'InternshipResources104',dateCols:[9]});

const aliases=[],aliasLinks=[];
for(const a of site.mentorAliases){const links=sourceLinks(a.sourceIds),rowIndex=aliases.length;aliases.push([a.alias,names(a.mentorIds),aliasStatusLabel(a),a.observedInComment===true?'原帖出现':'未作为原帖评价',text(a.variants),a.basis,text(a.reviewIds),text(a.sourceIds),links[0]?.url||'']);if(links[0])aliasLinks.push({rowIndex,colIndex:8,url:links[0].url,label:links[0].code+' 原文'});}
addSpec({name:'姓名缩写对照',title:'导师姓名与缩写对照',note:`${site.mentorAliases.length}项写法。WY、LH等多位候选并列；仅检索写法不代表原帖出现，也不构成学生评价。`,headers:['原帖或检索写法','对应姓名或候选','对应情况','原帖出现情况','其他写法','对应依据','关联评价编号','来源编号','原文'],rows:aliases,links:aliasLinks,widths:[24,32,24,28,40,70,55,30,32],tableName:'MentorAliases113'});

const outcomeSpec=studentOutcomeSheet(site,sourceLinks);
const outcomeSections=studentOutcomeSections(site,outcomeSpec,sourceLinks);
addSpec(outcomeSpec);

const imageRows=[],imageLinks=[];
for(const entry of site.lifeImageIndex.entries)for(const im of entry.images){const rowIndex=imageRows.length,original=safe(im.originalImageUrl);imageRows.push([entry.title,entry.kind,entry.sourceAuthor||'',entry.sourceDate||'',text(entry.chapterIds),im.caption||'',entry.scopeNote||'',safe(entry.sourceUrl),publicUrl(im.src),original,im.width??null,im.height??null,im.sha256||'']);if(safe(entry.sourceUrl))imageLinks.push({rowIndex,colIndex:7,url:safe(entry.sourceUrl),label:entry.sourceCode+' 来源页'});imageLinks.push({rowIndex,colIndex:8,url:publicUrl(im.src),label:'查看已存原图'});if(original)imageLinks.push({rowIndex,colIndex:9,url:original,label:'发布方原图'});}
addSpec({name:'校园生活图片',title:'校园与宿舍来源图片',note:'24张原图，来自16个原始来源。宿舍楼栋、年份和适用范围以各行说明为准；地图旧标记不代表当前分配。',headers:['图片主题','类别','原发布者','来源日期原样','对应章节','图注','适用范围','来源页','已存原图','发布方原图','宽度像素','高度像素','原图SHA256'],rows:imageRows,links:imageLinks,widths:[34,20,42,28,38,70,90,32,28,28,18,18,72],tableName:'LifeImages113'});

const qaRows=[];
for(const spec of datasets){
 console.log('Preparing sheet '+spec.name);
 let sh;try{sh=wb.worksheets.getItem(spec.name);}catch{sh=wb.worksheets.add(spec.name);}
 if(!sh)sh=wb.worksheets.add(spec.name);
 for(const t of [...sh.tables.items])t.delete();
 const used=sh.getUsedRange();if(used){used.unmerge();used.clear({applyTo:'all'});}
 const width=spec.headers.length,lastCol=col(width-1),lastRow=spec.headerRow+spec.rows.length;
 sh.showGridLines=false;sh.tabColor='#173B50';
 sh.getRange('A2').values=[[spec.title]];
 sh.getRange('A2').format={font:{name:'Arial',size:14,bold:true,color:'#173B50'},rowHeight:26};
 sh.getRange(`A3:${lastCol}4`).merge();sh.getRange('A3').values=[[spec.note]];
 sh.getRange(`A3:${lastCol}4`).format={font:{name:'Arial',size:10,color:'#5C6570'},wrapText:true,verticalAlignment:'center',rowHeight:18};
 sh.getRange(`A${spec.headerRow}:${lastCol}${lastRow}`).values=[spec.headers,...spec.rows];
 sh.getRange(`A${spec.headerRow+1}:${lastCol}${lastRow}`).format={font:{name:'Arial',size:10,color:'#243441'},wrapText:true,verticalAlignment:'top'};
 spec.widths.forEach((n,i)=>sh.getRange(`${col(i)}:${col(i)}`).format.columnWidth=n);
 let maxHeight=0;
 const displayRows=spec.rows.map(row=>[...row]);for(const l of spec.links||[])displayRows[l.rowIndex][l.colIndex]=l.label||'原文';
 for(let i=0;i<spec.rows.length;i++){
  const h=rowHeight(displayRows[i],spec.widths);if(h>408)throw Error(`${spec.name} row ${i+1} needs ${h}pt`);maxHeight=Math.max(maxHeight,h);
  const range=sh.getRange(`A${spec.headerRow+1+i}:${lastCol}${spec.headerRow+1+i}`);range.format.rowHeight=h;range.format.fill=i%2?'#FFFFFF':'#F3F6F8';
 }
 const table=sh.tables.add(`A${spec.headerRow}:${lastCol}${lastRow}`,true,spec.tableName);table.showFilterButton=true;
 sh.getRange(`A${spec.headerRow}:${lastCol}${spec.headerRow}`).format={font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},fill:'#173B50',wrapText:true,horizontalAlignment:'center',verticalAlignment:'center',rowHeight:30,borders:{insideVertical:{style:'thin',color:'#FFFFFF'}}};
 const linkCols=unique((spec.links||[]).map(l=>l.colIndex));
 for(const c of linkCols){const formulas=Array.from({length:spec.rows.length},()=>[null]);for(const l of spec.links.filter(l=>l.colIndex===c)){if(!safe(l.url))throw Error('Unsafe URL');formulas[l.rowIndex]=['=HYPERLINK("'+l.url.replace(/"/g,'""')+'","'+(l.label||'原文').replace(/"/g,'""')+'")'];}const range=sh.getRange(`${col(c)}${spec.headerRow+1}:${col(c)}${lastRow}`);range.formulas=formulas;range.format.font={name:'Arial',size:10,color:'#24627B'};}
 for(const c of spec.dateCols||[])sh.getRange(`${col(c)}${spec.headerRow+1}:${col(c)}${lastRow}`).setNumberFormat('yyyy-mm-dd');
 sh.freezePanes.freezeRows(spec.headerRow);sh.freezePanes.freezeColumns(2);
 qaRows.push({name:spec.name,rows:spec.rows.length,columns:width,links:spec.links?.length||0,maxRowHeight:maxHeight,tableName:spec.tableName});
}

// Statistics and thesis awards remain separate from employment/PhD records.
if(!scopedAliasRefresh){
 const sh=wb.worksheets.getItem('学生公开去向');
 for(const section of outcomeSections){
  const r=section.headerRow,last=r+section.rows.length,lastCol=col(section.headers.length-1);
  sh.getRange(`A${section.titleRow}`).values=[[section.title]];
  sh.getRange(`A${section.titleRow}:${lastCol}${section.titleRow}`).format={font:{name:'Arial',size:10,bold:true,color:'#173B50'},rowHeight:24};
  sh.getRange(`A${r}:${lastCol}${last}`).values=[section.headers,...section.rows];
  sh.getRange(`A${r}:${lastCol}${last}`).format={font:{name:'Arial',size:10,color:'#243441'},wrapText:true,verticalAlignment:'top'};
  sh.tables.add(`A${r}:${lastCol}${last}`,true,section.tableName).showFilterButton=true;
  sh.getRange(`A${r}:${lastCol}${r}`).format={fill:'#173B50',font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},horizontalAlignment:'center',verticalAlignment:'center',rowHeight:30};
  section.rows.forEach((row,i)=>{
   const display=[...row],link=section.links.find(l=>l.rowIndex===i);if(link)display[link.colIndex]=link.label;
   const height=rowHeight(display,section.widths);
   if(height>408)throw Error(`学生公开去向 ${section.key} row ${i+1} needs ${height}pt`);
   sh.getRange(`A${r+i+1}:${lastCol}${r+i+1}`).format.rowHeight=height;
  });
  for(const link of section.links)sh.getRange(`${col(link.colIndex)}${r+link.rowIndex+1}`).formulas=[['=HYPERLINK("'+link.url.replace(/"/g,'""')+'","'+link.label.replace(/"/g,'""')+'")']];
 }
}

// These pages are retained historical source selections, not current totals.
for(const name of scopedRefresh?[]:['正文未读线索','检索覆盖','补充证据','应用版补充','延伸核验','继续补读']){
 const sh=wb.worksheets.getItem(name);
 if(name==='正文未读线索')sh.getRange('A3').values=[['6条正文未读线索，不计入采用的127条原帖与访谈，也不用于推断导师风格或学校政策。']];
 else sh.getRange('A3').values=[['历史专题记录。当前资料逐项见完整来源目录、导师反馈、学生公开去向及实习资源。']];
}
wb.recalculate();
for(const name of scopedRefresh?[...affectedSheetNames]:['导师反馈','学生公开去向','姓名缩写对照','校园生活图片']){
 const inspected=await wb.inspect({kind:'table',range:`'${name}'!A6:F9`,include:'values,formulas',tableMaxRows:4,tableMaxCols:6,tableMaxCellChars:120,maxChars:2500});
 await fs.writeFile(path.join(outputDir,'inspect-'+name+'.ndjson'),inspected.ndjson);
}
const errorScan=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20},maxChars:3000});
await fs.writeFile(path.join(outputDir,'artifact-formula-scan.ndjson'),errorScan.ndjson);
const stage=path.join(outputDir,'artifact-authored.xlsx');await(await SpreadsheetFile.exportXlsx(wb)).save(stage);
await fs.writeFile(path.join(outputDir,'workbook-model.json'),JSON.stringify({sourceSha,rows:qaRows,datasets,outcomeSections:scopedAliasRefresh?[]:outcomeSections,scope:scopedContinuationRefresh?'continuation':scopedFirmRefresh?'firm-outcomes':scopedAliasRefresh?'alias-comments':'full'},null,2)+'\n');
console.log(JSON.stringify({authored:stage,sheets:qaRows,sourceSha},null,2));

async function finish(){
 const awardLayoutPreviewOnly=scopedContinuationRefresh&&process.argv.includes('--award-layout-preview');
 const stage=path.join(outputDir,'artifact-authored.xlsx');
 const model=JSON.parse(await fs.readFile(path.join(outputDir,'workbook-model.json'),'utf8'));
 const layout=await SpreadsheetFile.importXlsx(await FileBlob.load(stage));
 const aliasSpec=model.datasets.find(s=>s.name==='姓名缩写对照');
 if(aliasSpec)for(let i=0;i<aliasSpec.rows.length;i++){
  const a=site.mentorAliases.find(a=>a.alias===aliasSpec.rows[i][0]);if(!a)throw Error('Unknown alias');
  aliasSpec.rows[i][2]=aliasStatusLabel(a);
  layout.worksheets.getItem(aliasSpec.name).getRange(`C${aliasSpec.headerRow+1+i}`).values=[[aliasStatusLabel(a)]];
 }
 await fs.writeFile(path.join(outputDir,'workbook-model.json'),JSON.stringify(model,null,2)+'\n');
 for(const spec of model.datasets){
  const sh=layout.worksheets.getItem(spec.name),displayRows=spec.rows.map(r=>[...r]);for(const l of spec.links||[])displayRows[l.rowIndex][l.colIndex]=l.label||'原文';
  const heights=displayRows.map(row=>Math.max(28,...row.map((v,i)=>text(v).split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil([...line].reduce((n,c)=>n+(/[\u0000-\u00ff]/.test(c)?1:2),0)/Math.max(10,spec.widths[i]-3))),0)*13.5+10)));
  for(let i=0;i<heights.length;){let j=i+1;while(j<heights.length&&heights[j]===heights[i])j++;sh.getRange(`A${spec.headerRow+1+i}:${col(spec.headers.length-1)}${spec.headerRow+j}`).format.rowHeight=heights[i];i=j;}
  model.rows.find(r=>r.name===spec.name).maxRowHeight=Math.max(...heights);
 }
 for(const section of model.outcomeSections||[]){
  const sh=layout.worksheets.getItem('学生公开去向');
  section.rows.forEach((row,i)=>{const display=[...row],link=section.links.find(l=>l.rowIndex===i);if(link)display[link.colIndex]=link.label;sh.getRange(`A${section.headerRow+1+i}:${col(section.headers.length-1)}${section.headerRow+1+i}`).format.rowHeight=rowHeight(display,section.widths);});
 }
 layout.recalculate();
 const adjusted=path.join(outputDir,'artifact-layout.xlsx');await(await SpreadsheetFile.exportXlsx(layout)).save(adjusted);
 const cleaned=path.join(outputDir,'recalc-input.xlsx');
 const python=process.env.CODEX_PRIMARY_RUNTIME_PYTHON;
 execFileSync(python,['-c',String.raw`
import sys,zipfile,json,xml.etree.ElementTree as E,posixpath
src,out,model=sys.argv[1:];names={s['name'] for s in json.load(open(model))['datasets']};Q='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}';R='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
with zipfile.ZipFile(src) as z:p={n:z.read(n) for n in z.namelist()}
rels={r.attrib['Id']:r.attrib['Target'] for r in E.fromstring(p['xl/_rels/workbook.xml.rels'])}
for s in E.fromstring(p['xl/workbook.xml']).find(Q+'sheets'):
 if s.attrib['name'] not in names:continue
 t=rels[s.attrib[R+'id']];part=t.lstrip('/') if t.startswith('/') else posixpath.normpath(posixpath.join('xl',t));root=E.fromstring(p[part]);h=root.find(Q+'hyperlinks')
 if h is not None:root.remove(h)
 p[part]=E.tostring(root,encoding='utf-8',xml_declaration=True)
for part,payload in list(p.items()):
 if not part.startswith('xl/worksheets/') or not part.endswith('.xml'):continue
 root=E.fromstring(payload)
 for c in root.iter(Q+'c'):
  f=c.find(Q+'f')
  if f is not None and not f.text:c.remove(f)
 p[part]=E.tostring(root,encoding='utf-8',xml_declaration=True)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for n,b in p.items():z.writestr(n,b)
`,adjusted,cleaned,path.join(outputDir,'workbook-model.json')],{timeout:30000});
 const nativeDir=path.join(outputDir,'native-recalculated');await fs.mkdir(nativeDir,{recursive:true});
 const native=path.join(nativeDir,'recalc-input.xlsx');await fs.rm(native,{force:true});
 const soffice=path.join(process.env.CODEX_PRIMARY_RUNTIME_ROOT,'dependencies/native/libreoffice-headless/libreoffice/program/soffice');
 execFileSync(soffice,[`-env:UserInstallation=file://${path.join(outputDir,'lo-profile')}`,'--headless','--convert-to','xlsx','--outdir',nativeDir,cleaned],{timeout:120000,maxBuffer:1024*1024});
 const final=path.join(outputDir,'evidence-index.xlsx');
 const result=JSON.parse(execFileSync(python,['-c',String.raw`
import sys,zipfile,json,copy,xml.etree.ElementTree as E,posixpath
src,native,out=sys.argv[1:];Q='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}';R='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
def load(f):
 with zipfile.ZipFile(f) as z:
  assert z.testzip() is None
  return {n:z.read(n) for n in z.namelist()}
def sheets(p):
 rels={r.attrib['Id']:r.attrib['Target'] for r in E.fromstring(p['xl/_rels/workbook.xml.rels'])};ans={}
 for s in E.fromstring(p['xl/workbook.xml']).find(Q+'sheets'):
  t=rels[s.attrib[R+'id']];ans[s.attrib['name']]=t.lstrip('/') if t.startswith('/') else posixpath.normpath(posixpath.join('xl',t))
 return ans
a,b=load(src),load(native);am,bm=sheets(a),sheets(b);ss=E.fromstring(b['xl/sharedStrings.xml']) if 'xl/sharedStrings.xml' in b else []
count=0;errors=[]
for name,part in am.items():
 root=E.fromstring(a[part]);nc={c.attrib['r']:c for c in E.fromstring(b[bm[name]]).iter(Q+'c')}
 for c in root.iter(Q+'c'):
  if c.find(Q+'f') is None:continue
  n=nc.get(c.attrib['r']);assert n is not None,(name,c.attrib['r']);v=n.find(Q+'v')
  assert v is not None,(name,c.attrib['r'],'native cache absent')
  typ=n.attrib.get('t');value=v.text or ''
  if typ=='s':typ='str';value=''.join(ss[int(value)].itertext())
  if typ=='e':errors.append([name,c.attrib['r'],value])
  for old in c.findall(Q+'v'):c.remove(old)
  c.attrib.pop('t',None)
  if typ in ['str','b','e']:c.set('t',typ)
  E.SubElement(c,Q+'v').text=value;count+=1
 a[part]=E.tostring(root,encoding='utf-8',xml_declaration=True)
assert not errors,errors
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for n,p in a.items():z.writestr(n,p)
tables=[n for n in a if n.startswith('xl/tables/') and n.endswith('.xml')]
rows={name:len([r for r in E.fromstring(a[part]).iter(Q+'row') if len(r)]) for name,part in am.items()}
print(json.dumps({'sheets':len(am),'tables':len(tables),'formulas':count,'formulaErrors':errors,'rows':rows},ensure_ascii=False))
`,cleaned,native,final],{timeout:30000,maxBuffer:1024*1024}));
 const finalWb=await SpreadsheetFile.importXlsx(await FileBlob.load(final));
 // The renderer's HYPERLINK evaluator is incomplete. Display-copy labels are
 // used only for PNGs; the saved workbook keeps its native formulas/caches.
 for(const spec of model.datasets){const sh=finalWb.worksheets.getItem(spec.name);for(const c of unique(spec.links.map(l=>l.colIndex))){const values=Array.from({length:spec.rows.length},()=>['']);for(const l of spec.links.filter(l=>l.colIndex===c))values[l.rowIndex]=[l.label||'原文'];sh.getRange(`${col(c)}${spec.headerRow+1}:${col(c)}${spec.headerRow+spec.rows.length}`).values=values;}}
 for(const section of model.outcomeSections||[])for(const link of section.links)finalWb.worksheets.getItem('学生公开去向').getRange(`${col(link.colIndex)}${section.headerRow+1+link.rowIndex}`).values=[[link.label]];
 finalWb.recalculate();
 const renderFiles=[];
 for(const name of awardLayoutPreviewOnly?[]:scopedRefresh?[...affectedSheetNames]:['完整来源目录','正文未读线索','生活学习要点','导师反馈','官方核实','帖子索引','检索覆盖','补充证据','应用版补充','延伸核验','继续补读','学生评价总览','实习资源','姓名缩写对照','学生公开去向','校园生活图片']){
  const blob=await finalWb.render({sheetName:name,range:'A2:F8',scale:1,format:'png'});
  const file='after-'+name+'.png';renderFiles.push(file);await fs.writeFile(path.join(outputDir,file),new Uint8Array(await blob.arrayBuffer()));
 }
 const outcomeDetails=(model.outcomeSections||[]).map(section=>['学生公开去向',`A${section.titleRow}:${col(section.headers.length-1)}${section.headerRow+Math.min(2,section.rows.length)}`,section.key]);
 const extra=scopedAliasRefresh?[['导师反馈','M6:S8'],['姓名缩写对照','E6:I9']]:scopedFirmRefresh||scopedContinuationRefresh?[['学生公开去向','G6:N9','firms'],...outcomeDetails]:[['导师反馈','M6:S8'],...outcomeDetails,['校园生活图片','G6:M8'],['姓名缩写对照','E6:I9']];
 for(const [name,range,key] of awardLayoutPreviewOnly?[]:extra){const blob=await finalWb.render({sheetName:name,range,scale:1,format:'png'});const file='after-detail-'+name+(key?'-'+key:'')+'.png';renderFiles.push(file);await fs.writeFile(path.join(outputDir,file),new Uint8Array(await blob.arrayBuffer()));}
 if(scopedContinuationRefresh){
  const views=[];
  for(const name of awardLayoutPreviewOnly?[]:['完整来源目录','官方核实','生活学习要点']){
   const spec=model.datasets.find(item=>item.name===name);
   const indexes=spec.rows.map((row,index)=>({row,index})).filter(({row})=>/(?:CD0[1-4]|CO01)/.test(row.join('\n'))).map(item=>item.index);
   for(let i=0;i<indexes.length;i+=2){const first=indexes[i],last=indexes[Math.min(i+1,indexes.length-1)];views.push([name,`A${spec.headerRow+1+first}:F${spec.headerRow+1+last}`,`${name}-new-${i/2+1}`]);}
  }
  const awards=(model.outcomeSections||[]).find(section=>section.key==='achievements');
  if(awards)for(let i=0;i<awards.rows.length;i+=2)views.push(['学生公开去向',`A${awards.headerRow+1+i}:F${awards.headerRow+Math.min(i+2,awards.rows.length)}`,`achievements-${i/2+1}`]);
  const employers=(model.outcomeSections||[]).find(section=>section.key==='employerSummaries');
  if(employers&&!awardLayoutPreviewOnly)views.push(['学生公开去向',`A${employers.headerRow}:F${employers.headerRow+employers.rows.length}`,'employer-details']);
  for(const [name,range,key] of views){const blob=await finalWb.render({sheetName:name,range,scale:1,format:'png'});const file=`after-continuation-${key}.png`;renderFiles.push(file);await fs.writeFile(path.join(outputDir,file),new Uint8Array(await blob.arrayBuffer()));}
 }
 if(scopedAliasRefresh){
  const spec=model.datasets.find(s=>s.name==='导师反馈');
  for(const id of ['sr-alias-comments-20261113-xw','sr-alias-comments-20261113-cxj','sr-alias-comments-20261113-tzd']){
   const i=spec.rows.findIndex(row=>row[12]===id);if(i<0)throw Error('Missing new comment '+id);
   const row=spec.headerRow+1+i;
   for(const [part,range] of [['identity',`A${row}:F${row}`],['context',`K${row}:S${row}`]]){
    const blob=await finalWb.render({sheetName:'导师反馈',range,scale:1,format:'png'});
    const file=`after-${id}-${part}.png`;renderFiles.push(file);await fs.writeFile(path.join(outputDir,file),new Uint8Array(await blob.arrayBuffer()));
   }
  }
 }
 result.sourceSha256=model.sourceSha;result.outputSha256=sha(await fs.readFile(final));result.outputBytes=(await fs.stat(final)).size;result.renderFiles=renderFiles;result.datasets=model.rows;
 result.scope=model.scope;result.outcomeSummary=model.datasets.find(spec=>spec.name==='学生公开去向')?.summary;
 result.outcomeSections=(model.outcomeSections||[]).map(section=>({key:section.key,titleRow:section.titleRow,headerRow:section.headerRow,lastRow:section.headerRow+section.rows.length,rows:section.rows.length,tableName:section.tableName}));
 await fs.writeFile(path.join(outputDir,'verification.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
}
