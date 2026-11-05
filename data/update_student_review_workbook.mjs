import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

// Execute a copy from a task-specific OS tmp directory with the runtime's
// node_modules symlink. Only the reviewed cells below enter the final package.
const repo = path.resolve(process.env.NAU_REPO_ROOT || process.cwd());
const outputDir = path.resolve(process.env.NAU_REVIEW_WORKBOOK_OUTPUT || path.join(repo,'../outputs/nau-reviews7'));
const source = path.join(repo,'dist/downloads/evidence-index.xlsx');
const expectedSource = '892a45d1b7821f6148d6220ff39b6058132398ef693059d26ea957d7795244a3';
const sheetName = '学生评价总览';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const args = new Set(process.argv.slice(2));
await fs.mkdir(outputDir,{recursive:true});

if (args.has('--replace-reviewed')) {
  const qa = JSON.parse(await fs.readFile(path.join(outputDir,'final-verification.json'),'utf8'));
  const payload = await fs.readFile(path.join(outputDir,'evidence-index.xlsx'));
  if (sha(payload)!==qa.outputSha256 || sha(await fs.readFile(source))!==qa.sourceSha256) throw new Error('Reviewed source/candidate changed.');
  for (const name of ['pan-experiences.png','pan-links.png']) await fs.access(path.join(outputDir,name));
  const backup=path.join(outputDir,'evidence-index.before-reviews7.xlsx');
  await fs.copyFile(source,backup,1);
  await fs.writeFile(source+'.reviews7.tmp',payload);
  await fs.rename(source+'.reviews7.tmp',source);
  console.log(JSON.stringify({replaced:true,bytes:payload.length,sha256:sha(payload),backup}));
  process.exit(0);
}
if (!args.has('--build') && !args.has('--finish-stage')) throw new Error('Use --build or --replace-reviewed.');
if (sha(await fs.readFile(source))!==expectedSource) throw new Error('Source workbook changed since baseline inspection.');
if (args.has('--finish-stage')) { await finishStage(); process.exit(0); }
const data=JSON.parse(await fs.readFile(path.join(repo,'dist/data/site-data.json'),'utf8'));
const mentor=data.mentors.find(item=>item.id==='mentor-11' && item.name==='潘俊');
const dossier=mentor.studentReviews;
const records=data.mentors.flatMap(item=>item.studentReviews.reviews);
if(records.length!==40 || new Set(records.map(item=>item.id)).size!==40 || dossier.reviews.length!==2) throw new Error('Expected the frozen 40-record data with two Pan Jun experiences.');
const added=dossier.reviews.find(item=>item.id==='sr-r7-panjun-lijialin-2022');
if(!added?.sourceIds.includes('R801')) throw new Error('Missing frozen R801 experience.');
const text=value=>value==null?'':Array.isArray(value)?value.map(text).filter(Boolean).join('\n'):typeof value==='object'?value.text||value.label||value.summary||JSON.stringify(value):String(value);
const identity=r=>[r.narrator,r.identity,`学位：${r.degree}`,`届别/年份：${r.year}`,`显示日期：${r.date||'未说明'}`,`亲历：${r.firsthand===true?'本人自述':r.firsthand===false?'转述或非本人':'未明确'}`,`接触：${r.relationship}`,r.firsthandScope?`本人亲历范围：${text(r.firsthandScope)}`:'',r.hearsayParts?`转述/朋友经历部分：${text(r.hearsayParts)}`:''].filter(Boolean).join('；');
const point=p=>`${p.text}\n适用范围：${p.scope}\n评价编号：${p.reviewIds.join('、')}`;
const sources=[];
for(const r of dossier.reviews) if(r.sourceUrl && !sources.some(item=>item.url===r.sourceUrl)) {
  const code=r.sourceIds[0];const registry=data.sourceRegistry[code]||{};
  sources.push({url:r.sourceUrl,label:`${code} ${r.sourceTitle||registry.title||registry.label||'原文'}${r.postDate?`（${r.postDate}）`:''}`});
}
if(sources.length!==2) throw new Error('Expected two distinct Pan Jun sources.');
const values=[mentor.name,dossier.coverageLabel,
  dossier.reviews.map((r,i)=>`${i+1}. ${r.text}${r.specifics.length?'\n具体过程：'+text(r.specifics):''}\n评价编号：${r.id}`).join('\n\n'),
  dossier.reviews.map((r,i)=>`${i+1}. ${identity(r)}`).join('\n\n'),
  dossier.recommendationPoints.length?dossier.recommendationPoints.map(point).join('\n\n'):'暂无足够具体的个人经历支持推荐结论。',
  dossier.concerns.length?dossier.concerns.map(point).join('\n\n'):'暂无已核实到可归属的具体提醒；待核问题见右列。',
  text(dossier.verificationQuestions),
  [dossier.reviews.map((r,i)=>`${i+1}. ${text(r.limits)}\n阅读范围：${r.readingScope}`).join('\n\n'),`资料缺口：\n${text(dossier.gaps)}`,dossier.sampleCountNote].filter(Boolean).join('\n\n'),
  ...Array.from({length:3},(_,i)=>sources[i]?.label||'')];
const workbook=Workbook.create();const sheet=workbook.worksheets.add(sheetName);
sheet.showGridLines=false;
const summary=`34位导师已检索；40条可归属记录涉及20位导师，其中3位有明确MPAcc指导经历。`;
sheet.getRange('A3').values=[[summary]];
sheet.getRange('A3:K3').format={font:{name:'Arial',size:10,color:'#5C6570'},rowHeight:20,wrapText:false};
sheet.getRange('A17:K17').values=[values];
sheet.getRange('A17:K17').format={font:{name:'Arial',size:10,color:'#243441'},fill:'#F3F6F8',wrapText:true,verticalAlignment:'top'};
const widths=[14,25,96,82,86,86,90,112,56,56,56];const columns='ABCDEFGHIJK';
for(let i=0;i<widths.length;i++) sheet.getRange(`${columns[i]}17`).format.columnWidth=widths[i];
const units=value=>[...text(value)].reduce((n,c)=>n+(/[\u0000-\u00ff]/.test(c)?1:2),0);
const height=Math.max(84,...values.map((value,i)=>text(value).split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(units(line)/(widths[i]-3))),0)*13.5+12));
if(height>408) throw new Error('Pan Jun row would clip; shorten only duplicated wording or enlarge the relevant column deliberately.');
sheet.getRange('A17:K17').format.rowHeight=height;
sheet.getRange('A17').format.font={name:'Arial',size:10,bold:true,color:'#173B50'};
for(let i=0;i<sources.length;i++) {
  const item=sources[i];if(!/^https?:\/\//.test(item.url)) throw new Error('Unsafe source link.');
  sheet.getRange(`${columns[i+8]}17`).formulas=[[`=HYPERLINK("${item.url.replace(/"/g,'""')}","${item.label.replace(/"/g,'""')}")`]];
  sheet.getRange(`${columns[i+8]}17`).format.font={name:'Arial',size:10,color:'#24627B'};
}
workbook.recalculate();
const inspect=await workbook.inspect({kind:'table',range:`'${sheetName}'!A17:K17`,include:'values,formulas',tableMaxRows:1,tableMaxCols:11,tableMaxCellChars:140,maxChars:4000});
await fs.writeFile(path.join(outputDir,'pan-inspect.ndjson'),inspect.ndjson);
const preview=await workbook.render({sheetName,range:'A17:D17',scale:1,format:'png'});
await fs.writeFile(path.join(outputDir,'pan-experiences.png'),new Uint8Array(await preview.arrayBuffer()));
const stage=path.join(outputDir,'authored-stage.xlsx');await (await SpreadsheetFile.exportXlsx(workbook)).save(stage);
const nativeDir=path.join(outputDir,'native-recalculated');await fs.mkdir(nativeDir,{recursive:true});
const soffice=path.join(process.env.CODEX_PRIMARY_RUNTIME_ROOT,'dependencies/native/libreoffice-headless/libreoffice/program/soffice');
const profile=path.join(outputDir,'lo-profile');const native=path.join(nativeDir,'authored-stage.xlsx');await fs.rm(native,{force:true});
execFileSync(soffice,[`-env:UserInstallation=file://${profile}`,'--headless','--convert-to','xlsx','--outdir',nativeDir,stage],{timeout:60000,maxBuffer:1024*1024});
const pdfDir=path.join(outputDir,'native-pdf');await fs.mkdir(pdfDir,{recursive:true});
execFileSync(soffice,[`-env:UserInstallation=file://${profile}`,'--headless','--convert-to','pdf:calc_pdf_Export:{"SinglePageSheets":{"type":"boolean","value":"true"}}','--outdir',pdfDir,native],{timeout:60000,maxBuffer:1024*1024});
const expectedPath=path.join(outputDir,'expected.json');await fs.writeFile(expectedPath,JSON.stringify({summary,values,sources,height}));
await finishStage();

async function finishStage() {
  const candidate=path.join(outputDir,'evidence-index.xlsx');
  const verification=JSON.parse(execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON,['-c',packageScript(),source,path.join(outputDir,'native-recalculated/authored-stage.xlsx'),candidate,path.join(outputDir,'expected.json'),path.join(outputDir,'native-pdf/authored-stage.pdf'),path.join(outputDir,'pan-links.png')],{encoding:'utf8',maxBuffer:1024*1024}));
  verification.sourceSha256=expectedSource;verification.outputSha256=sha(await fs.readFile(candidate));verification.outputBytes=(await fs.stat(candidate)).size;
  await fs.writeFile(path.join(outputDir,'final-verification.json'),JSON.stringify(verification,null,2));
  console.log(JSON.stringify(verification));
}

function packageScript(){return String.raw`
import copy,json,posixpath,sys,zipfile,xml.etree.ElementTree as E
import fitz
src,stage,out,expect_path,pdf,image=sys.argv[1:]
expected=json.load(open(expect_path));Q='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
def load(p):
 with zipfile.ZipFile(p) as z:
  assert z.testzip() is None
  return {n:z.read(n) for n in z.namelist()}
parts,authored=load(src),load(stage)
name='xl/worksheets/student-reviews-103.xml'
sheet=E.fromstring(parts[name]);new=E.fromstring(authored['xl/worksheets/sheet1.xml'])
strings=E.fromstring(authored['xl/sharedStrings.xml'])
def value(cell,ss):
 if cell is None:return ''
 if cell.attrib.get('t')=='inlineStr':return ''.join(cell.find(Q+'is').itertext())
 v=cell.find(Q+'v');text=v.text or '' if v is not None else ''
 if cell.attrib.get('t')=='s':return ''.join(ss[int(text)].itertext())
 return text
old_strings=E.fromstring(parts['xl/sharedStrings.xml'])
old_cells={c.attrib['r']:c for c in sheet.iter(Q+'c')};new_cells={c.attrib['r']:c for c in new.iter(Q+'c')}
targets=['A3']+[chr(65+i)+'17' for i in range(11)]
changed=[]
for address in targets:
 old=old_cells[address];incoming=new_cells.get(address)
 old_f=old.find(Q+'f');new_f=incoming.find(Q+'f') if incoming is not None else None
 if value(old,old_strings)==value(incoming,strings) and (old_f.text if old_f is not None else None)==(new_f.text if new_f is not None else None):continue
 incoming=copy.deepcopy(incoming)
 if incoming.attrib.get('t')=='s':
  index=int(incoming.find(Q+'v').text);si=copy.deepcopy(strings[index]);si.tag=Q+'is'
  for child in list(incoming):incoming.remove(child)
  incoming.append(si);incoming.set('t','inlineStr')
 for child in list(old):old.remove(child)
 old.attrib.pop('t',None)
 if incoming.attrib.get('t'):old.set('t',incoming.attrib['t'])
 for child in list(incoming):old.append(copy.deepcopy(child))
 if address=='J17':old.set('s',old_cells['I17'].attrib['s'])
 changed.append(address)
row=next(r for r in sheet.iter(Q+'row') if r.attrib['r']=='17');row.set('ht',str(expected['height']));row.set('customHeight','true')
E.register_namespace('',Q[1:-1]);E.register_namespace('r','http://schemas.openxmlformats.org/officeDocument/2006/relationships')
parts[name]=E.tostring(sheet,encoding='utf-8',xml_declaration=True)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for key,payload in parts.items():z.writestr(key,payload)
before,after=load(src),load(out)
assert all(after[key]==payload for key,payload in before.items() if key!=name),'An unrelated native package part changed'
def canon(e):return [e.tag,sorted(e.attrib.items()),e.text or '',[canon(v) for v in e]]
old_sheet=E.fromstring(before[name]);out_sheet=E.fromstring(after[name]);out_cells={c.attrib['r']:c for c in out_sheet.iter(Q+'c')}
assert value(out_cells['A3'],old_strings)==expected['summary']
for i,v in enumerate(expected['values']):assert value(out_cells[chr(65+i)+'17'],old_strings)==v,(i,'value mismatch')
for c in old_sheet.iter(Q+'c'):
 if c.attrib['r'] not in changed:assert canon(c)==canon(out_cells[c.attrib['r']]),c.attrib['r']
for r in old_sheet.iter(Q+'row'):
 if r.attrib['r'] not in ('3','17'):assert canon(r)==canon(next(v for v in out_sheet.iter(Q+'row') if v.attrib['r']==r.attrib['r'])),r.attrib['r']
for i,source in enumerate(expected['sources']):
 c=out_cells[chr(73+i)+'17'];assert source['url'] in c.find(Q+'f').text and c.find(Q+'v').text==source['label'] and c.attrib.get('t')!='e'
def stats(p):
 cells=[c for n,b in p.items() if n.startswith('xl/worksheets/') and n.endswith('.xml') for c in E.fromstring(b).iter(Q+'c')]
 formulas=[c for c in cells if c.find(Q+'f') is not None]
 return {'formulas':len(formulas),'cached':sum(c.find(Q+'v') is not None for c in formulas),'errors':sum(c.attrib.get('t')=='e' for c in cells)}
original,final=stats(before),stats(after)
assert final['formulas']==original['formulas']+1 and final['cached']==final['formulas'] and final['errors']==0
wb=E.fromstring(after['xl/workbook.xml']);sheet_names=[s.attrib['name'] for s in wb.find(Q+'sheets')]
tables=[n for n in after if n.startswith('xl/tables/') and n.endswith('.xml')]
assert len(sheet_names)==13 and len(tables)==11
doc=fitz.open(pdf);assert len(doc)==1
assert 'HYPERLINK is not implemented' not in doc[0].get_text()
hits=doc[0].search_for('R801');assert hits,'R801 source label not visible in Calc export'
anchor=hits[0];clip=fitz.Rect(max(0,anchor.x0-30),max(0,anchor.y0-30),doc[0].rect.width,min(doc[0].rect.height,anchor.y0+110))
doc[0].get_pixmap(matrix=fitz.Matrix(1.5,1.5),clip=clip).save(image)
print(json.dumps({'changedCells':changed,'panRowHeight':expected['height'],'sheetCount':13,'tableCount':11,'sheetNames':sheet_names,'allOtherPackagePartsByteIdentical':True,'allOtherReviewCellsUnchanged':True,'twoPanSourceLinksNativeCached':True,'newSource':'R801','nativeApplication':'LibreOffice Calc read-only PDF proof','original':original,'final':final},ensure_ascii=False))
`;}
