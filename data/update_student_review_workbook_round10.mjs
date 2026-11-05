import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { FileBlob, SpreadsheetFile, Workbook } from '@oai/artifact-tool';

// Execute a copy in an OS tmp directory using the primary runtime. Artifact
// Tool authors the changed cells; the merge retains the established workbook.
const repo=path.resolve(process.env.NAU_REPO_ROOT||process.cwd());
const outputDir=path.resolve(process.env.NAU_REVIEW_WORKBOOK_OUTPUT||path.join(repo,'../outputs/nau-reviews10'));
const source=path.join(repo,'dist/downloads/evidence-index.xlsx');
const baselineSha='c014f4ef8546b681d01f064c17701d8fb351dd4855950299835fd932b9c26683';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const args=new Set(process.argv.slice(2));
await fs.mkdir(outputDir,{recursive:true});
if(args.has('--verify-candidate')){
 const final=await SpreadsheetFile.importXlsx(await FileBlob.load(path.join(outputDir,'evidence-index.xlsx')));
 const views=[['A3:K6','after-summary'],['B8:D9','after-mentions'],['G8:H9','after-context'],['B31:D31','after-cai'],['G31:H31','after-cai-context']];
 for(const [range,name] of views){const p=await final.render({sheetName:'学生评价总览',range,scale:1,format:'png'});await fs.writeFile(path.join(outputDir,name+'.png'),new Uint8Array(await p.arrayBuffer()));}
 const inspection=await final.inspect({kind:'table',range:"'学生评价总览'!A3:D9",include:'values,formulas',tableMaxRows:7,tableMaxCols:4,tableMaxCellChars:180,maxChars:3500});
 await fs.writeFile(path.join(outputDir,'final-inspect.ndjson'),inspection.ndjson);console.log('Final packaged weak-comment rows rendered.');process.exit(0);
}
if(args.has('--replace-reviewed')){
 const qa=JSON.parse(await fs.readFile(path.join(outputDir,'final-verification.json'),'utf8'));
 const payload=await fs.readFile(path.join(outputDir,'evidence-index.xlsx'));
 if(sha(payload)!==qa.outputSha256||sha(await fs.readFile(source))!==baselineSha)throw Error('Reviewed source or candidate changed.');
 for(const name of ['after-summary','after-mentions','after-context','after-cai','after-cai-context'])await fs.access(path.join(outputDir,name+'.png'));
 const backup=path.join(outputDir,'evidence-index.before-round10.xlsx');await fs.copyFile(source,backup,1);
 await fs.writeFile(source+'.round10.tmp',payload);await fs.rename(source+'.round10.tmp',source);
 console.log(JSON.stringify({replaced:true,bytes:payload.length,sha256:sha(payload),backup}));process.exit(0);
}
if(args.has('--finish-stage')){
 if(sha(await fs.readFile(source))!==baselineSha)throw Error('Workbook changed since baseline inspection.');
 const output=path.join(outputDir,'evidence-index.xlsx');
 const qa=JSON.parse(execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON,['-c',mergePackage(),source,path.join(outputDir,'authored-stage.xlsx'),output,path.join(outputDir,'expected.json')],{encoding:'utf8',maxBuffer:1024*1024}));
 qa.sourceSha256=baselineSha;qa.outputSha256=sha(await fs.readFile(output));qa.outputBytes=(await fs.stat(output)).size;
 await fs.writeFile(path.join(outputDir,'final-verification.json'),JSON.stringify(qa,null,2)+'\n');console.log(JSON.stringify(qa));process.exit(0);
}
if(!args.has('--build'))throw Error('Use --build, --verify-candidate or --replace-reviewed.');
if(sha(await fs.readFile(source))!==baselineSha)throw Error('Workbook changed since baseline inspection.');
for(const name of ['before-mentions','before-context','before-cai','before-cai-context'])await fs.access(path.join(outputDir,name+'.png'));
const data=JSON.parse(await fs.readFile(path.join(repo,'dist/data/site-data.json'),'utf8'));
const records=data.mentors.flatMap(m=>m.studentReviews.reviews);
const social=records.filter(r=>/https?:\/\/(?:www\.)?(?:xiaohongshu|rednote)\.com\//.test(r.canonicalUrl||r.sourceUrl||''));
const posts=new Map();for(const r of social){const u=new URL(r.canonicalUrl||r.sourceUrl);const id=u.pathname.split('/').filter(Boolean).at(-1);posts.set(id,(posts.get(id)||0)+1);}
const concentrated=[...posts.values()].sort((a,b)=>b-a).slice(0,2).reduce((a,b)=>a+b,0);
if(records.length!==40||social.length!==34||posts.size!==4||concentrated!==32)throw Error('Expected frozen source-breadth counts40/34/4/32.');
if(data.mentors.filter(m=>m.studentReviews.reviews.length).length!==20||data.mentors.filter(m=>m.studentReviews.coverageStatus==='mpacc_guidance').length!==3||data.socialPosts.length!==114)throw Error('Unexpected coverage counts.');
const baseline=JSON.parse(execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON,['-c',readBaseline(),source],{encoding:'utf8'}));
const wb=Workbook.create();const sh=wb.worksheets.add('学生评价总览');sh.showGridLines=false;
const columns='ABCDEFGHIJK';const widths=[14,25,96,82,86,86,90,112,56,56,56];
for(let i=0;i<widths.length;i++)sh.getRange(columns[i]+':'+columns[i]).format.columnWidth=widths[i];
const summary='40条记录涉及20位导师，3位有明确MPAcc指导材料。34条小红书记录来自4篇不同帖子，32条集中在2篇；不等于独立学生样本。全站114条社交索引不都是导师亲历帖。';
const header='原文内容与评论语境';
sh.mergeCells('A3:K3');sh.getRange('A3').values=[[summary]];sh.getRange('A3:K3').format={font:{name:'Arial',size:10,color:'#5C6570'},rowHeight:20,wrapText:false};
const headers=[...baseline.headers];headers[2]=header;sh.getRange('A6:K6').values=[headers];sh.getRange('A6:K6').format={font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},fill:'#173B50',wrapText:true,rowHeight:30};
const text=v=>v==null?'':Array.isArray(v)?v.map(text).filter(Boolean).join('\n'):typeof v==='object'?v.text||v.label||v.summary||JSON.stringify(v):String(v);
const identity=r=>['账号：'+r.narrator,r.identity,'学位：'+r.degree,'届别/年份：'+r.year,'显示日期：'+(r.date||'未说明'),'与教师接触：'+r.relationship,'亲历关系：未确认'].filter(Boolean).join('；');
const rows={};
for(const [name,n] of [['温素彬',8],['王烨',9],['蔡显军',31]]){
 const m=data.mentors.find(m=>m.name===name);const d=m.studentReviews;
 if(d.coverageStatus!=='weak_mentions'||d.reviews.length!==1||d.recommendationPoints.length||d.concerns.length)throw Error('Weak-discussion record unexpectedly upgraded: '+name);
 if(d.reviews[0].firsthand===true)throw Error('Weak comment must not be labelled confirmed firsthand: '+name);
 if(d.reviews[0].polarity!=='neutral'||d.reviews[0].contextAssessment?.eligibleForRecommendation!==false)throw Error('Wait for completed neutral-context audit: '+name);
 const limits=r=>text(r.limits).replace('身份不明的单条轻松体验线索，不能推成低要求、允许实习或基本指导保障','身份不明的简短提名不足以推断低要求、实习安排或指导保障');
 const values=[m.name,d.reviews[0].contextAssessment.displayLabel||d.coverageLabel,
  d.reviews.map(r=>`${r.text}${r.specifics?.length?'\n评论语境：'+text(r.specifics):''}\n记录编号：${r.id}`).join('\n\n'),
  d.reviews.map(r=>identity(r)).join('\n\n'),
  '该条仅保留评论语境，不作为推荐依据。',
  '该条不作为避雷依据。需要核实的问题见右列。',
  text(d.verificationQuestions),
  [d.reviews.map(r=>`${limits(r)}\n阅读范围：${r.readingScope}`).join('\n\n'),'资料缺口：\n'+text(d.gaps),d.sampleCountNote].filter(Boolean).join('\n\n')
 ];
 sh.getRange(`A${n}:H${n}`).values=[values];
 const units=s=>[...text(s)].reduce((n,c)=>n+(/[\u0000-\u00ff]/.test(c)?1:2),0);
 const needed=Math.max(...values.map((v,i)=>text(v).split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(units(line)/(widths[i]-3))),0)*13.5+12));
 const height=Math.max(baseline.heights[n],needed);if(height>408)throw Error('Changed row would clip: '+name);
 sh.getRange(`A${n}:H${n}`).format={font:{name:'Arial',size:10,color:'#243441'},fill:n%2?'#F3F6F8':'#FFFFFF',wrapText:true,verticalAlignment:'top',rowHeight:height};
 rows[n]={name,values,height};
}
wb.recalculate();
const check=await wb.inspect({kind:'table',range:"'学生评价总览'!B8:D9",include:'values,formulas',tableMaxRows:2,tableMaxCols:3,tableMaxCellChars:230,maxChars:2500});
await fs.writeFile(path.join(outputDir,'authored-inspect.ndjson'),check.ndjson);
const errors=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20},summary:'changed-cell error scan',maxChars:1000});
await fs.writeFile(path.join(outputDir,'authored-error-scan.ndjson'),errors.ndjson);
const stage=path.join(outputDir,'authored-stage.xlsx');await(await SpreadsheetFile.exportXlsx(wb)).save(stage);
const expect={summary,header,rows};await fs.writeFile(path.join(outputDir,'expected.json'),JSON.stringify(expect));
const output=path.join(outputDir,'evidence-index.xlsx');
const qa=JSON.parse(execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON,['-c',mergePackage(),source,stage,output,path.join(outputDir,'expected.json')],{encoding:'utf8',maxBuffer:1024*1024}));
qa.sourceSha256=baselineSha;qa.outputSha256=sha(await fs.readFile(output));qa.outputBytes=(await fs.stat(output)).size;
await fs.writeFile(path.join(outputDir,'final-verification.json'),JSON.stringify(qa,null,2)+'\n');console.log(JSON.stringify(qa));

function readBaseline(){return String.raw`
import json,sys,zipfile,xml.etree.ElementTree as E
z=zipfile.ZipFile(sys.argv[1]);Q='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}';ss=E.fromstring(z.read('xl/sharedStrings.xml'));sheet=E.fromstring(z.read('xl/worksheets/student-reviews-103.xml'))
def val(c):
 if c.attrib.get('t')=='inlineStr':return ''.join(c.find(Q+'is').itertext())
 v=c.find(Q+'v');s=(v.text or '') if v is not None else ''
 return ''.join(ss[int(s)].itertext()) if c.attrib.get('t')=='s' else s
rows={r.attrib['r']:r for r in sheet.iter(Q+'row')};headers=[val(c) for c in rows['6']]
print(json.dumps({'headers':headers,'heights':{n:float(rows[str(n)].attrib['ht']) for n in [8,9,31]}},ensure_ascii=False))
`;}

function mergePackage(){return String.raw`
import copy,json,sys,zipfile,xml.etree.ElementTree as E
src,stage,out,ex=sys.argv[1:];expected=json.load(open(ex));Q='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
def load(p):
 with zipfile.ZipFile(p) as z:
  assert z.testzip() is None
  return {n:z.read(n) for n in z.namelist()}
before,authored=load(src),load(stage);parts=dict(before);ss=E.fromstring(authored['xl/sharedStrings.xml']);oldss=E.fromstring(before['xl/sharedStrings.xml'])
part='xl/worksheets/student-reviews-103.xml';sheet=E.fromstring(parts[part]);stage_sheet=E.fromstring(authored['xl/worksheets/sheet1.xml']);cells={c.attrib['r']:c for c in sheet.iter(Q+'c')};incoming={c.attrib['r']:c for c in stage_sheet.iter(Q+'c')}
targets=['A3','C6']+[col+n for n in ['8','9','31'] for col in 'BCDEFGH']
for address in targets:
 old=cells[address];inc=copy.deepcopy(incoming[address])
 if inc.attrib.get('t') in ('s','str','inlineStr') and inc.find(Q+'f') is None:
  typ=inc.attrib['t'];v=inc.find(Q+'v');content=''.join(ss[int(v.text)].itertext()) if typ=='s' else ''.join(inc.find(Q+'is').itertext()) if typ=='inlineStr' else v.text or ''
  si=E.Element(Q+'is');t=E.SubElement(si,Q+'t');t.set('{http://www.w3.org/XML/1998/namespace}space','preserve');t.text=content
  for child in list(inc):inc.remove(child)
  inc.append(si);inc.set('t','inlineStr')
 for child in list(old):old.remove(child)
 old.attrib.pop('t',None)
 if inc.attrib.get('t'):old.set('t',inc.attrib['t'])
 for child in inc:old.append(copy.deepcopy(child))
for n,item in expected['rows'].items():
 row=next(r for r in sheet.iter(Q+'row') if r.attrib['r']==n);row.set('ht',str(item['height']));row.set('customHeight','true')
E.register_namespace('',Q[1:-1]);E.register_namespace('r','http://schemas.openxmlformats.org/officeDocument/2006/relationships');parts[part]=E.tostring(sheet,encoding='utf-8',xml_declaration=True)
tablepart='xl/tables/student-reviews-103-1.xml';table=E.fromstring(parts[tablepart]);table.find(Q+'tableColumns')[2].set('name',expected['header']);parts[tablepart]=E.tostring(table,encoding='utf-8',xml_declaration=True)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for key,payload in parts.items():z.writestr(key,payload)
after=load(out);allowed={part,tablepart};assert all(after[k]==v for k,v in before.items() if k not in allowed),'Unrelated package part changed'
def val(c):
 if c.attrib.get('t')=='inlineStr':return ''.join(c.find(Q+'is').itertext())
 v=c.find(Q+'v');s=(v.text or '') if v is not None else ''
 return ''.join(oldss[int(s)].itertext()) if c.attrib.get('t')=='s' else s
def canon(e):return [e.tag,sorted(e.attrib.items()),e.text or '',[canon(c) for c in e]]
old_sheet=E.fromstring(before[part]);new_sheet=E.fromstring(after[part]);newcells={c.attrib['r']:c for c in new_sheet.iter(Q+'c')}
for c in old_sheet.iter(Q+'c'):
 if c.attrib['r'] not in targets:assert canon(c)==canon(newcells[c.attrib['r']]),c.attrib['r']
assert val(newcells['A3'])==expected['summary'] and val(newcells['C6'])==expected['header']
for n,item in expected['rows'].items():
 for i in range(1,8):assert val(newcells[chr(65+i)+n])==item['values'][i],(n,i)
for r in old_sheet.iter(Q+'row'):
 if r.attrib['r'] not in set(expected['rows'])|{'3','6'}:assert canon(r)==canon(next(n for n in new_sheet.iter(Q+'row') if n.attrib['r']==r.attrib['r'])),r.attrib['r']
def stats(p):
 cells=[c for name,b in p.items() if name.startswith('xl/worksheets/') and name.endswith('.xml') for c in E.fromstring(b).iter(Q+'c')]
 f=[c for c in cells if c.find(Q+'f') is not None]
 return {'formulas':len(f),'cached':sum(c.find(Q+'v') is not None for c in f),'errors':sum(c.attrib.get('t')=='e' for c in cells)}
a,b=stats(before),stats(after);assert a==b and b['formulas']==526 and b['cached']==526 and b['errors']==0
assert len(E.fromstring(after['xl/workbook.xml']).find(Q+'sheets'))==13
assert len([n for n in after if n.startswith('xl/tables/') and n.endswith('.xml')])==11
old_table=E.fromstring(before[tablepart]);new_table=E.fromstring(after[tablepart]);old_table.find(Q+'tableColumns')[2].set('name',expected['header']);assert canon(old_table)==canon(new_table)
print(json.dumps({'changedCells':targets,'changedWeakRows':[8,9,31],'headerUpdated':True,'studentRecords':40,'teachersWithRecords':20,'explicitMpaccTeachers':3,'xhsRecords':34,'xhsPostCount':4,'recordsInTwoLargestPosts':32,'totalSiteSocialIndex':114,'sheets':13,'tables':11,'rowHeights':{n:v['height'] for n,v in expected['rows'].items()},'allOtherPackagePartsByteIdentical':True,'allOtherCellsUnchanged':True,'formulasAndCachesUnchanged':True,'original':a,'final':b},ensure_ascii=False))
`;}
