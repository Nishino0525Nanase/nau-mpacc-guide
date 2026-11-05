import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { FileBlob, SpreadsheetFile, Workbook } from '@oai/artifact-tool';

// Run a copy of this builder in a task-specific /tmp directory whose
// node_modules symlink points at CODEX_PRIMARY_RUNTIME_NODE_MODULES.
// Only the new worksheet is authored. Packaging preserves all old sheets.
const repo = path.resolve(process.env.NAU_REPO_ROOT || process.cwd());
const outputDir = path.resolve(process.env.NAU_REVIEW_WORKBOOK_OUTPUT || path.join(repo,'../outputs/nau-evidence-index-103'));
const sourcePath = path.join(repo, 'dist/downloads/evidence-index.xlsx');
const sheetName = '学生评价总览';
const args = new Set(process.argv.slice(2));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const expectedSource = 'f7fa8822626ec412385f2d744696b934d8f8338c43b52d395241f903b412418b';
await fs.mkdir(outputDir, { recursive: true });

if (args.has('--replace-reviewed')) {
  const qa = JSON.parse(await fs.readFile(path.join(outputDir, 'final-verification.json'), 'utf8'));
  const candidate = await fs.readFile(path.join(outputDir, 'evidence-index.xlsx'));
  if (sha(candidate) !== qa.outputSha256 || sha(await fs.readFile(sourcePath)) !== qa.sourceSha256) throw new Error('Source/candidate changed after QA.');
  for (const image of qa.renderQa) await fs.access(path.join(outputDir, image));
  const backup = path.join(outputDir, 'backup/evidence-index.before-reviews.xlsx');
  await fs.mkdir(path.dirname(backup), { recursive: true });
  await fs.copyFile(sourcePath, backup, 1);
  await fs.writeFile(`${sourcePath}.reviews103.tmp`, candidate);
  await fs.rename(`${sourcePath}.reviews103.tmp`, sourcePath);
  console.log(JSON.stringify({replaced:true,bytes:candidate.length,sha256:sha(candidate),backup}));
  process.exit(0);
}

const sourceBytes = await fs.readFile(sourcePath);
if (sha(sourceBytes) !== expectedSource) throw new Error('Website workbook changed since the approved baseline.');
if (args.has('--inspect-only')) {
  const baseline = await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));
  const overview = await baseline.inspect({kind:'sheet,table',maxChars:7000,tableMaxRows:2,tableMaxCols:4});
  await fs.writeFile(path.join(outputDir,'baseline-inspect.ndjson'),overview.ndjson);
  const image = await baseline.render({sheetName:'继续补读',range:'A1:G8',scale:1,format:'png'});
  await fs.writeFile(path.join(outputDir,'baseline.png'),new Uint8Array(await image.arrayBuffer()));
  console.log(JSON.stringify({baselineSha256:expectedSource,render:'baseline.png'}));
  process.exit(0);
}
if (!args.has('--build')) throw new Error('Use --inspect-only, --build, or --replace-reviewed.');

const site = JSON.parse(await fs.readFile(path.join(repo,'dist/data/site-data.json'),'utf8'));
const summary = JSON.parse(await fs.readFile(path.join(repo,'data/student-review-coverage.json'),'utf8')).summary;
const mentors = site.mentors;
if (mentors.length !== 34 || mentors.some(m=>!m.studentReviews)) throw new Error('Expected all 34 frozen dossiers.');
const text = v => v == null ? '' : Array.isArray(v) ? v.map(text).filter(Boolean).join('\n') : typeof v === 'object' ? v.text || v.label || v.summary || JSON.stringify(v) : String(v);
const unique = xs => [...new Set(xs.filter(Boolean))];
const sourceRecord = r => {
  const codes = r.sourceIds || [];
  const code = codes[0] || '来源';
  const source = codes.map(c=>site.sourceRegistry[c]).find(Boolean) || {};
  return {url:r.sourceUrl, label:`${code} ${r.sourceTitle || source.title || source.label || '原文'}${r.postDate ? `（${r.postDate}）` : ''}`};
};
const reviewIdentity = r => [r.narrator,r.identity,`学位：${r.degree}`,`届别/年份：${r.year}`,`显示日期：${r.date || '未说明'}`,`亲历：${r.firsthand === true ? '本人自述' : r.firsthand === false ? '转述或非本人' : '未明确'}`,`接触：${r.relationship}`,r.firsthandScope ? `本人亲历范围：${text(r.firsthandScope)}` : '',r.hearsayParts ? `转述/朋友经历部分：${text(r.hearsayParts)}` : ''].filter(Boolean).join('；');
const pointText = p => `${p.text}\n适用范围：${p.scope}\n评价编号：${p.reviewIds.join('、')}`;
const rows = mentors.map(m=>{
  const d=m.studentReviews;
  const reviews=d.reviews;
  const sources=[];
  for (const r of reviews) if (r.sourceUrl && !sources.some(s=>s.url===r.sourceUrl)) sources.push(sourceRecord(r));
  const cells=[m.name,d.coverageLabel,
    reviews.length ? reviews.map((r,i)=>`${i+1}. ${r.text}${r.specifics.length ? '\n具体过程：'+text(r.specifics) : ''}\n评价编号：${r.id}`).join('\n\n') : d.summary,
    reviews.length ? reviews.map((r,i)=>`${i+1}. ${reviewIdentity(r)}`).join('\n\n') : '没有可归属的个人体验，不能推断学生满意度。',
    d.recommendationPoints.length ? d.recommendationPoints.map(pointText).join('\n\n') : '暂无足够具体的个人经历支持推荐结论。',
    d.concerns.length ? d.concerns.map(pointText).join('\n\n') : '暂无已核实到可归属的具体提醒；待核问题见右列。',
    text(d.verificationQuestions),
    [reviews.map((r,i)=>`${i+1}. ${text(r.limits)}\n阅读范围：${r.readingScope}`).join('\n\n'),`资料缺口：\n${text(d.gaps)}`,d.sampleCountNote].filter(Boolean).join('\n\n'),
    ...Array.from({length:3},(_,i)=>sources[i]?.label || '')];
  if (sources.length>3) throw new Error(`More than three unique source URLs for ${m.name}`);
  return {name:m.name,status:d.coverageStatus,cells,sources};
});
const workbook = Workbook.create();
const sheet = workbook.worksheets.add(sheetName);
sheet.showGridLines=false;
sheet.tabColor='#173B50';
const headers=['导师','评价覆盖情况','学生说了什么与具体过程','评论者身份与接触年份','有经历支持的推荐理由','有经历支持的提醒','选导师前应核实的问题','评价限制与资料缺口','原文来源1','原文来源2','原文来源3'];
sheet.getRange('A2').values=[['学生评价总览']];
sheet.getRange('A3').values=[[`34位导师已检索；${summary.teachersWithAttributableReviews}位有可归属记录，其中${summary.coverageCounts.mpacc_guidance}位有明确MPAcc指导经历。`]];
sheet.getRange('A4').values=[['MPAcc指导、本科项目、课程印象及转述分别标明；缩写未能确认全名的内容不归人。']];
sheet.getRange('A2:K2').format={font:{name:'Arial',size:14,bold:true,color:'#173B50'},rowHeight:25,borders:{bottom:{style:'thin',color:'#497C96'}}};
sheet.getRange('A3:K4').format={font:{name:'Arial',size:10,color:'#5C6570'},rowHeight:20,wrapText:false};
const last=6+rows.length;
sheet.getRange(`A6:K${last}`).values=[headers,...rows.map(r=>r.cells)];
sheet.getRange(`A7:K${last}`).format={font:{name:'Arial',size:10,color:'#243441'},wrapText:true,verticalAlignment:'top'};
const widths=[14,25,96,82,86,86,90,112,56,56,56];
const columns='ABCDEFGHIJK';
for(let i=0;i<widths.length;i++) sheet.getRange(`${columns[i]}6:${columns[i]}${last}`).format.columnWidth=widths[i];
const units=s=>[...text(s)].reduce((n,c)=>n+(/[\u0000-\u00ff]/.test(c)?1:2),0);
const neededHeight=(value,width)=>text(value).split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(units(line)/(width-3))),0)*13.5+12;
for(let i=0;i<rows.length;i++){
  const row=rows[i], excelRow=i+7;
  const height=Math.max(84,...row.cells.map((v,j)=>neededHeight(v,widths[j])));
  if(height>408) throw new Error(`Content needs ${height}pt on ${row.name}; widen its columns rather than clipping text.`);
  sheet.getRange(`A${excelRow}:K${excelRow}`).format.rowHeight=height;
  if(i%2===0) sheet.getRange(`A${excelRow}:K${excelRow}`).format.fill='#F3F6F8';
  sheet.getRange(`A${excelRow}`).format.font={name:'Arial',size:10,bold:true,color:'#173B50'};
  for(let j=0;j<row.sources.length;j++){
    const s=row.sources[j];
    if(!/^https?:\/\//.test(s.url)) throw new Error('Unsafe source URL.');
    sheet.getRange(`${columns[j+8]}${excelRow}`).formulas=[[`=HYPERLINK("${s.url.replace(/"/g,'""')}","${s.label.replace(/"/g,'""')}")`]];
    sheet.getRange(`${columns[j+8]}${excelRow}`).format.font={name:'Arial',size:10,color:'#24627B'};
  }
}
const table=sheet.tables.add(`A6:K${last}`,true,'StudentReviews103');
table.showFilterButton=true;
// Custom restrained bands override the table's default bright export theme.
for(let i=0;i<rows.length;i++) sheet.getRange(`A${i+7}:K${i+7}`).format.fill=i%2===0?'#F3F6F8':'#FFFFFF';
sheet.getRange('A6:K6').format={fill:'#173B50',font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},rowHeight:30,wrapText:true,horizontalAlignment:'center',verticalAlignment:'center',borders:{insideVertical:{style:'thin',color:'#FFFFFF'}}};
sheet.getRange(`B7:B${last}`).conditionalFormats.add('containsText',{text:'明确MPAcc',format:{fill:'#E8F1EE',font:{color:'#315F3C',bold:true}}});
sheet.getRange(`B7:B${last}`).conditionalFormats.add('containsText',{text:'未找到',format:{fill:'#FFF1DA',font:{color:'#805A16'}}});
sheet.freezePanes.freezeRows(6);
sheet.freezePanes.freezeColumns(2);
workbook.recalculate();
const inspect=await workbook.inspect({kind:'table',range:`'${sheetName}'!A6:K10`,include:'values,formulas',tableMaxRows:5,tableMaxCols:11,tableMaxCellChars:80,maxChars:9000});
await fs.writeFile(path.join(outputDir,'student-reviews-inspect.ndjson'),inspect.ndjson);
const errors=await workbook.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:100},maxChars:4000});
await fs.writeFile(path.join(outputDir,'formula-scan-before-native.ndjson'),errors.ndjson);
const renderQa=[];
for(const [label,range] of [['reviews-opening','A1:D9'],['reviews-experiences','A12:D17'],['reviews-recommendation','E12:G17'],['reviews-limits','H12:K14'],['reviews-li-zhongze','A34:D34'],['reviews-ending','A35:D40']]){
  const preview=await workbook.render({sheetName,range,scale:1,format:'png'});
  const filename=`${label}.png`;renderQa.push(filename);
  await fs.writeFile(path.join(outputDir,filename),new Uint8Array(await preview.arrayBuffer()));
}
const stagePath=path.join(outputDir,'artifact-authored-stage.xlsx');
await (await SpreadsheetFile.exportXlsx(workbook)).save(stagePath);
await fs.writeFile(path.join(outputDir,'prepared-rows.json'),JSON.stringify(rows,null,2));

// HYPERLINK caches are calculated in a disposable new-sheet-only workbook.
// Original native worksheet, table and cache parts never pass through Calc.
const nativeDir=path.join(outputDir,'native-recalculated');
await fs.mkdir(nativeDir,{recursive:true});
const soffice=process.env.NAU_SOFFICE || path.join(process.env.CODEX_PRIMARY_RUNTIME_ROOT,'dependencies/native/libreoffice-headless/libreoffice/program/soffice');
const profile=path.join(outputDir,'lo-profile');
const nativePath=path.join(nativeDir,'artifact-authored-stage.xlsx');
await fs.rm(nativePath,{force:true});
execFileSync(soffice,[`-env:UserInstallation=file://${profile}`,'--headless','--convert-to','xlsx','--outdir',nativeDir,stagePath],{timeout:60000,maxBuffer:1024*1024});
await fs.access(nativePath);
// Artifact Tool's renderer recalculates unsupported HYPERLINK formulas even
// when a correct native cache exists. Verify the native display through a
// read-only PDF export instead; the delivered XLSX is not converted again.
const nativePdfDir=path.join(outputDir,'native-pdf');
await fs.mkdir(nativePdfDir,{recursive:true});
const nativePdfPath=path.join(nativePdfDir,'artifact-authored-stage.pdf');
await fs.rm(nativePdfPath,{force:true});
execFileSync(soffice,[`-env:UserInstallation=file://${profile}`,'--headless','--convert-to','pdf:calc_pdf_Export:{"SinglePageSheets":{"type":"boolean","value":"true"}}','--outdir',nativePdfDir,nativePath],{timeout:60000,maxBuffer:1024*1024});
const nativeQa=JSON.parse(execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON,['-c',pdfScript(),nativePdfPath,path.join(outputDir,'prepared-rows.json'),path.join(outputDir,'reviews-native-links.png')],{encoding:'utf8',maxBuffer:1024*1024}));
await fs.writeFile(path.join(outputDir,'native-pdf-qa.json'),JSON.stringify(nativeQa,null,2));
renderQa.push('reviews-native-links.png');
const candidatePath=path.join(outputDir,'evidence-index.xlsx');
const packaged=JSON.parse(execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON,['-c',packageScript(),sourcePath,nativePath,candidatePath,sheetName],{encoding:'utf8',maxBuffer:20*1024*1024}));
await fs.writeFile(path.join(outputDir,'package-preservation.json'),JSON.stringify(packaged,null,2));
const verified=JSON.parse(execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON,['-c',auditScript(),sourcePath,candidatePath,path.join(outputDir,'prepared-rows.json')],{encoding:'utf8',maxBuffer:20*1024*1024}));
verified.sourceSha256=expectedSource;verified.outputSha256=sha(await fs.readFile(candidatePath));verified.outputBytes=(await fs.stat(candidatePath)).size;verified.renderQa=renderQa;
verified.nativeApplicationRender=nativeQa;
await fs.writeFile(path.join(outputDir,'final-verification.json'),JSON.stringify(verified,null,2));
console.log(JSON.stringify(verified));

function packageScript() { return String.raw`
import sys,zipfile,xml.etree.ElementTree as E,copy,posixpath,json
src,stage,out,name=sys.argv[1:]
M='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
R='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
P='http://schemas.openxmlformats.org/package/2006/relationships'
C='http://schemas.openxmlformats.org/package/2006/content-types'
q=lambda t:'{'+M+'}'+t
E.register_namespace('',M);E.register_namespace('r',R)
def xml(e):
 E.register_namespace('',e.tag[1:].split('}')[0]);E.register_namespace('r',R);E.register_namespace('loext','http://schemas.libreoffice.org/')
 return E.tostring(e,encoding='utf-8',xml_declaration=True)
def target(base,t):return t.lstrip('/') if t.startswith('/') else posixpath.normpath(posixpath.join(posixpath.dirname(base),t))
with zipfile.ZipFile(src) as z:parts={n:z.read(n) for n in z.namelist()}
with zipfile.ZipFile(stage) as z:authored={n:z.read(n) for n in z.namelist()}
wb=E.fromstring(parts['xl/workbook.xml']);wr=E.fromstring(parts['xl/_rels/workbook.xml.rels'])
aw=E.fromstring(authored['xl/workbook.xml']);ar=E.fromstring(authored['xl/_rels/workbook.xml.rels'])
ns={'m':M}
new_sheet=next(s for s in aw.find(q('sheets')) if s.attrib['name']==name)
new_rid=new_sheet.attrib['{'+R+'}id']
new_target=target('xl/workbook.xml',next(r.attrib['Target'] for r in ar if r.attrib['Id']==new_rid))
sheet=E.fromstring(authored[new_target])
for v in sheet.findall('m:sheetViews/m:sheetView',ns):v.set('tabSelected','1')
old_st=E.fromstring(parts['xl/styles.xml']);new_st=E.fromstring(authored['xl/styles.xml'])
def ensure(root,key):
 e=root.find(q(key))
 if e is None:e=E.SubElement(root,q(key))
 return e
num=ensure(old_st,'numFmts');old_formats={x.attrib['formatCode']:x.attrib['numFmtId'] for x in num}
used={int(x.attrib['numFmtId']) for x in num};num_map={}
for x in new_st.find(q('numFmts')) or []:
 old=x.attrib['numFmtId'];code=x.attrib['formatCode']
 if code in old_formats:num_map[old]=old_formats[code]
 else:
  nxt=max(used|{163})+1;y=copy.deepcopy(x);y.set('numFmtId',str(nxt));num.append(y);used.add(nxt);old_formats[code]=str(nxt);num_map[old]=str(nxt)
num.set('count',str(len(num)))
maps={}
for key,attr in [('fonts','fontId'),('fills','fillId'),('borders','borderId')]:
 old=ensure(old_st,key);new=new_st.find(q(key));start=len(old);maps[attr]={str(i):str(start+i) for i in range(len(new))}
 for x in new:old.append(copy.deepcopy(x))
 old.set('count',str(len(old)))
def remap_xf(x,xf_start=None):
 y=copy.deepcopy(x)
 for attr,mapping in maps.items():
  if attr in y.attrib:y.set(attr,mapping[y.attrib[attr]])
 if 'numFmtId' in y.attrib:y.set('numFmtId',num_map.get(y.attrib['numFmtId'],y.attrib['numFmtId']))
 if xf_start is not None and 'xfId' in y.attrib:y.set('xfId',str(xf_start+int(y.attrib['xfId'])))
 return y
style_xfs=ensure(old_st,'cellStyleXfs');style_start=len(style_xfs)
for x in new_st.find(q('cellStyleXfs')):style_xfs.append(remap_xf(x))
style_xfs.set('count',str(len(style_xfs)))
cell_xfs=ensure(old_st,'cellXfs');cell_start=len(cell_xfs)
for x in new_st.find(q('cellXfs')):cell_xfs.append(remap_xf(x,style_start))
cell_xfs.set('count',str(len(cell_xfs)))
dxfs=ensure(old_st,'dxfs');dxf_start=len(dxfs)
for x in new_st.find(q('dxfs')) or []:
 y=copy.deepcopy(x)
 for f in y.iter(q('numFmt')):
  if 'numFmtId' in f.attrib:f.set('numFmtId',num_map.get(f.attrib['numFmtId'],f.attrib['numFmtId']))
 dxfs.append(y)
dxfs.set('count',str(len(dxfs)))
for c in sheet.iter(q('c')):
 if 's' in c.attrib:c.set('s',str(cell_start+int(c.attrib['s'])))
for e in sheet.iter():
 for attr in list(e.attrib):
  if attr=='dxfId' or attr.endswith('DxfId'):e.set(attr,str(dxf_start+int(e.attrib[attr])))
ss=E.fromstring(parts['xl/sharedStrings.xml']);ass=E.fromstring(authored['xl/sharedStrings.xml']);ss_start=len(ss)
for s in ass:ss.append(copy.deepcopy(s))
refs=0
for c in sheet.iter(q('c')):
 if c.attrib.get('t')=='s':
  v=c.find(q('v'));v.text=str(ss_start+int(v.text));refs+=1
ss.set('uniqueCount',str(len(ss)));ss.set('count',str(int(ss.attrib.get('count',ss_start))+refs))
sheet_part='xl/worksheets/student-reviews-103.xml';sheet_rels='xl/worksheets/_rels/student-reviews-103.xml.rels'
auth_rels=posixpath.dirname(new_target)+'/_rels/'+posixpath.basename(new_target)+'.rels'
new_parts={}
table_parts=[]
if auth_rels in authored:
 sr=E.fromstring(authored[auth_rels])
 existing_ids=[]
 for n,b in parts.items():
  if n.startswith('xl/tables/') and n.endswith('.xml'):existing_ids.append(int(E.fromstring(b).attrib['id']))
 for i,rel in enumerate(sr):
  if not rel.attrib['Type'].endswith('/table'):raise RuntimeError('Unexpected new-sheet relationship requiring a separate preservation strategy')
  old_part=target(new_target,rel.attrib['Target']);new_part='xl/tables/student-reviews-103-'+str(i+1)+'.xml';tb=E.fromstring(authored[old_part]);tb.set('id',str(max(existing_ids+[0])+i+1))
  for e in tb.iter():
   for attr in list(e.attrib):
    if attr=='dxfId' or attr.endswith('DxfId'):e.set(attr,str(dxf_start+int(e.attrib[attr])))
  rel.set('Target','../tables/'+posixpath.basename(new_part));new_parts[new_part]=xml(tb);table_parts.append(new_part)
 new_parts[sheet_rels]=xml(sr)
new_parts[sheet_part]=xml(sheet)
rid='rIdStudentReviews103'
if any(r.attrib['Id']==rid for r in wr):raise RuntimeError('Supplement relationship already exists')
sheets=wb.find(q('sheets'));E.SubElement(sheets,q('sheet'),{'name':name,'sheetId':str(max(int(s.attrib['sheetId']) for s in sheets)+1),'{'+R+'}id':rid})
views=wb.find(q('bookViews'))
if views is None:views=E.SubElement(wb,q('bookViews'))
view=views.find(q('workbookView'))
if view is None:view=E.SubElement(views,q('workbookView'))
view.set('activeTab',str(len(sheets)-1))
E.SubElement(wr,'{'+P+'}Relationship',{'Id':rid,'Type':R+'/worksheet','Target':'worksheets/'+posixpath.basename(sheet_part)})
ct=E.fromstring(parts['[Content_Types].xml'])
E.SubElement(ct,'{'+C+'}Override',{'PartName':'/'+sheet_part,'ContentType':'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'})
for t in table_parts:E.SubElement(ct,'{'+C+'}Override',{'PartName':'/'+t,'ContentType':'application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml'})
updated={'xl/workbook.xml':xml(wb),'xl/_rels/workbook.xml.rels':xml(wr),'xl/styles.xml':xml(old_st),'xl/sharedStrings.xml':xml(ss),'[Content_Types].xml':xml(ct)}
parts.update(updated);parts.update(new_parts)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for n,b in parts.items():z.writestr(n,b)
with zipfile.ZipFile(src) as a,zipfile.ZipFile(out) as b:
 unchanged=[n for n in a.namelist() if n not in updated and a.read(n)==b.read(n)]
 changed=[n for n in a.namelist() if n not in updated and a.read(n)!=b.read(n)]
 if changed:raise RuntimeError('Unexpected changes in original package parts: '+str(changed))
 print(json.dumps({'unchangedOriginalPartCount':len(unchanged),'updatedGlobalParts':list(updated),'newParts':list(new_parts),'originalSheetPartsRetainedByteForByte':all(n in unchanged for n in a.namelist() if n.startswith('xl/worksheets/'))}))
`; }

function auditScript() { return String.raw`
import sys,json,zipfile,hashlib,xml.etree.ElementTree as E
src,out,prepared=sys.argv[1:]
Q='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
def canon(x):
 return None if x is None else [x.tag,sorted(x.attrib.items()),x.text or '',[canon(v) for v in x]]
def read(p):
 with zipfile.ZipFile(p) as z:
  assert z.testzip() is None
  return {n:z.read(n) for n in z.namelist()}
before,after=read(src),read(out)
globals={'xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/styles.xml','xl/sharedStrings.xml','[Content_Types].xml'}
assert all(v==after.get(k) for k,v in before.items() if k not in globals),'Original non-global package parts changed'
oldstyle,newstyle=E.fromstring(before['xl/styles.xml']),E.fromstring(after['xl/styles.xml'])
for old in oldstyle:
 new=newstyle.find(old.tag)
 assert new is not None
 if old.tag in (Q+'extLst',Q+'colors',Q+'tableStyles'):assert canon(old)==canon(new)
 else:assert [canon(c) for c in old]==[canon(c) for c in list(new)[:len(old)]]
oldss,newss=E.fromstring(before['xl/sharedStrings.xml']),E.fromstring(after['xl/sharedStrings.xml'])
assert [canon(c) for c in oldss]==[canon(c) for c in list(newss)[:len(oldss)]]
w0,w1=E.fromstring(before['xl/workbook.xml']),E.fromstring(after['xl/workbook.xml'])
s0,s1=w0.find(Q+'sheets'),w1.find(Q+'sheets')
assert len(s0)==11 and len(s1)==12
assert [canon(c) for c in s0]==[canon(c) for c in list(s1)[:len(s0)]]
assert s1[-1].attrib['name']=='学生评价总览'
assert canon(w0.find(Q+'definedNames'))==canon(w1.find(Q+'definedNames'))
assert canon(w0.find(Q+'calcPr'))==canon(w1.find(Q+'calcPr'))
sheet=E.fromstring(after['xl/worksheets/student-reviews-103.xml'])
strings=[''.join(x.itertext()) for x in newss]
cells={c.attrib['r']:c for c in sheet.iter(Q+'c')}
def value(c):
 v=c.find(Q+'v');s=v.text if v is not None else ''
 if c.attrib.get('t')=='s':return strings[int(s)]
 if c.attrib.get('t')=='inlineStr':return ''.join(c.find(Q+'is').itertext())
 return s or ''
rows=json.load(open(prepared))
assert len(rows)==34
for i,row in enumerate(rows,7):
 for j,expected in enumerate(row['cells']):
  addr=chr(65+j)+str(i)
  assert value(cells[addr])==expected,(row['name'],addr,'Cell mismatch')
 for j,source in enumerate(row['sources']):
  c=cells[chr(73+j)+str(i)];f=c.find(Q+'f');v=c.find(Q+'v')
  assert f is not None and source['url'] in f.text
  assert v is not None and v.text is not None and c.attrib.get('t')!='e'
pane=sheet.find(Q+'sheetViews').find(Q+'sheetView').find(Q+'pane')
assert pane.attrib.get('xSplit')=='2' and pane.attrib.get('ySplit')=='6'
tables=[E.fromstring(v) for k,v in after.items() if k.startswith('xl/tables/') and k.endswith('.xml')]
assert len(tables)==10 and len({t.attrib['id'] for t in tables})==10
newtable=next(t for t in tables if t.attrib['name']=='StudentReviews103')
assert newtable.attrib['ref']=='A6:K40'
assert newtable.find(Q+'autoFilter').attrib['ref']=='A6:K40'
stats={}
for label,parts in [('original',before),('final',after)]:
 sheets=[E.fromstring(v) for k,v in parts.items() if k.startswith('xl/worksheets/') and k.endswith('.xml')]
 formulas=[c for s in sheets for c in s.iter(Q+'c') if c.find(Q+'f') is not None]
 errors=[c.attrib['r'] for s in sheets for c in s.iter(Q+'c') if c.attrib.get('t')=='e']
 stats[label]={'formulaCount':len(formulas),'cachedFormulaCount':sum(c.find(Q+'v') is not None for c in formulas),'errorCellCount':len(errors)}
assert stats['original']['formulaCount']==389
assert stats['final']['formulaCount']==389+sum(len(r['sources']) for r in rows)
assert stats['final']['cachedFormulaCount']==stats['final']['formulaCount']
assert stats['final']['errorCellCount']==0
print(json.dumps({'newSheet':'学生评价总览','dataRows':34,'sheetNames':[s.attrib['name'] for s in s1],'activeSheet':'学生评价总览','frozenRows':6,'frozenColumns':2,'tableCount':10,'newTableRange':'A6:K40','originalSheetsRetained':11,'originalNonGlobalPartsByteIdentical':True,'originalStylePrefixesRetained':True,'originalSharedStringsPrefixRetained':True,'allAuthoredCellValuesMatch':True,'allNewHyperlinksCached':True,'stats':stats},ensure_ascii=False))
`; }

function pdfScript() { return String.raw`
import sys,json,fitz
pdf,rows_path,image=sys.argv[1:]
rows=json.load(open(rows_path))
doc=fitz.open(pdf)
assert len(doc)==1,'Expected the disposable new-sheet-only PDF on one page'
page=doc[0];text=page.get_text()
assert 'HYPERLINK is not implemented' not in text
assert 'R701' in text and 'R702' in text
missing=[r['name'] for r in rows if r['name'] not in text]
assert not missing,missing
anchor=max(page.search_for('崔秀梅'),key=lambda r:r.x0)
clip=fitz.Rect(max(0,anchor.x0-200),max(0,anchor.y0-20),page.rect.width,anchor.y0+190)
page.get_pixmap(matrix=fitz.Matrix(1.5,1.5),clip=clip).save(image)
print(json.dumps({'application':'LibreOffice Calc','operation':'read-only PDF export of new-sheet-only workbook','pages':len(doc),'all34MentorNamesVisible':True,'hyperlinkErrorText':False,'R701andR702Visible':True,'linkDisplayScreenshot':'reviews-native-links.png'}))
`; }
