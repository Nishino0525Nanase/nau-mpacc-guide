import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {FileBlob,SpreadsheetFile,Workbook} from '@oai/artifact-tool';

// Run a copy in a task-specific /tmp directory with the primary runtime's
// node_modules symlink. Only the new worksheet is authored and recalculated.
const repo=path.resolve(process.env.NAU_REPO_ROOT || process.cwd());
const outputDir=path.resolve(process.env.NAU_INTERNSHIP_OUTPUT || path.join(repo,'../outputs/nau-intern-downloads-104'));
const sourcePath=path.join(repo,'dist/downloads/evidence-index.xlsx');
const expectedSource='018742bf9ff5a40528499cfa36cc0cdfd89781e76dff8d596409d85a26f7d2c0';
const args=new Set(process.argv.slice(2));
const sheetName='实习资源';
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const text=v=>v==null?'':Array.isArray(v)?v.map(text).filter(Boolean).join('\n'):typeof v==='object'?(v.text||v.label||v.summary||v.name||''):String(v);
const arr=v=>Array.isArray(v)?v:v==null?[]:[v];
const unique=xs=>[...new Set(xs.filter(Boolean))];
const col=i=>{let s='';for(i++;i>0;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;};
await fs.mkdir(outputDir,{recursive:true});
if(args.has('--replace-reviewed')){
  const qa=JSON.parse(await fs.readFile(path.join(outputDir,'workbook-verification.json'),'utf8'));
  const candidate=await fs.readFile(path.join(outputDir,'evidence-index.xlsx'));
  const current=JSON.parse(await fs.readFile(path.join(repo,'dist/data/site-data.json'),'utf8'));
  if(sha(candidate)!==qa.outputSha256 || sha(await fs.readFile(sourcePath))!==qa.sourceSha256 || sha(JSON.stringify(current.internships))!==qa.internshipsSha256)throw new Error('Reviewed candidate, original workbook or internship data changed.');
  for(const file of qa.renderQa)await fs.access(path.join(outputDir,file));
  await fs.mkdir(path.join(outputDir,'backup'),{recursive:true});
  await fs.copyFile(sourcePath,path.join(outputDir,'backup/evidence-index.before-internships.xlsx'),1);
  await fs.writeFile(sourcePath+'.internships104.tmp',candidate);await fs.rename(sourcePath+'.internships104.tmp',sourcePath);
  console.log(JSON.stringify({replaced:true,bytes:candidate.length,sha256:sha(candidate)}));process.exit(0);
}
if(!args.has('--build'))throw new Error('Use --build or --replace-reviewed.');
const sourceBytes=await fs.readFile(sourcePath);
if(sha(sourceBytes)!==expectedSource)throw new Error('Workbook no longer matches the approved 12-sheet baseline.');
const site=JSON.parse(await fs.readFile(path.join(repo,'dist/data/site-data.json'),'utf8'));
const hub=site.internships;
if(hub?.firms?.length!==12)throw new Error('Expected the frozen 12-firm internship data.');
const kinds={internship_program:'实习项目',job_listing:'岗位列表线索',channel:'投递入口',historical:'历史公告',graduate_recruitment:'毕业生正式招聘',preparation_program:'校园准备项目'};
const sourceLink=code=>{const s=site.sourceRegistry[code];if(!s)throw new Error('Unregistered source '+code);return {url:s.url||s.canonicalUrl,label:`${code} ${s.title||s.label||'原文'}`};};
const dateValue=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?(Date.parse(value+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000:'未公布';
const rows=[];
for(const firm of hub.firms){
  const offices=firm.officeRecords.filter(o=>o.city==='南京');
  for(const r of firm.resources){
    const links=[{url:r.url,label:'官方项目或投递入口'}];
    for(const code of unique([...r.sourceIds,...offices.flatMap(o=>o.sourceIds)])){
      const link=sourceLink(code);if(!links.some(x=>x.url===link.url))links.push(link);
    }
    const limits=[...arr(r.limits),r.geographyNote, ...firm.questions.map(q=>'联系前核实：'+text(q))].filter(Boolean);
    rows.push({firmId:firm.id,resourceId:r.id,status:r.status,links,cells:[
      firm.name,firm.group==='big_four'?'四大':'国内所',r.title,kinds[r.kind]||r.kind,
      [r.statusLabel,r.statusDetail].filter(Boolean).join('\n'),
      r.cityTags.length?r.cityTags.join('、'):[r.geographyNote,r.searchCities.length?'可检索城市：'+r.searchCities.join('、'):''].filter(Boolean).join('\n'),
      text(r.eligibility)||'未公布',text(r.applicationWindow)||'未公布',text(r.period)||'未公布',dateValue(r.deadline),
      ['每周出勤：'+(text(r.attendance)||'未公布'),'最短时长：'+(text(r.duration)||'未公布')].join('\n'),
      [r.summary,r.roleDirections.length?'业务方向：'+text(r.roleDirections):'',r.requirements.length?'原文要求：\n'+text(r.requirements):'',r.steps.length?'申请步骤：'+text(r.steps):''].filter(Boolean).join('\n'),
      unique(limits).join('\n'),offices.length?offices.map(o=>[o.city,o.branch,o.district,o.address,...arr(o.limits).filter(value=>!text(value).includes('办公室地址用于确认机构'))].filter(Boolean).map(text).join(' ')).join('\n')+'\n地址仅作机构位置参考，实际项目地点须另行确认。':'未核到本表可引用的南京办公室地址；不代表没有南京业务。'
    ]});
  }
}
for(const x of hub.expansionInstitutions||[]){
  const links=[];if(x.url)links.push({url:x.url,label:'实践基地或机构介绍'});
  for(const code of x.sourceIds){const link=sourceLink(code);if(!links.some(y=>y.url===link.url))links.push(link);}
  rows.push({firmId:x.id,resourceId:x.id,status:'practice_base',links,cells:[x.name,'校内合作拓展','实践基地及机构关注线索','合作基地介绍','非本期招聘',x.officeAddress||'以机构或项目通知为准','未公布','未公布','未公布','未公布','每周出勤：未公布\n最短时长：未公布',x.summary,[x.statusDetail,...arr(x.limits),'合作或基地介绍不保证个人实习名额。'].filter(Boolean).join('\n'),x.officeAddress||'未公布']});
}
const maxLinks=Math.max(...rows.map(r=>r.links.length));
const headers=['机构','分组','项目或渠道名称','资源性质','核实状态','岗位城市及范围','申请对象','申请窗口','实习实施期','明确截止日期','出勤与最短时长','具体内容与准备','适用限制及核实问题','南京办公室参考',...Array.from({length:maxLinks},(_,i)=>i?'原文依据'+i:'项目或投递入口')];
for(const row of rows)row.cells.push(...Array.from({length:maxLinks},(_,i)=>row.links[i]?.label||''));
const widths=[15,14,42,23,40,58,52,40,46,19,48,84,110,62,...Array(maxLinks).fill(55)];
const wb=Workbook.create();const sheet=wb.worksheets.add(sheetName);sheet.showGridLines=false;sheet.tabColor='#173B50';
const lastCol=col(headers.length-1),lastRow=6+rows.length;
sheet.getRange('A2').values=[['四大与国内所实习资源']];
sheet.getRange('A3').values=[[`12所重点机构，另列${(hub.expansionInstitutions||[]).length}条校内合作拓展线索。条目包含项目、列表线索与长期入口，不是当前岗位或空缺人数。`]];
sheet.getRange('A4').values=[['申请窗口、实施期和明确截止日期分别列示。南京办公室不等于实际到岗点；苏州、上海等异地机会另核住宿、课程与驻留安排。']];
sheet.getRange(`A2:${lastCol}2`).format={font:{name:'Arial',size:14,bold:true,color:'#173B50'},rowHeight:26,borders:{bottom:{style:'thin',color:'#497C96'}}};
sheet.getRange(`A3:${lastCol}4`).format={font:{name:'Arial',size:10,color:'#5C6570'},rowHeight:20,wrapText:false};
sheet.getRange(`A6:${lastCol}${lastRow}`).values=[headers,...rows.map(r=>r.cells)];
sheet.getRange(`A7:${lastCol}${lastRow}`).format={font:{name:'Arial',size:10,color:'#243441'},wrapText:true,verticalAlignment:'top'};
widths.forEach((width,i)=>sheet.getRange(`${col(i)}6:${col(i)}${lastRow}`).format.columnWidth=width);
const units=s=>[...text(s)].reduce((n,c)=>n+(/[\u0000-\u00ff]/.test(c)?1:2),0);
const height=(value,width)=>text(value).split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(units(line)/(width-3))),0)*13.5+14;
const heights=[];
for(let i=0;i<rows.length;i++){
  const row=rows[i],num=i+7;const h=Math.max(84,...row.cells.map((value,j)=>height(value,widths[j])));heights.push(h);
  if(h>408)throw new Error(`Row needs ${h}pt: ${row.resourceId}; split its narrative into continuation rows.`);
  sheet.getRange(`A${num}:${lastCol}${num}`).format.rowHeight=h;
  sheet.getRange(`A${num}`).format.font={name:'Arial',size:10,bold:true,color:'#173B50'};
  if(typeof row.cells[9]==='number')sheet.getRange(`J${num}`).setNumberFormat('yyyy-mm-dd');
  for(let j=0;j<row.links.length;j++){
    const l=row.links[j];if(!/^https?:\/\//.test(l.url))throw new Error('Unsafe URL.');
    sheet.getRange(`${col(j+14)}${num}`).formulas=[[`=HYPERLINK("${l.url.replace(/"/g,'""')}","${l.label.replace(/"/g,'""')}")`]];
    sheet.getRange(`${col(j+14)}${num}`).format.font={name:'Arial',size:10,color:'#24627B'};
  }
}
const table=sheet.tables.add(`A6:${lastCol}${lastRow}`,true,'InternshipResources104');table.showFilterButton=true;
rows.forEach((r,i)=>sheet.getRange(`A${i+7}:${lastCol}${i+7}`).format.fill=i%2===0?'#F3F6F8':'#FFFFFF');
sheet.getRange(`A6:${lastCol}6`).format={fill:'#173B50',font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},rowHeight:32,wrapText:true,horizontalAlignment:'center',verticalAlignment:'center',borders:{insideVertical:{style:'thin',color:'#FFFFFF'}}};
sheet.getRange(`E7:E${lastRow}`).conditionalFormats.add('containsText',{text:'已结束',format:{fill:'#FFF1DA',font:{color:'#805A16'}}});
sheet.getRange(`E7:E${lastRow}`).conditionalFormats.add('containsText',{text:'待核',format:{fill:'#FFF1DA',font:{color:'#805A16'}}});
sheet.freezePanes.freezeRows(6);sheet.freezePanes.freezeColumns(2);wb.recalculate();
await fs.writeFile(path.join(outputDir,'internships-inspect.ndjson'),(await wb.inspect({kind:'table',range:`'${sheetName}'!A6:M10`,include:'values,formulas',tableMaxRows:5,tableMaxCols:13,tableMaxCellChars:100,maxChars:10000})).ndjson);
await fs.writeFile(path.join(outputDir,'internships-formula-scan.ndjson'),(await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:100},maxChars:3000})).ndjson);
const renderQa=[];const maxRow=heights.indexOf(Math.max(...heights))+7;
for(const [label,range] of [['internships-opening','A1:F10'],['internships-fields','G6:M9'],['internships-links',`N6:${lastCol}9`],['internships-longest',`G${maxRow}:N${maxRow}`],['internships-ending',`A${lastRow-3}:F${lastRow}`]]){
  const image=await wb.render({sheetName,range,scale:1,format:'png'});const file=label+'.png';renderQa.push(file);await fs.writeFile(path.join(outputDir,file),new Uint8Array(await image.arrayBuffer()));
}
const stage=path.join(outputDir,'internship-stage.xlsx');await(await SpreadsheetFile.exportXlsx(wb)).save(stage);
await fs.writeFile(path.join(outputDir,'internship-rows.json'),JSON.stringify(rows,null,2));
const nativeDir=path.join(outputDir,'native-recalculated');await fs.mkdir(nativeDir,{recursive:true});
const soffice=process.env.NAU_SOFFICE||path.join(process.env.CODEX_PRIMARY_RUNTIME_ROOT,'dependencies/native/libreoffice-headless/libreoffice/program/soffice');
const profile=path.join(outputDir,'lo-workbook-profile');const native=path.join(nativeDir,'internship-stage.xlsx');await fs.rm(native,{force:true});
execFileSync(soffice,[`-env:UserInstallation=file://${profile}`,'--headless','--convert-to','xlsx','--outdir',nativeDir,stage],{timeout:60000,maxBuffer:1024*1024});
await fs.access(native);
const candidate=path.join(outputDir,'evidence-index.xlsx');
const pdfDir=path.join(outputDir,'native-pdf');await fs.mkdir(pdfDir,{recursive:true});
await fs.rm(path.join(pdfDir,'internship-stage.pdf'),{force:true});
execFileSync(soffice,[`-env:UserInstallation=file://${profile}`,'--headless','--convert-to','pdf:calc_pdf_Export:{"SinglePageSheets":{"type":"boolean","value":"true"}}','--outdir',pdfDir,native],{timeout:60000,maxBuffer:1024*1024});
const nativeQa=JSON.parse(execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON,['-c',pdfScript(),path.join(pdfDir,'internship-stage.pdf'),path.join(outputDir,'internship-rows.json'),path.join(outputDir,'internships-native-links.png')],{encoding:'utf8',maxBuffer:1024*1024}));
renderQa.push('internships-native-links.png');
const packed=JSON.parse(execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON,['-c',packageScript(),sourcePath,native,candidate,sheetName],{encoding:'utf8',maxBuffer:5*1024*1024}));
await fs.writeFile(path.join(outputDir,'workbook-preservation.json'),JSON.stringify(packed,null,2));
const audit=JSON.parse(execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON,['-c',auditScript(),sourcePath,candidate,path.join(outputDir,'internship-rows.json'),lastCol,String(lastRow)],{encoding:'utf8',maxBuffer:5*1024*1024}));
audit.sourceSha256=expectedSource;audit.outputSha256=sha(await fs.readFile(candidate));audit.outputBytes=(await fs.stat(candidate)).size;audit.internshipsSha256=sha(JSON.stringify(hub));audit.renderQa=renderQa;audit.longestRowHeight=Math.max(...heights);audit.newDataRows=rows.length;
audit.nativeApplicationRender=nativeQa;
await fs.writeFile(path.join(outputDir,'workbook-verification.json'),JSON.stringify(audit,null,2));console.log(JSON.stringify(audit));

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
sheet_part='xl/worksheets/internships-104.xml';sheet_rels='xl/worksheets/_rels/internships-104.xml.rels'
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
  old_part=target(new_target,rel.attrib['Target']);new_part='xl/tables/internships-104-'+str(i+1)+'.xml';tb=E.fromstring(authored[old_part]);tb.set('id',str(max(existing_ids+[0])+i+1))
  for e in tb.iter():
   for attr in list(e.attrib):
    if attr=='dxfId' or attr.endswith('DxfId'):e.set(attr,str(dxf_start+int(e.attrib[attr])))
  rel.set('Target','../tables/'+posixpath.basename(new_part));new_parts[new_part]=xml(tb);table_parts.append(new_part)
 new_parts[sheet_rels]=xml(sr)
new_parts[sheet_part]=xml(sheet)
rid='rIdInternshipResources104'
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

function auditScript(){return String.raw`
import sys,json,zipfile,xml.etree.ElementTree as E
src,out,prepared,lastcol,lastrow=sys.argv[1:]
Q='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
def canon(x):return None if x is None else [x.tag,sorted(x.attrib.items()),x.text or '',[canon(v) for v in x]]
def read(p):
 with zipfile.ZipFile(p) as z:
  assert z.testzip() is None
  return {n:z.read(n) for n in z.namelist()}
def col(i):
 s='';i+=1
 while i:s=chr(65+(i-1)%26)+s;i=(i-1)//26
 return s
before,after=read(src),read(out)
globals={'xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/styles.xml','xl/sharedStrings.xml','[Content_Types].xml'}
assert all(v==after.get(k) for k,v in before.items() if k not in globals),'Original package part changed'
oldstyle,newstyle=E.fromstring(before['xl/styles.xml']),E.fromstring(after['xl/styles.xml'])
for old in oldstyle:
 new=newstyle.find(old.tag);assert new is not None
 if old.tag in (Q+'extLst',Q+'colors',Q+'tableStyles'):assert canon(old)==canon(new)
 else:assert [canon(c) for c in old]==[canon(c) for c in list(new)[:len(old)]]
oldss,newss=E.fromstring(before['xl/sharedStrings.xml']),E.fromstring(after['xl/sharedStrings.xml'])
assert [canon(c) for c in oldss]==[canon(c) for c in list(newss)[:len(oldss)]]
w0,w1=E.fromstring(before['xl/workbook.xml']),E.fromstring(after['xl/workbook.xml'])
s0,s1=w0.find(Q+'sheets'),w1.find(Q+'sheets')
assert len(s0)==12 and len(s1)==13
assert [canon(c) for c in s0]==[canon(c) for c in list(s1)[:len(s0)]]
assert s1[-1].attrib['name']=='实习资源'
assert canon(w0.find(Q+'definedNames'))==canon(w1.find(Q+'definedNames'))
assert canon(w0.find(Q+'calcPr'))==canon(w1.find(Q+'calcPr'))
sheet=E.fromstring(after['xl/worksheets/internships-104.xml'])
strings=[''.join(x.itertext()) for x in newss]
cells={c.attrib['r']:c for c in sheet.iter(Q+'c')}
def value(c):
 v=c.find(Q+'v');s=v.text if v is not None else ''
 if c.attrib.get('t')=='s':return strings[int(s)]
 if c.attrib.get('t')=='inlineStr':return ''.join(c.find(Q+'is').itertext())
 return s or ''
rows=json.load(open(prepared))
assert len(rows)>=35
for i,row in enumerate(rows,7):
 for j,expected in enumerate(row['cells']):
  addr=col(j)+str(i);actual=value(cells[addr])
  assert (float(actual)==expected if isinstance(expected,(int,float)) else actual==expected),(row['resourceId'],addr,'Cell mismatch')
 for j,link in enumerate(row['links']):
  c=cells[col(j+14)+str(i)];f=c.find(Q+'f');v=c.find(Q+'v')
  assert f is not None and link['url'] in f.text
  assert v is not None and v.text is not None and c.attrib.get('t')!='e'
pane=sheet.find(Q+'sheetViews').find(Q+'sheetView').find(Q+'pane')
assert pane.attrib.get('xSplit')=='2' and pane.attrib.get('ySplit')=='6'
tables=[E.fromstring(v) for k,v in after.items() if k.startswith('xl/tables/') and k.endswith('.xml')]
assert len(tables)==11 and len({t.attrib['id'] for t in tables})==11
newtable=next(t for t in tables if t.attrib['name']=='InternshipResources104')
assert newtable.attrib['ref']=='A6:'+lastcol+lastrow
assert newtable.find(Q+'autoFilter').attrib['ref']=='A6:'+lastcol+lastrow
stats={}
for label,parts in [('original',before),('final',after)]:
 sheets=[E.fromstring(v) for k,v in parts.items() if k.startswith('xl/worksheets/') and k.endswith('.xml')]
 formulas=[c for s in sheets for c in s.iter(Q+'c') if c.find(Q+'f') is not None]
 errors=[c.attrib['r'] for s in sheets for c in s.iter(Q+'c') if c.attrib.get('t')=='e']
 stats[label]={'formulaCount':len(formulas),'cachedFormulaCount':sum(c.find(Q+'v') is not None for c in formulas),'errorCellCount':len(errors)}
assert stats['original']['formulaCount']==417
assert stats['final']['formulaCount']==417+sum(len(r['links']) for r in rows)
assert stats['final']['cachedFormulaCount']==stats['final']['formulaCount']
assert stats['final']['errorCellCount']==0
print(json.dumps({'newSheet':'实习资源','dataRows':len(rows),'sheetNames':[s.attrib['name'] for s in s1],'activeSheet':'实习资源','frozenRows':6,'frozenColumns':2,'tableCount':11,'newTableRange':'A6:'+lastcol+lastrow,'originalSheetsRetained':12,'originalNonGlobalPartsByteIdentical':True,'originalStylePrefixesRetained':True,'originalSharedStringsPrefixRetained':True,'allAuthoredCellValuesMatch':True,'allNewHyperlinksCached':True,'stats':stats},ensure_ascii=False))
`;}

function pdfScript(){return String.raw`
import sys,json,fitz
pdf,rows_path,image=sys.argv[1:]
rows=json.load(open(rows_path));doc=fitz.open(pdf)
assert len(doc)==1,'Expected one new-sheet-only PDF page'
page=doc[0];text=page.get_text()
assert 'HYPERLINK is not implemented' not in text
assert all(name in text for name in ['普华永道','安永','德勤','毕马威','立信','天健','致同','信永中和','天职国际','大华','容诚','中审众环'])
matches=page.search_for('项目或投递入口');assert matches
anchor=max(matches,key=lambda x:x.x0)
clip=fitz.Rect(max(0,anchor.x0-200),max(0,anchor.y0-10),min(page.rect.width,anchor.x0+1250),min(page.rect.height,anchor.y0+420))
page.get_pixmap(matrix=fitz.Matrix(1.4,1.4),clip=clip).save(image)
print(json.dumps({'application':'LibreOffice Calc','operation':'read-only PDF export of new-sheet-only workbook','pages':len(doc),'all12FirmNamesVisible':True,'hyperlinkErrorText':False,'screenshot':'internships-native-links.png'}))
`;}

