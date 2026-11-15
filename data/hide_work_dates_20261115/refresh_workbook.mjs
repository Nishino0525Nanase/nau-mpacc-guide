import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {FileBlob, SpreadsheetFile} from '@oai/artifact-tool';

// Execute a copy from an OS temp directory whose node_modules symlinks to
// CODEX_PRIMARY_RUNTIME_NODE_MODULES. Only the 34 requested display values change.
const repo=path.resolve(process.env.NAU_REPO_ROOT||process.cwd());
const outputDir=path.resolve(process.env.NAU_WORKBOOK_OUTPUT||path.join(repo,'../outputs/hide-work-dates-20261115-workbook'));
const source=path.join(repo,'dist/downloads/evidence-index.xlsx');
const baseline=path.join(outputDir,'evidence-index.before.xlsx');
const marker='检索于2026-11-04';
const expectedHash='6379d409b7d100e470936a80a949238a0c7114deaa179d2a8b85778fed48f623';
const targets={
 '完整来源目录':['D58','D60','D112','D113','D114','D115','D116','D118','D119'],
 '生活学习要点':['G59','G60','G61','G64','G66','G67','G68','G69','G70','G71','G72','G73','G93','G94','G95','G106'],
 '官方核实':['H36','H37','H38','H84','H85','H88','H89','H90','H91']
};
const views=[['完整来源目录','C58:D60'],['生活学习要点','F59:G61'],['生活学习要点','F66:G68'],['官方核实','G36:H38']];
await fs.mkdir(outputDir,{recursive:true});
try{await fs.access(baseline);}catch{await fs.copyFile(source,baseline);}
const bytes=await fs.readFile(baseline);
if(crypto.createHash('sha256').update(bytes).digest('hex')!==expectedHash)throw Error('Unexpected baseline workbook');
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(baseline));
async function render(workbook,phase){
 for(let i=0;i<views.length;i++){
  const [sheetName,range]=views[i];
  const blob=await workbook.render({sheetName,range,scale:1,format:'png'});
  await fs.writeFile(path.join(outputDir,`${phase}-${i+1}.png`),new Uint8Array(await blob.arrayBuffer()));
 }
}
if(!process.argv.includes('--apply')){
 await render(wb,'before');
 console.log(JSON.stringify({phase:'baseline-rendered',outputDir,views}));
 process.exit(0);
}
const changes=[];
for(const [sheetName,addresses] of Object.entries(targets))for(const address of addresses){
 const range=wb.worksheets.getItem(sheetName).getRange(address);
 const oldValue=range.values[0][0];
 if(typeof oldValue!=='string'||!oldValue.includes(marker))throw Error(`Unexpected value ${sheetName}!${address}`);
 const newValue=oldValue===marker?'未标日期':oldValue.replace('；'+marker,'');
 if(newValue===oldValue||newValue.includes(marker))throw Error(`Incomplete cleanup ${sheetName}!${address}`);
 range.values=[[newValue]];
 changes.push({sheetName,address,oldValue,newValue});
}
wb.recalculate();
const stage=path.join(outputDir,'authored-stage.xlsx');
await (await SpreadsheetFile.exportXlsx(wb)).save(stage);
const manifest=path.join(outputDir,'changes.json');
await fs.writeFile(manifest,JSON.stringify(changes,null,2)+'\n');
execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON,[path.join(repo,'data/hide_work_dates_20261115/verify_and_package.py'),baseline,stage,manifest,outputDir],{stdio:'inherit'});
const final=await SpreadsheetFile.importXlsx(await FileBlob.load(path.join(outputDir,'evidence-index.xlsx')));
await render(final,'after');
console.log(JSON.stringify({phase:'finished',outputDir,changedCells:changes.length}));
