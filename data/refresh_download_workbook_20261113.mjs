import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {FileBlob, SpreadsheetFile} from '@oai/artifact-tool';
import {sourceSheets} from './downloads_workbook_sources_20261113.mjs';

// Run a copy of this builder and its data module in an OS tmp directory,
// with node_modules linked to CODEX_PRIMARY_RUNTIME_NODE_MODULES.
const repo=path.resolve(process.env.NAU_REPO_ROOT||process.cwd());
const outputDir=path.resolve(process.env.NAU_WORKBOOK_OUTPUT||path.join(repo,'../outputs/nau-workbook-refresh-20261113'));
const source=path.join(repo,'dist/downloads/evidence-index.xlsx');
const baseline=path.join(outputDir,'evidence-index.before.xlsx');
const site=JSON.parse(await fs.readFile(path.join(repo,'dist/data/site-data.json'),'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const arr=v=>Array.isArray(v)?v:v==null?[]:[v];
const text=v=>v==null?'':Array.isArray(v)?v.map(text).filter(Boolean).join('\n'):typeof v==='object'?(v.text||v.label||v.summary||v.name||''):String(v);
const unique=v=>[...new Set(v.filter(Boolean))];
const safe=v=>{try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
const col=i=>{let s='';for(i++;i>0;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;};
const sourceLinks=codes=>unique(arr(codes)).map(c=>({code:c,url:safe(site.sourceRegistry[c]?.url||site.sourceRegistry[c]?.canonicalUrl||site.sourceRegistry[c]?.originalUrl),label:c+' '+text(site.sourceRegistry[c]?.title||site.sourceRegistry[c]?.label)})).filter(x=>x.url);
const publicUrl=p=>new URL(p.replace(/^\.\//,''),'https://nishino0525nanase.github.io/nau-mpacc-guide/').href;
const names=ids=>arr(ids).map(id=>site.mentors.find(m=>m.id===id)?.name||id).join('、');
const datasets=[];
await fs.mkdir(outputDir,{recursive:true});
try{await fs.access(baseline);}catch{await fs.copyFile(source,baseline);}
const sourceSha=sha(await fs.readFile(baseline));
if(process.argv.includes('--finish')){await finish();process.exit(0);}
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(baseline));
const addSpec=s=>datasets.push({...s,headerRow:s.headerRow||6});
for(const s of sourceSheets(site))addSpec(s);

// One row per attributable review, including the original identity boundary.
const reviewRows=[],reviewLinks=[];
const typeNames={guidance:'具体指导经历',course:'课程接触',general:'笼统提名或印象',interview:'访谈经历'};
for(const mentor of site.mentors)for(const r of mentor.studentReviews.reviews){
 const note=r.contextNotes,shots=arr(r.screenshots);
 const url=safe(r.sourceUrl||r.canonicalUrl)||sourceLinks(r.sourceIds)[0]?.url||'';
 const shot=shots[0]?.src||(note?.excerpt?.kind==='visible_quote'?note.excerpt.screenshotSrc:'');
 const row=[mentor.name,text(r.text),[r.degree||'未说明',r.relationship||'未说明',typeNames[r.experienceType]||r.experienceType,r.firsthand===true?'本人经历自述':r.firsthand===false?'转述／非本人':'亲历情况未明确'].join('；'),text(r.limits),r.narrator||'未留存',r.date||'未显示',url,r.sourceTitle||'',r.postAuthor||'',r.postDate||'',r.contextAssessment?.displayLabel||mentor.studentReviews.coverageLabel,text(r.sourceIds),r.id,note?({summary:'已存摘要',recorded_quote:'此前摘记原话',visible_quote:'截图可见片段'}[note.excerpt.kind]||''):'',text(note?.excerpt?.text),text(note?.context),text(note?.interpretation?.text),[text(note?.interpretation?.alternative),text(note?.limits),text(note?.excerpt?.scope)].filter(Boolean).join('\n'),shot?publicUrl(shot):''];
 const rowIndex=reviewRows.length;reviewRows.push(row);
 if(url)reviewLinks.push({rowIndex,colIndex:6,url,label:'打开原文'});
 if(shot)reviewLinks.push({rowIndex,colIndex:18,url:publicUrl(shot),label:'查看已存截图'});
}
addSpec({name:'导师反馈',title:'导师评价原文与语境',note:'44条记录涉及22位导师。原话、已存摘要与候选解读分别列示；提名、课程、转述和MPAcc指导经历不能互换。',headers:['教师全名','评价内容','接触关系与学位','适用边界','评论者','评论日期原样','原文链接','来源帖子','发帖者','发帖日期原样','评价性质','来源编号','评价编号','片段类型','原话或已存摘要','上下文','可能的意思','解读边界与截图范围','评论截图'],rows:reviewRows,links:reviewLinks,widths:[14,66,48,66,28,25,22,42,24,25,30,24,37,22,56,64,64,76,24],tableName:'NauTable2'});

// The teacher overview stays at the original 34-teacher grain.
const teacherRows=[],teacherLinks=[];
for(const m of site.mentors){const d=m.studentReviews,reviews=d.reviews,links=unique(reviews.map(r=>safe(r.sourceUrl||r.canonicalUrl)).filter(Boolean));
 const points=xs=>arr(xs).map(p=>[p.text,p.scope?('范围：'+p.scope):'',arr(p.reviewIds).length?('评价编号：'+text(p.reviewIds)):''].filter(Boolean).join('\n')).join('\n\n');
 const row=[m.name,d.coverageLabel,reviews.length?reviews.map(r=>r.text+'\n'+r.id).join('\n\n'):d.summary,reviews.map(r=>[r.narrator,'学位：'+(r.degree||'未说明'),'关系：'+(r.relationship||'未说明'),r.firsthand===true?'本人经历自述':r.firsthand===false?'转述／非本人':'亲历未明确',r.date].filter(Boolean).join('；')).join('\n\n'),points(d.recommendationPoints),points(d.concerns),text(d.verificationQuestions),[text(d.gaps),d.sampleCountNote].filter(Boolean).join('\n'),...Array.from({length:3},(_,i)=>links[i]||'')];
 const rowIndex=teacherRows.length;teacherRows.push(row);links.slice(0,3).forEach((url,i)=>teacherLinks.push({rowIndex,colIndex:8+i,url,label:'查看原文 '+(i+1)}));
}
addSpec({name:'学生评价总览',title:'学生评价总览',note:'34位导师，44条可归属记录。缩写对应姓名不等于证明亲历身份；完整评论与6条语境说明见导师反馈。',headers:['导师','评价覆盖情况','原文内容与评价编号','评论者身份与接触年份','有经历支持的推荐理由','有经历支持的提醒','选导师前应核实的问题','资料缺口','原文来源1','原文来源2','原文来源3'],rows:teacherRows,links:teacherLinks,widths:[14,28,100,88,82,82,84,84,32,32,32],tableName:'StudentReviews103'});

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
for(const a of site.mentorAliases){const links=sourceLinks(a.sourceIds),rowIndex=aliases.length;aliases.push([a.alias,names(a.mentorIds),({matched:'姓名已对应',ambiguous:'多位候选',search_only:'仅检索写法'}[a.status]||a.status),a.observedInComment===true?'原帖出现':'未作为原帖评价',text(a.variants),a.basis,text(a.reviewIds),text(a.sourceIds),links[0]?.url||'']);if(links[0])aliasLinks.push({rowIndex,colIndex:8,url:links[0].url,label:links[0].code+' 原文'});}
addSpec({name:'姓名缩写对照',title:'导师姓名与缩写对照',note:'39项写法。WY、LH等多位候选并列；仅检索写法不代表原帖出现，也不构成学生评价。',headers:['原帖或检索写法','对应姓名或候选','对应情况','原帖出现情况','其他写法','对应依据','关联评价编号','来源编号','原文'],rows:aliases,links:aliasLinks,widths:[24,32,24,28,40,70,55,30,32],tableName:'MentorAliases113'});

const outcomes=[],outcomeLinks=[];
for(const r of site.studentOutcomes.records){const links=sourceLinks(r.sourceIds),rowIndex=outcomes.length;outcomes.push([r.studentName,r.degreeLabel||r.degree,r.cohort||'',r.graduationYear??null,r.mentorName||'未公开',r.relationship?.text||'未公开',r.outcome.type==='phd'?'读博':r.outcome.type==='employment'?'就业':'其他升学',r.outcome.organization,r.outcome.program||'',r.outcome.year??null,r.outcome.statusLabel,r.outcome.asOf||'',text(r.limits),text(r.sourceIds),links[0]?.url||'',r.id]);if(links[0])outcomeLinks.push({rowIndex,colIndex:14,url:links[0].url,label:links[0].code+' 原文'});}
addSpec({name:'学生公开去向',title:'学生公开去向',note:'28条时间点记录涉及27人；明确MPAcc为6人7条。其余学位原样标注，签约、拟入职及历史任职不改写为当前状态。',headers:['学生','学位与专业','入学年级','毕业年份','导师','导师关系依据','去向类别','院校或单位','专业或岗位','去向年份','报道时状态','资料时点原样','适用边界','来源编号','原文','记录编号'],rows:outcomes,links:outcomeLinks,widths:[18,44,20,16,18,62,20,38,50,16,58,32,92,32,32,36],tableName:'StudentOutcomes113'});

const imageRows=[],imageLinks=[];
for(const entry of site.lifeImageIndex.entries)for(const im of entry.images){const rowIndex=imageRows.length,original=safe(im.originalImageUrl);imageRows.push([entry.title,entry.kind,entry.sourceAuthor||'',entry.sourceDate||'',text(entry.chapterIds),im.caption||'',entry.scopeNote||'',safe(entry.sourceUrl),publicUrl(im.src),original,im.width??null,im.height??null,im.sha256||'']);if(safe(entry.sourceUrl))imageLinks.push({rowIndex,colIndex:7,url:safe(entry.sourceUrl),label:entry.sourceCode+' 来源页'});imageLinks.push({rowIndex,colIndex:8,url:publicUrl(im.src),label:'查看已存原图'});if(original)imageLinks.push({rowIndex,colIndex:9,url:original,label:'发布方原图'});}
addSpec({name:'校园生活图片',title:'校园与宿舍来源图片',note:'24张原图，来自16个原始来源。宿舍楼栋、年份和适用范围以各行说明为准；地图旧标记不代表当前分配。',headers:['图片主题','类别','原发布者','来源日期原样','对应章节','图注','适用范围','来源页','已存原图','发布方原图','宽度像素','高度像素','原图SHA256'],rows:imageRows,links:imageLinks,widths:[34,20,42,28,38,70,90,32,28,28,18,18,72],tableName:'LifeImages113'});

const units=s=>[...text(s)].reduce((n,c)=>n+(/[\u0000-\u00ff]/.test(c)?1:2),0);
const rowHeight=(r,widths)=>Math.max(28,...r.map((v,i)=>text(v).split('\n').reduce((n,l)=>n+Math.max(1,Math.ceil(units(l)/Math.max(10,widths[i]-3))),0)*13.5+10));
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
{
 const sh=wb.worksheets.getItem('学生公开去向');
 const start=40;const stats=site.studentOutcomes.statistics;
 sh.getRange(`A${start}:F${start+stats.length}`).values=[['统计指标','人数','适用届别','学位点','适用边界','原文'],...stats.map(r=>[r.label,r.value,r.cohort,r.scope,text(r.limits),sourceLinks(r.sourceIds)[0]?.url||''])];
 sh.tables.add(`A${start}:F${start+stats.length}`,true,'OutcomeStatistics113');
 stats.forEach((r,i)=>{const l=sourceLinks(r.sourceIds)[0];if(l)sh.getRange(`F${start+i+1}`).formulas=[['=HYPERLINK("'+l.url.replace(/"/g,'""')+'","'+l.code+' 原文")']];});
 const aStart=46,awards=site.studentOutcomes.achievements;
 sh.getRange(`A${aStart}:F${aStart+awards.length}`).values=[['学生','学位','导师','论文成果','适用边界','原文'],...awards.map(r=>[r.studentName,r.degreeLabel,r.mentorName,r.achievement.text,text(r.limits),sourceLinks(r.sourceIds)[0]?.url||''])];
 sh.tables.add(`A${aStart}:F${aStart+awards.length}`,true,'ThesisAchievements113');
 awards.forEach((r,i)=>{const l=sourceLinks(r.sourceIds)[0];if(l)sh.getRange(`F${aStart+i+1}`).formulas=[['=HYPERLINK("'+l.url.replace(/"/g,'""')+'","'+l.code+' 原文")']];});
 for(const [r,count] of [[start,stats.length],[aStart,awards.length]]){
  sh.getRange(`A${r}:F${r+count}`).format={font:{name:'Arial',size:10,color:'#243441'},wrapText:true,verticalAlignment:'top',rowHeight:100};
  sh.getRange(`A${r}:F${r}`).format={fill:'#173B50',font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},rowHeight:30};
 }
}

// These pages are retained historical source selections, not current totals.
for(const name of ['正文未读线索','检索覆盖','补充证据','应用版补充','延伸核验','继续补读']){
 const sh=wb.worksheets.getItem(name);
 if(name==='正文未读线索')sh.getRange('A3').values=[['6条正文未读线索，不计入采用的127条原帖与访谈，也不用于推断导师风格或学校政策。']];
 else sh.getRange('A3').values=[['历史专题记录。当前资料逐项见完整来源目录、导师反馈、学生公开去向及实习资源。']];
}
wb.recalculate();
for(const name of ['导师反馈','学生公开去向','姓名缩写对照','校园生活图片']){
 const inspected=await wb.inspect({kind:'table',range:`'${name}'!A6:F9`,include:'values,formulas',tableMaxRows:4,tableMaxCols:6,tableMaxCellChars:120,maxChars:2500});
 await fs.writeFile(path.join(outputDir,'inspect-'+name+'.ndjson'),inspected.ndjson);
}
const errorScan=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20},maxChars:3000});
await fs.writeFile(path.join(outputDir,'artifact-formula-scan.ndjson'),errorScan.ndjson);
const stage=path.join(outputDir,'artifact-authored.xlsx');await(await SpreadsheetFile.exportXlsx(wb)).save(stage);
await fs.writeFile(path.join(outputDir,'workbook-model.json'),JSON.stringify({sourceSha,rows:qaRows,datasets},null,2)+'\n');
console.log(JSON.stringify({authored:stage,sheets:qaRows,sourceSha},null,2));

async function finish(){
 const stage=path.join(outputDir,'artifact-authored.xlsx');
 const model=JSON.parse(await fs.readFile(path.join(outputDir,'workbook-model.json'),'utf8'));
 const layout=await SpreadsheetFile.importXlsx(await FileBlob.load(stage));
 for(const spec of model.datasets){
  const sh=layout.worksheets.getItem(spec.name),displayRows=spec.rows.map(r=>[...r]);for(const l of spec.links||[])displayRows[l.rowIndex][l.colIndex]=l.label||'原文';
  const heights=displayRows.map(row=>Math.max(28,...row.map((v,i)=>text(v).split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil([...line].reduce((n,c)=>n+(/[\u0000-\u00ff]/.test(c)?1:2),0)/Math.max(10,spec.widths[i]-3))),0)*13.5+10)));
  for(let i=0;i<heights.length;){let j=i+1;while(j<heights.length&&heights[j]===heights[i])j++;sh.getRange(`A${spec.headerRow+1+i}:${col(spec.headers.length-1)}${spec.headerRow+j}`).format.rowHeight=heights[i];i=j;}
  model.rows.find(r=>r.name===spec.name).maxRowHeight=Math.max(...heights);
 }
 layout.worksheets.getItem('学生公开去向').getRange('A47:F48').format.rowHeight=270;
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
 finalWb.recalculate();
 const renderFiles=[];
 for(const name of ['完整来源目录','正文未读线索','生活学习要点','导师反馈','官方核实','帖子索引','检索覆盖','补充证据','应用版补充','延伸核验','继续补读','学生评价总览','实习资源','姓名缩写对照','学生公开去向','校园生活图片']){
  const blob=await finalWb.render({sheetName:name,range:'A2:F8',scale:1,format:'png'});
  const file='after-'+name+'.png';renderFiles.push(file);await fs.writeFile(path.join(outputDir,file),new Uint8Array(await blob.arrayBuffer()));
 }
 const extra=[['导师反馈','M6:S8'],['学生公开去向','A40:F48'],['校园生活图片','G6:M8'],['姓名缩写对照','E6:I9']];
 for(const [name,range] of extra){const blob=await finalWb.render({sheetName:name,range,scale:1,format:'png'});const file='after-detail-'+name+'.png';renderFiles.push(file);await fs.writeFile(path.join(outputDir,file),new Uint8Array(await blob.arrayBuffer()));}
 result.sourceSha256=model.sourceSha;result.outputSha256=sha(await fs.readFile(final));result.outputBytes=(await fs.stat(final)).size;result.renderFiles=renderFiles;result.datasets=model.rows;
 await fs.writeFile(path.join(outputDir,'verification.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
}
