import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { FileBlob, SpreadsheetFile, Workbook } from '@oai/artifact-tool';

// Run a copy from an OS tmp directory with the primary runtime node_modules.
// Artifact Tool authors the changed cells. The package merge preserves the
// workbook's established sheets, native tables and unrelated cached formulas.
const repo=path.resolve(process.env.NAU_REPO_ROOT||process.cwd());
const outputDir=path.resolve(process.env.NAU_REVIEW_WORKBOOK_OUTPUT||path.join(repo,'../outputs/nau-reviews8'));
const source=path.join(repo,'dist/downloads/evidence-index.xlsx');
const sourceHash='d89f961d3ae7252025e64701926ca26d1fcea36a922d1250b47088a6986c45dd';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const args=new Set(process.argv.slice(2));
await fs.mkdir(outputDir,{recursive:true});
if(args.has('--verify-candidate')){
 const final=await SpreadsheetFile.importXlsx(await FileBlob.load(path.join(outputDir,'evidence-index.xlsx')));
 const views=args.has('--context-only')?[['继续补读','H12:L13','after-context']]:[['继续补读','A12:G13','after-source'],['继续补读','H12:L13','after-context'],['应用版补充','H16:L16','after-r317']];
 for(const [sheetName,range,name] of views){
  const p=await final.render({sheetName,range,scale:1,format:'png'});await fs.writeFile(path.join(outputDir,name+'.png'),new Uint8Array(await p.arrayBuffer()));
 }
 const check=await final.inspect({kind:'table',range:"'继续补读'!A13:M13",include:'values,formulas',tableMaxRows:1,tableMaxCols:13,tableMaxCellChars:100,maxChars:2500});
 await fs.writeFile(path.join(outputDir,'final-r901-inspect.ndjson'),check.ndjson);console.log('Final packaged workbook rendered and inspected.');process.exit(0);
}
if(args.has('--replace-reviewed')){
 const qa=JSON.parse(await fs.readFile(path.join(outputDir,'final-verification.json'),'utf8'));
 const payload=await fs.readFile(path.join(outputDir,'evidence-index.xlsx'));
 if(sha(payload)!==qa.outputSha256||sha(await fs.readFile(source))!==sourceHash)throw Error('Reviewed source or candidate changed.');
 for(const name of ['after-source.png','after-context.png','after-r317.png'])await fs.access(path.join(outputDir,name));
 const backup=path.join(outputDir,'evidence-index.before-reviews8.xlsx');
 await fs.copyFile(source,backup,1);
 await fs.writeFile(source+'.reviews8.tmp',payload);await fs.rename(source+'.reviews8.tmp',source);
 console.log(JSON.stringify({replaced:true,bytes:payload.length,sha256:sha(payload),backup}));process.exit(0);
}
if(!args.has('--build')&&!args.has('--finish-stage'))throw Error('Use --build or --replace-reviewed.');
if(sha(await fs.readFile(source))!==sourceHash)throw Error('Workbook changed since baseline inspection.');
if(args.has('--finish-stage')){
 const out=path.join(outputDir,'evidence-index.xlsx');
 const qa=JSON.parse(execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON,['-c',mergePackage(),source,path.join(outputDir,'native-recalculated/authored-stage.xlsx'),out,path.join(outputDir,'expected.json')],{encoding:'utf8',maxBuffer:1024*1024}));
 qa.sourceSha256=sourceHash;qa.outputSha256=sha(await fs.readFile(out));qa.outputBytes=(await fs.stat(out)).size;
 await fs.writeFile(path.join(outputDir,'final-verification.json'),JSON.stringify(qa,null,2)+'\n');console.log(JSON.stringify(qa));process.exit(0);
}
for(const name of ['before-source.png','before-scope.png','before-r317.png'])await fs.access(path.join(outputDir,name));
const data=JSON.parse(await fs.readFile(path.join(repo,'dist/data/site-data.json'),'utf8'));
const x01=JSON.parse(await fs.readFile(path.join(repo,'data/reviews_round8/x01-reread.json'),'utf8'));
const course=JSON.parse(await fs.readFile(path.join(repo,'data/reviews_round8/r317-reread.json'),'utf8'));
const self=data.sourceRegistry.R901;
if(!self||self.kind!=='教师本人自述·非学生评价'||data.officialEvidence.length!==185||data.socialPosts.length!==114)throw Error('Expected final 185/114 data with explicitly labelled R901.');
if(data.mentors.flatMap(m=>m.studentReviews.reviews).length!==40)throw Error('Student reviews must remain 40.');
const baseline=JSON.parse(execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON,['-c',readBaseline(),source],{encoding:'utf8'}));
const wb=Workbook.create();
const cont=wb.worksheets.add('继续补读');const app=wb.worksheets.add('应用版补充');
const columns='ABCDEFGHIJKLM';const widths=[12,18,15,48,23,19,24,48,64,68,72,78,64];
for(const sh of [cont,app]){
 sh.showGridLines=false;
 for(let i=0;i<13;i++)sh.getRange(columns[i]+':'+columns[i]).format.columnWidth=widths[i];
 sh.getRange('A1:M20').format.font={name:'Arial',size:10,color:'#243441'};
}
const summary='本页7条记录：5条官方新增、1条既有事件辅证、1条旧帖补读更新。教师自述单列，不计学生评价。';
cont.getRange('A3').values=[[summary]];cont.getRange('A3:M3').format={font:{name:'Arial',size:10,color:'#5C6570'},rowHeight:20};
const oldX01=baseline.cont12;
const x01Scope='先前记录：'+oldX01[11]+'\n\n登录后补读：'+x01.readingScope+'\n\n本次X01未取得可下载的新截图文件，先前已发布截图保留。';
const xrow=[...oldX01];xrow[11]=x01Scope;cont.getRange('A12:M12').values=[xrow];
const dateSerial=(Date.UTC(2023,6,21)-Date.UTC(1899,11,30))/86400000;
const r901=[
 'R901','新增','教师本人自述','财会审青年风采（六）：傅祥斐自述','中国财政杂志社网站',dateSerial,'傅祥斐（本人署名段落）',
 '2023年教师本人回顾入职初期工作，论文指导的学生学位阶段未说明。',
 '傅祥斐自述通过增加案例、请教同事和课前演练改善《成本与管理会计》授课；担任班主任及学年、毕业论文指导时交流学习、生活与职业规划，并指导学科竞赛。',
 '可用作联系导师前的教师自述背景，追问当前MPAcc论文反馈、固定交流及实习安排。原文没有给出这些具体规则。',
 '本人署名自述，不计学生亲历或独立口碑。评教名次没有原始数据，不作排名。历史经历不保证当前指导方式、名额或学生去向。',
 self.readingScope,self.url
];
cont.getRange('A13:M13').values=[r901];cont.getRange('F13').format.numberFormat='yyyy-mm-dd';
cont.getRange('M13').formulas=[[`=HYPERLINK("${self.url}","${self.url}")`]];
const arow=[...baseline.app16];
arow[7]='南审MPAcc/MAud选课互助帖；评论者专业、年级及亲历程度按原文限定，全部未具名任课教师。';
arow[8]='补读会计研究方法、商业智能分析等课程评论。另取得正文及4条公开可见课程评论的5张真实截图；未新增具名导师评价。';
arow[9]=course.comments.map(c=>c.course+'：'+c.text).join('\n');
arow[10]='仅月日，年份不猜。会计研究方法结课回复：先前日志08-28，本次提取08-27，保留差异。\n“智能商业分析”与“商业智能分析”两种写法不强认同一课程。历史考核、点名和给分印象以本学期通知为准。';
arow[11]='先前记录：'+baseline.app16[11]+'\n\n继续补读：'+course.readingScope+'\n未读部分：'+course.unread;
app.getRange('A16:M16').values=[arow];
const units=s=>[...String(s??'')].reduce((n,c)=>n+(/[\u0000-\u00ff]/.test(c)?1:2),0);
const height=row=>Math.max(82,...row.map((v,i)=>String(v??'').split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(units(line)/(widths[i]-3))),0)*13.5+12));
const heights={cont12:height(xrow),cont13:height(r901),app16:height(arow)};
if(Object.values(heights).some(h=>h>408))throw Error('Changed row would exceed readable native row height.');
for(const [sh,range,h] of [[cont,'A12:M12',heights.cont12],[cont,'A13:M13',heights.cont13],[app,'A16:M16',heights.app16]]){
 sh.getRange(range).format={font:{name:'Arial',size:10,color:'#243441'},wrapText:true,verticalAlignment:'top',rowHeight:h};
}
cont.getRange('A13').format.font={name:'Arial',size:10,bold:true,color:'#173B50'};
cont.getRange('M13').format.font={name:'Arial',size:10,color:'#24627B'};
wb.recalculate();
const inspection=await wb.inspect({kind:'table',range:"'继续补读'!A13:M13",include:'values,formulas',tableMaxRows:1,tableMaxCols:13,tableMaxCellChars:110,maxChars:3000});
await fs.writeFile(path.join(outputDir,'r901-inspect.ndjson'),inspection.ndjson);
for(const [sh,range,name] of [[cont,'A12:G13','after-source'],[cont,'H12:L13','after-context'],[app,'H16:L16','after-r317']]){
 const p=await wb.render({sheetName:sh.name,range,scale:1,format:'png'});await fs.writeFile(path.join(outputDir,name+'.png'),new Uint8Array(await p.arrayBuffer()));
}
const stage=path.join(outputDir,'authored-stage.xlsx');await(await SpreadsheetFile.exportXlsx(wb)).save(stage);
const nativeDir=path.join(outputDir,'native-recalculated');await fs.mkdir(nativeDir,{recursive:true});
const native=path.join(nativeDir,'authored-stage.xlsx');await fs.rm(native,{force:true});
const soffice=path.join(process.env.CODEX_PRIMARY_RUNTIME_ROOT,'dependencies/native/libreoffice-headless/libreoffice/program/soffice');
execFileSync(soffice,[`-env:UserInstallation=file://${outputDir}/lo-profile`,'--headless','--convert-to','xlsx','--outdir',nativeDir,stage],{timeout:60000,maxBuffer:1024*1024});
const expect={summary,x01Scope,r901,app16:arow,heights,url:self.url};await fs.writeFile(path.join(outputDir,'expected.json'),JSON.stringify(expect));
const out=path.join(outputDir,'evidence-index.xlsx');
const qa=JSON.parse(execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON,['-c',mergePackage(),source,native,out,path.join(outputDir,'expected.json')],{encoding:'utf8',maxBuffer:1024*1024}));
qa.sourceSha256=sourceHash;qa.outputSha256=sha(await fs.readFile(out));qa.outputBytes=(await fs.stat(out)).size;
await fs.writeFile(path.join(outputDir,'final-verification.json'),JSON.stringify(qa,null,2)+'\n');console.log(JSON.stringify(qa));

function readBaseline(){return String.raw`
import json,sys,zipfile,xml.etree.ElementTree as E
z=zipfile.ZipFile(sys.argv[1]);Q='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}';ss=E.fromstring(z.read('xl/sharedStrings.xml'))
def val(c):
 if c.attrib.get('t')=='inlineStr':return ''.join(c.find(Q+'is').itertext())
 n=c.find(Q+'v');s=(n.text or '') if n is not None else ''
 if c.attrib.get('t')=='s':return ''.join(ss[int(s)].itertext())
 return float(s) if s and c.attrib.get('t') not in ('str','e') else s
def row(part,n):
 s=E.fromstring(z.read(part));r=next(r for r in s.iter(Q+'row') if r.attrib['r']==str(n));cells={c.attrib['r']:c for c in r}
 return [val(cells.get(chr(65+i)+str(n))) if chr(65+i)+str(n) in cells else '' for i in range(13)]
print(json.dumps({'cont12':row('xl/worksheets/research-102-supplement.xml',12),'app16':row('xl/worksheets/app-supplement.xml',16)},ensure_ascii=False))
`;}

function mergePackage(){return String.raw`
import copy,json,sys,zipfile,xml.etree.ElementTree as E
src,stage,out,ex=sys.argv[1:];expected=json.load(open(ex));Q='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
def load(p):
 with zipfile.ZipFile(p) as z:
  assert z.testzip() is None
  return {n:z.read(n) for n in z.namelist()}
parts,authored=load(src),load(stage);oldss=E.fromstring(parts['xl/sharedStrings.xml']);ss=E.fromstring(authored['xl/sharedStrings.xml'])
def val(c,s):
 if c is None:return ''
 if c.attrib.get('t')=='inlineStr':return ''.join(c.find(Q+'is').itertext())
 v=c.find(Q+'v');t=(v.text or '') if v is not None else ''
 return ''.join(s[int(t)].itertext()) if c.attrib.get('t')=='s' else t
def copycontent(target,incoming):
 inc=copy.deepcopy(incoming)
 if inc.attrib.get('t')=='s':
  v=inc.find(Q+'v');si=E.Element(Q+'is');t=E.SubElement(si,Q+'t');t.set('{http://www.w3.org/XML/1998/namespace}space','preserve');t.text=''.join(ss[int(v.text)].itertext())
  for c in list(inc):inc.remove(c)
  inc.append(si);inc.set('t','inlineStr')
 for c in list(target):target.remove(c)
 target.attrib.pop('t',None)
 if inc.attrib.get('t'):target.set('t',inc.attrib['t'])
 for c in inc:target.append(copy.deepcopy(c))
changed={}
contpart='xl/worksheets/research-102-supplement.xml';apppart='xl/worksheets/app-supplement.xml'
for part,newpart,targets,rowheight in [
 (contpart,'xl/worksheets/sheet1.xml',['A3','L12']+[chr(65+i)+'13' for i in range(13)],{'12':expected['heights']['cont12'],'13':expected['heights']['cont13']}),
 (apppart,'xl/worksheets/sheet2.xml',[c+'16' for c in 'HIJKL'],{'16':expected['heights']['app16']})]:
 sh=E.fromstring(parts[part]);stage_sh=E.fromstring(authored[newpart]);cells={c.attrib['r']:c for c in sh.iter(Q+'c')};incoming={c.attrib['r']:c for c in stage_sh.iter(Q+'c')};rows={r.attrib['r']:r for r in sh.iter(Q+'row')}
 if part==contpart:
  template=rows['7'];newrow=E.Element(Q+'row',dict(template.attrib));newrow.set('r','13');rows['13']=newrow;sh.find(Q+'sheetData').append(newrow)
  for i in range(13):
   col=chr(65+i);old=cells[col+'7'];new=E.Element(Q+'c',{'r':col+'13','s':old.attrib.get('s','0')});newrow.append(new);cells[col+'13']=new
  sh.find(Q+'dimension').set('ref','A2:M13')
 changed[part]=targets
 for address in targets:copycontent(cells[address],incoming[address])
 if part==contpart:cells['H13'].set('s',cells['H12'].attrib['s'])
 for n,h in rowheight.items():rows[n].set('ht',str(h));rows[n].set('customHeight','true')
 E.register_namespace('',Q[1:-1]);E.register_namespace('r','http://schemas.openxmlformats.org/officeDocument/2006/relationships');parts[part]=E.tostring(sh,encoding='utf-8',xml_declaration=True)
tablepart='xl/tables/research-102-supplement-1.xml';table=E.fromstring(parts[tablepart]);table.set('ref','A6:M13');auto=table.find(Q+'autoFilter')
if auto is not None:auto.set('ref','A6:M13')
parts[tablepart]=E.tostring(table,encoding='utf-8',xml_declaration=True)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for key,payload in parts.items():z.writestr(key,payload)
before,after=load(src),load(out);allowed=set(changed)|{tablepart}
assert all(after[k]==v for k,v in before.items() if k not in allowed),'Unrelated package part changed'
def canon(e):return [e.tag,sorted(e.attrib.items()),e.text or '',[canon(c) for c in e]]
for part,addresses in changed.items():
 old=E.fromstring(before[part]);new=E.fromstring(after[part]);newcells={c.attrib['r']:c for c in new.iter(Q+'c')}
 for c in old.iter(Q+'c'):
  if c.attrib['r'] not in addresses:assert canon(c)==canon(newcells[c.attrib['r']]),(part,c.attrib['r'])
cont=E.fromstring(after[contpart]);cells={c.attrib['r']:c for c in cont.iter(Q+'c')};assert val(cells['A3'],oldss)==expected['summary'];assert val(cells['L12'],oldss)==expected['x01Scope']
for i,v in enumerate(expected['r901']):assert val(cells[chr(65+i)+'13'],oldss)==str(v),(i,val(cells[chr(65+i)+'13'],oldss),v)
assert expected['url'] in cells['M13'].find(Q+'f').text and cells['M13'].attrib.get('t')!='e'
app=E.fromstring(after[apppart]);appcells={c.attrib['r']:c for c in app.iter(Q+'c')}
for i in range(7,12):assert val(appcells[chr(65+i)+'16'],oldss)==expected['app16'][i]
def stats(p):
 cells=[c for n,b in p.items() if n.startswith('xl/worksheets/') and n.endswith('.xml') for c in E.fromstring(b).iter(Q+'c')]
 f=[c for c in cells if c.find(Q+'f') is not None]
 return {'formulas':len(f),'cached':sum(c.find(Q+'v') is not None for c in f),'errors':sum(c.attrib.get('t')=='e' for c in cells)}
a,b=stats(before),stats(after);assert b['formulas']==a['formulas']+1 and b['cached']==b['formulas'] and b['errors']==0
assert len(E.fromstring(after['xl/workbook.xml']).find(Q+'sheets'))==13
assert len([n for n in after if n.startswith('xl/tables/') and n.endswith('.xml')])==11
assert E.fromstring(after[tablepart]).attrib['ref']=='A6:M13'
print(json.dumps({'changedCells':changed,'newSource':'R901','studentReviewRecords':40,'officialEvidence':185,'socialPosts':114,'sheets':13,'tables':11,'newSourceRow':13,'rowHeights':expected['heights'],'allOtherPackagePartsByteIdentical':True,'allOtherCellsUnchanged':True,'nativeHyperlinkCached':True,'original':a,'final':b},ensure_ascii=False))
`;}
