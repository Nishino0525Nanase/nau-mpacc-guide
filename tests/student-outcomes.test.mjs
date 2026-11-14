import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const dataset=JSON.parse(readFileSync(new URL('../dist/data/site-data.json',import.meta.url),'utf8'));
const degreeTypes=new Set(['MPAcc','MAud','academic_master','master_unspecified','undergraduate','unspecified']);
const outcomeTypes=new Set(['phd','employment','further_study']);
const httpSource=entry=>{
  try {const url=new URL(entry?.url||entry?.originalUrl||entry?.canonicalUrl);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;}catch{return false;}
};

async function app(data=dataset) {
  const elements=new Map(),handlers=new Map(),winHandlers=new Map(),writes=[],errors=[];
  let document;
  class Element {
    constructor(selector){this.selector=selector;this.id=selector.startsWith('#')?selector.slice(1):'';this.dataset={};this.style={};this.attributes={};this.isConnected=true;this.open=false;this.innerHTML='';this.value='';this.textContent='';this.classList={add(){},remove(){},contains(){return false;}};}
    querySelector(selector){return get(selector);}
    querySelectorAll(){return [];}
    addEventListener(name,fn){handlers.set(this.selector+':'+name,fn);}
    setAttribute(name,value){this.attributes[name]=value;}
    removeAttribute(name){delete this.attributes[name];}
    getBoundingClientRect(){return {height:90,left:0,right:800,top:0,bottom:700};}
    focus(){document.activeElement=this;}
    scrollIntoView(){}
    showModal(){this.open=true;}
    close(){this.open=false;}
    dispatchEvent(event){handlers.get(event.type)?.({target:this});}
    get parentElement(){return get(this.selector+'-parent');}
  }
  const get=selector=>{if(!elements.has(selector))elements.set(selector,new Element(selector));return elements.get(selector);};
  document={querySelector:get,querySelectorAll:()=>[],documentElement:{style:{setProperty(){}}},body:{style:{}},activeElement:get('start'),title:'',addEventListener:(name,fn)=>handlers.set(name,fn)};
  const location={href:'https://example.github.io/nau-mpacc-guide/',hash:''};
  const window={location,isSecureContext:true,matchMedia:()=>({matches:false}),addEventListener:(name,fn)=>winHandlers.set(name,fn),dispatchEvent(){},scrollTo(){},scrollY:0};
  vm.runInNewContext(script,{document,window,location,navigator:{},URL,CSS:{escape:x=>x},console:{log(){},warn(){},error:(...args)=>errors.push(args)},CustomEvent:class{constructor(name,options){this.type=name;this.detail=options?.detail;}},Event:class{constructor(type){this.type=type;}},fetch:async()=>({ok:true,json:async()=>structuredClone(data),headers:{get:()=>null}}),localStorage:{getItem:()=>null,setItem:(key,value)=>writes.push([key,value])},requestAnimationFrame:fn=>fn(),setTimeout:()=>1,clearTimeout(){}});
  for(let i=0;i<16;i++)await Promise.resolve();
  const change=(id,value)=>{const target=get('#'+id);target.value=value;handlers.get('change')({target});};
  const input=(id,value)=>{const target=get('#'+id);target.value=value;handlers.get('input')({target});};
  const click=(action,id,extra={})=>handlers.get('click')({target:{closest:selector=>selector==='[data-action]'?{dataset:{action,id,...extra},setAttribute(){}}:null},preventDefault(){}});
  return {get,change,input,click,writes,errors,route(hash){location.hash=hash;winHandlers.get('hashchange')();},html(){return get('#outcome-results').innerHTML;}};
}

function outcomeFixture() {
  const data=structuredClone(dataset),mentor=data.mentors[0],other=data.mentors[1];
  data.sourceRegistry.OUTCOME_TEST={title:'公开毕业去向原文',url:'https://example.org/public-destination',date:'2026-06-26'};
  data.sourceRegistry.OUTCOME_UNSAFE={title:'不安全链接',url:'javascript:alert(9)'};
  const record=(id,name,degree,organization,extra={})=>({id,studentName:name,degree,degreeLabel:{MPAcc:'会计专硕',MAud:'审计专硕',academic_master:'会计学硕',master_unspecified:'硕士，类型未明',undergraduate:'本科',unspecified:'培养阶段未明'}[degree],cohort:null,graduationYear:2026,mentorId:null,mentorName:null,relationship:null,outcome:{type:'employment',organization,program:null,year:2026,statusLabel:'毕业去向',asOf:'2026-06-26',sourceIds:['OUTCOME_TEST']},sourceIds:['OUTCOME_TEST'],limits:['公开具名个案，不能推算全体学生就业比例。'],...extra});
  data.studentOutcomes={
    intro:'公开毕业去向，分开核对学位类型和导师关系。',
    records:[
      record('linked','DIRECT_MPACC_STUDENT','MPAcc','DIRECT_DESTINATION',{mentorId:mentor.id,mentorName:mentor.name,relationship:{text:'官方明示学位论文导师',sourceIds:['OUTCOME_TEST']}}),
      record('school','SCHOOL_UNLINKED_STUDENT','MPAcc','SCHOOL_UNLINKED_DESTINATION'),
      record('outside','OUTSIDE_ROSTER_STUDENT','MPAcc','OUTSIDE_ROSTER_DESTINATION',{mentorName:'名录外老师',relationship:{text:'原文明示名录外学位导师',sourceIds:['OUTCOME_TEST']}}),
      record('maud','MAUD_STUDENT','MAud','MAUD_DESTINATION'),
      record('academic','ACADEMIC_MASTER_STUDENT','academic_master','ACADEMIC_DESTINATION'),
      record('master-unknown','MASTER_UNSPECIFIED_STUDENT','master_unspecified','MASTER_UNSPECIFIED_DESTINATION'),
      record('undergrad','UNDERGRAD_STUDENT','undergraduate','UNDERGRAD_DESTINATION'),
      record('unknown','UNSPECIFIED_STUDENT','unspecified','UNSPECIFIED_DESTINATION'),
      record('phd','PHD_MPACC_STUDENT','MPAcc','DOCTORAL_DESTINATION',{mentorId:other.id,mentorName:other.name,relationship:{text:'官方明示学位论文导师',sourceIds:['OUTCOME_TEST']},outcome:{type:'phd',organization:'DOCTORAL_DESTINATION',program:'博士研究生',year:2026,statusLabel:'考取博士',asOf:'2026-06-26',sourceIds:['OUTCOME_TEST']}}),
      record('study','FURTHER_STUDY_STUDENT','undergraduate','FURTHER_STUDY_DESTINATION',{outcome:{type:'further_study',organization:'FURTHER_STUDY_DESTINATION',program:'硕士研究生',year:2026,statusLabel:'升学',asOf:'2026-06-26',sourceIds:['OUTCOME_TEST']}})
    ],
    statistics:[{id:'stat-test',title:'POPULATION_STAT_NOT_A_STUDENT',text:'全校统计，不是导师就业率。',sourceIds:['OUTCOME_TEST'],limits:['口径为学校整体。']}],
    achievements:[{id:'award-test',studentName:'THESIS_AWARD_NOT_A_DESTINATION',degree:'MPAcc',mentorId:mentor.id,mentorName:mentor.name,text:'优秀学位论文，不是就业去向。',sourceIds:['OUTCOME_TEST'],limits:['成果记录。']}]
  };
  return data;
}

function firmFixture() {
  const data=outcomeFixture(),[mentor,other]=data.mentors;
  const base=data.studentOutcomes.records[0];
  const record=(id,studentName,organization,extra={},outcome={})=>({
    ...structuredClone(base),id,studentName,personId:id,mentorId:null,mentorName:null,relationship:null,...extra,
    outcome:{...structuredClone(base.outcome),organization,...outcome}
  });
  const linked=(mentor)=>({mentorId:mentor.id,mentorName:mentor.name,relationship:{text:'官方明确硕士学位导师',sourceIds:['OUTCOME_TEST']}});
  const first=record('firm-linked','FIRM_LINKED_STUDENT','普华永道中天会计师事务所',linked(mentor),{stage:'signed',statusLabel:'正式签约'});
  data.studentOutcomes.records=[
    first,
    {...structuredClone(first),id:'firm-linked-later',outcome:{...first.outcome,stage:'employed',statusLabel:'报道时任职',asOf:'2026-10-01'}},
    record('firm-unknown','FIRM_UNKNOWN_STUDENT','安永华明会计师事务所上海分所'),
    record('domestic-linked','DOMESTIC_LINKED_STUDENT','立信会计师事务所江苏分所',linked(other)),
    record('firm-unsupported','FIRM_UNSUPPORTED_MENTOR_STUDENT','致同会计师事务所',{mentorId:mentor.id,mentorName:mentor.name,relationship:null}),
    record('historical','HISTORY_STUDENT','瑞华会计师事务所'),
    record('academic-firm','FIRM_ACADEMIC_STUDENT','毕马威华振会计师事务所',{degree:'academic_master',degreeLabel:'会计学硕'}),
    record('college','SCHOOL_NAME_STUDENT','上海立信会计金融学院'),
    record('internship','FIRM_INTERNSHIP_STUDENT','德勤华永会计师事务所',{}, {stage:'internship',statusLabel:'审计实习'}),
    record('offer','FIRM_OFFER_STUDENT','毕马威华振会计师事务所',{}, {stage:'offer_only',statusLabel:'仅获offer，未确认接受'}),
    record('not-employment','FIRM_STUDY_STUDENT','大华会计师事务所',{}, {type:'further_study',statusLabel:'学习交流'})
  ];
  data.studentOutcomes.mentorCareerStatements=[
    {mentorId:mentor.id,text:'MENTOR_UNNAMED_CAREER_STATEMENT',sourceIds:['OUTCOME_TEST'],date:'2025-05-01',degreeScope:'硕士类型未明'},
    {mentorId:other.id,text:'UNSOURCED_CAREER_STATEMENT',sourceIds:['MISSING_CAREER_SOURCE']},
    {mentorId:'missing-mentor',text:'UNKNOWN_MENTOR_CAREER_STATEMENT',sourceIds:['OUTCOME_TEST']}
  ];
  return data;
}

const firmSummary=html=>html.match(/<section class="firm-outcome-summary"[\s\S]*?<\/section>/)?.[0]||'';
const firmTable=html=>html.match(/<div class="firm-mentor-table">[\s\S]*?<\/div>/)?.[0]||'';
const outcomeArticle=(html,name)=>(html.match(/<article class="outcome-record">[\s\S]*?<\/article>/g)||[]).find(item=>item.includes(`<h4>${name}</h4>`))||'';

test('public destination data keeps degrees, sources and mentor relationships explicit',()=>{
  const hub=dataset.studentOutcomes;
  assert(hub&&Array.isArray(hub.records)&&hub.records.length,'studentOutcomes.records must contain the verified public cases');
  assert(Array.isArray(hub.statistics),'population statistics must be a separate array');
  assert(Array.isArray(hub.achievements),'thesis and competition achievements must be separate from destinations');
  const ids=new Set(),mentors=new Map(dataset.mentors.map(item=>[item.id,item]));
  const requireSources=(values,label)=>{
    assert(Array.isArray(values)&&values.length,`${label}: missing source IDs`);
    for(const id of values)assert(httpSource(dataset.sourceRegistry[id]),`${label}: missing or unsafe registered source ${id}`);
  };
  for(const record of hub.records){
    assert(record.id&&!ids.has(record.id),`duplicate or missing record ID: ${record.id}`);ids.add(record.id);
    assert.equal(typeof record.studentName,'string');assert(record.studentName.trim(),record.id);
    assert(degreeTypes.has(record.degree),`${record.studentName}: unclear degree type`);
    assert.equal(typeof record.degreeLabel,'string');assert(record.degreeLabel.trim(),record.id);
    assert(outcomeTypes.has(record.outcome?.type),`${record.studentName}: awards/internships are not graduation destinations`);
    assert.equal(typeof record.outcome.organization,'string');assert(record.outcome.organization.trim(),record.id);
    assert(record.outcome.statusLabel,`${record.studentName}: retain the stated destination status`);
    assert(Object.hasOwn(record.outcome,'asOf'),`${record.studentName}: represent unknown source dates explicitly`);
    assert(record.outcome.asOf===null||(typeof record.outcome.asOf==='string'&&record.outcome.asOf.trim()),`${record.studentName}: source date must be text or null`);
    assert(Array.isArray(record.limits)&&record.limits.length,`${record.studentName}: retain scope limits`);
    requireSources(record.sourceIds,record.id);
    requireSources(record.outcome.sourceIds,`${record.id} outcome`);
    const destinationScope=[record.outcome.type,record.outcome.statusLabel,record.outcome.program,record.outcome.organization].filter(Boolean).join(' ');
    assert.doesNotMatch(destinationScope,/实习(?:生|岗位|去向|单位)?|internship|intern\b/i,`${record.studentName}: an internship must not be labeled a graduation destination`);
    if(record.mentorId===null){
      if(record.mentorName===null){
        assert.equal(record.relationship,null,`${record.studentName}: school-only case has no asserted mentor relationship`);
      }else{
        assert(!dataset.mentors.some(mentor=>mentor.name===record.mentorName),`${record.studentName}: a roster mentor needs the matching ID`);
        assert(record.relationship?.text,`${record.studentName}: an outside-roster mentor still needs explicit evidence`);
        requireSources(record.relationship.sourceIds,`${record.id} outside-roster relationship`);
      }
    }else{
      const mentor=mentors.get(record.mentorId);
      assert(mentor,`${record.studentName}: unknown mentor ID ${record.mentorId}`);
      assert.equal(record.mentorName,mentor.name,`${record.studentName}: mentor name and ID disagree`);
      assert(record.relationship?.text,`${record.studentName}: mentor needs explicit relationship evidence`);
      requireSources(record.relationship.sourceIds,`${record.id} relationship`);
    }
  }
});

test('known school public cases preserve MPAcc versus academic master and never acquire an unstated mentor',()=>{
  const records=dataset.studentOutcomes?.records||[];
  for(const [name,degree] of [['胡朝会','MPAcc'],['陆欣昀','MPAcc'],['林洛妤','MPAcc'],['蔡云霏','academic_master']]){
    const record=records.find(item=>item.studentName===name);
    assert(record,`retain the verified 2026 school case ${name}`);
    assert.equal(record.degree,degree,name);
    assert.equal(record.mentorId,null,`${name}: destination news does not state the mentor`);
    assert.equal(record.mentorName,null,name);
  }
});

test('outcomes opens with MPAcc only and each other degree remains separately selectable',async()=>{
  const a=await app(outcomeFixture());a.route('#outcomes');
  assert.match(a.get('#app').innerHTML,/id="outcome-search"/);
  for(const id of ['outcome-degree','outcome-relationship','outcome-type','outcome-firm'])assert(a.get('#app').innerHTML.includes(`id="${id}"`),id);
  assert.match(a.html(),/DIRECT_MPACC_STUDENT/);assert.match(a.html(),/SCHOOL_UNLINKED_STUDENT/);
  assert.doesNotMatch(a.html(),/MAUD_STUDENT|ACADEMIC_MASTER_STUDENT|MASTER_UNSPECIFIED_STUDENT|UNDERGRAD_STUDENT|UNSPECIFIED_STUDENT/);
  for(const [degree,name] of [['MAud','MAUD_STUDENT'],['academic_master','ACADEMIC_MASTER_STUDENT'],['master_unspecified','MASTER_UNSPECIFIED_STUDENT'],['undergraduate','UNDERGRAD_STUDENT'],['unspecified','UNSPECIFIED_STUDENT']]){
    a.change('outcome-degree',degree);assert(a.html().includes(name),degree);assert.doesNotMatch(a.html(),/DIRECT_MPACC_STUDENT/,degree);
  }
  a.change('outcome-degree','');
  for(const name of ['DIRECT_MPACC_STUDENT','MAUD_STUDENT','ACADEMIC_MASTER_STUDENT','MASTER_UNSPECIFIED_STUDENT','UNDERGRAD_STUDENT','UNSPECIFIED_STUDENT'])assert(a.html().includes(name),name);
  assert.doesNotMatch(a.html(),/POPULATION_STAT_NOT_A_STUDENT|THESIS_AWARD_NOT_A_DESTINATION/,'aggregate statistics and awards must not enter student results');
  assert.deepEqual(a.errors,[]);
});

test('outcome search and combined filters find student, confirmed mentor and destination without changing degree scope',async()=>{
  const data=outcomeFixture(),a=await app(data);a.route('#outcomes');
  for(const query of ['DIRECT_MPACC_STUDENT',data.mentors[0].name,'DIRECT_DESTINATION']){
    a.input('outcome-search',query);assert.match(a.html(),/DIRECT_MPACC_STUDENT/,query);assert.doesNotMatch(a.html(),/SCHOOL_UNLINKED_STUDENT/,query);
  }
  a.input('outcome-search','ACADEMIC_DESTINATION');assert.doesNotMatch(a.html(),/ACADEMIC_MASTER_STUDENT/,'search must not silently broaden default MPAcc');
  a.change('outcome-degree','academic_master');assert.match(a.html(),/ACADEMIC_MASTER_STUDENT/);
  a.input('outcome-search','');a.change('outcome-degree','MPAcc');a.change('outcome-relationship','school');
  assert.match(a.html(),/SCHOOL_UNLINKED_STUDENT/);assert.doesNotMatch(a.html(),/DIRECT_MPACC_STUDENT|PHD_MPACC_STUDENT|OUTSIDE_ROSTER_STUDENT/);
  a.change('outcome-relationship','linked');assert.match(a.html(),/DIRECT_MPACC_STUDENT/);assert.match(a.html(),/OUTSIDE_ROSTER_STUDENT/);assert.match(a.html(),/名录外老师/);assert.doesNotMatch(a.html(),/SCHOOL_UNLINKED_STUDENT/);
  a.change('outcome-type','phd');assert.match(a.html(),/PHD_MPACC_STUDENT/);assert.doesNotMatch(a.html(),/DIRECT_MPACC_STUDENT/);
  a.change('outcome-type','employment');assert.match(a.html(),/DIRECT_MPACC_STUDENT/);assert.doesNotMatch(a.html(),/PHD_MPACC_STUDENT/);
  a.change('outcome-relationship','');a.change('outcome-degree','undergraduate');a.change('outcome-type','further_study');
  assert.match(a.html(),/FURTHER_STUDY_STUDENT/);assert.doesNotMatch(a.html(),/UNDERGRAD_STUDENT/);
  a.input('outcome-search','NO_MATCH_20261113');assert.doesNotMatch(a.html(),/FURTHER_STUDY_STUDENT/);assert.match(a.html(),/没有|暂无|未找到/);
  a.input('outcome-search','');assert.match(a.html(),/FURTHER_STUDY_STUDENT/);
  a.route('#mentors');a.route('#outcomes');assert.match(a.html(),/FURTHER_STUDY_STUDENT/,'current filters survive same-session navigation');
  assert.deepEqual(a.writes,[],'outcome filters stay in memory');
});

test('school-only or unsupported mentor relationships never leak into mentor cards, detail or comparison',async()=>{
  const data=outcomeFixture(),mentor=data.mentors[0];
  const original=data.studentOutcomes.records.find(item=>item.id==='linked');
  data.studentOutcomes.records.push(
    {...structuredClone(original),id:'missing-relationship',studentName:'NO_RELATIONSHIP_STUDENT',relationship:null},
    {...structuredClone(original),id:'empty-relationship-source',studentName:'NO_RELATIONSHIP_SOURCE_STUDENT',relationship:{text:'没有原文证明',sourceIds:[]}},
    {...structuredClone(original),id:'mismatch-mentor',studentName:'MISMATCHED_MENTOR_STUDENT',mentorName:data.mentors[1].name}
  );
  const a=await app(data);
  const hidden=/SCHOOL_UNLINKED_STUDENT|SCHOOL_UNLINKED_DESTINATION|OUTSIDE_ROSTER_STUDENT|OUTSIDE_ROSTER_DESTINATION|NO_RELATIONSHIP_STUDENT|NO_RELATIONSHIP_SOURCE_STUDENT|MISMATCHED_MENTOR_STUDENT/;
  assert.doesNotMatch(a.get('#mentor-results').innerHTML,hidden);
  a.click('mentor',mentor.id);let html=a.get('#dialog-content').innerHTML;
  assert.match(html,/DIRECT_MPACC_STUDENT/,'explicit mentor-linked destinations should be available in mentor details');assert.doesNotMatch(html,hidden);
  a.click('compare-toggle',mentor.id);a.click('compare-toggle',data.mentors[1].id);a.click('compare-open');html=a.get('#dialog-content').innerHTML;
  assert.match(html,/DIRECT_MPACC_STUDENT/);assert.doesNotMatch(html,hidden);
  a.route('#outcomes');a.change('outcome-degree','academic_master');a.route('#mentors');a.click('mentor',mentor.id);
  assert.match(a.get('#dialog-content').innerHTML,/DIRECT_MPACC_STUDENT/,'overview degree filter must not hide a linked case from mentor details');
});

test('outcomes escape public text, retain safe source links and reject active URL protocols',async()=>{
  const data=outcomeFixture(),record=data.studentOutcomes.records.find(item=>item.id==='school');
  record.studentName='<img src=x onerror=alert(1)>';
  record.outcome.organization='<script>alert(2)</script>';
  record.limits=['范围 <svg onload=alert(3)>'];
  record.sourceIds=['OUTCOME_TEST','OUTCOME_UNSAFE'];record.outcome.sourceIds=['OUTCOME_TEST','OUTCOME_UNSAFE'];
  const a=await app(data);a.route('#outcomes');const html=a.html();
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.match(html,/&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
  assert.doesNotMatch(html,/<script>|<img src=x|<svg onload|href="(?:javascript|data):/);
  assert.match(html,/<a[^>]+href="https:\/\/example.org\/public-destination"[^>]+target="_blank"[^>]+rel="noopener noreferrer"/);
});

test('old or empty data keeps outcomes and mentor views usable without inventing destinations',async()=>{
  for(const variant of [undefined,{records:[],statistics:[],achievements:[]}]){
    const data=outcomeFixture();if(variant===undefined)delete data.studentOutcomes;else data.studentOutcomes=variant;
    const a=await app(data);a.route('#outcomes');
    assert.match(a.get('#app').innerHTML+a.html(),/去向|毕业/);assert.doesNotMatch(a.html(),/DIRECT_MPACC_STUDENT|undefined|null/);
    assert.match(a.html(),/没有|暂无|尚无|未找到/);
    a.route('#mentors');a.click('mentor',data.mentors[0].id);
    assert.match(a.get('#dialog-content').innerHTML,new RegExp(data.mentors[0].name));
    assert.doesNotMatch(a.get('#dialog-content').innerHTML,/DIRECT_MPACC_STUDENT|SCHOOL_UNLINKED_STUDENT/);
    assert.deepEqual(a.errors,[]);
  }
});

test('firm filters compose with the selected degree, mentor relationship and destination type',async()=>{
  const a=await app(firmFixture());a.route('#outcomes');
  assert.match(a.get('#app').innerHTML,/<option value="MPAcc" selected>/,'MPAcc remains the default degree');
  a.change('outcome-firm','target');
  assert.match(a.html(),/FIRM_LINKED_STUDENT|FIRM_UNKNOWN_STUDENT|DOMESTIC_LINKED_STUDENT/);
  assert.doesNotMatch(a.html(),/FIRM_ACADEMIC_STUDENT|HISTORY_STUDENT|SCHOOL_NAME_STUDENT/);
  a.input('outcome-search','FIRM_ACADEMIC_STUDENT');
  assert.doesNotMatch(a.html(),/FIRM_ACADEMIC_STUDENT/,'firm search does not broaden the degree scope');
  a.change('outcome-degree','academic_master');
  assert.match(a.html(),/FIRM_ACADEMIC_STUDENT/);assert.doesNotMatch(a.html(),/FIRM_LINKED_STUDENT/);
  a.input('outcome-search','');a.change('outcome-degree','MPAcc');a.change('outcome-firm','big4');
  a.change('outcome-relationship','linked');
  assert.match(a.html(),/FIRM_LINKED_STUDENT/);assert.doesNotMatch(a.html(),/FIRM_UNKNOWN_STUDENT|DOMESTIC_LINKED_STUDENT/);
  a.change('outcome-relationship','school');
  assert.match(a.html(),/FIRM_UNKNOWN_STUDENT/);assert.doesNotMatch(a.html(),/FIRM_LINKED_STUDENT/);
  a.change('outcome-type','phd');assert.match(a.html(),/暂无匹配/);
  a.change('outcome-type','employment');assert.match(a.html(),/FIRM_UNKNOWN_STUDENT/);
  a.change('outcome-relationship','');a.change('outcome-firm','domestic8');
  assert.match(a.html(),/DOMESTIC_LINKED_STUDENT/);assert.doesNotMatch(a.html(),/FIRM_LINKED_STUDENT|FIRM_UNKNOWN_STUDENT|HISTORY_STUDENT/);
  a.route('#mentors');a.route('#outcomes');
  assert.match(a.html(),/DOMESTIC_LINKED_STUDENT/,'firm scope survives navigation in the same session');
  assert.deepEqual(a.errors,[]);assert.deepEqual(a.writes,[]);
});

test('a similarly named college, internships, offer-only records and nonemployment never become firm employment',async()=>{
  const a=await app(firmFixture());a.route('#outcomes');
  const excluded=['SCHOOL_NAME_STUDENT','FIRM_INTERNSHIP_STUDENT','FIRM_OFFER_STUDENT','FIRM_STUDY_STUDENT'];
  for(const name of excluded){
    const article=outcomeArticle(a.html(),name);
    assert(article,`retain the source record in its original scope: ${name}`);
    assert.doesNotMatch(article,/outcome-firm-badge/,name);
  }
  a.change('outcome-firm','target');
  for(const name of excluded)assert(!a.html().includes(name),name);
  a.change('outcome-firm','domestic8');assert.doesNotMatch(a.html(),/SCHOOL_NAME_STUDENT|FIRM_STUDY_STUDENT/);
  a.change('outcome-firm','big4');assert.doesNotMatch(a.html(),/FIRM_INTERNSHIP_STUDENT|FIRM_OFFER_STUDENT/);
});

test('firm counts deduplicate the same person across time and unknown mentors stay outside named mentor rows',async()=>{
  const data=firmFixture(),a=await app(data);a.route('#outcomes');a.change('outcome-firm','target');
  assert.match(a.get('#outcome-result-count').innerHTML,/找到 <strong>4<\/strong> 人 · 5 条去向记录/);
  const summary=firmSummary(a.html()),table=firmTable(summary);
  for(const [label,count] of [['四大',2],['八大',2],['导师已确认',2],['导师未公开',2]]){
    assert(summary.includes(`${label} <strong>${count}</strong>人`),`${label}: count people, not source snapshots`);
  }
  assert.match(table,/FIRM_LINKED_STUDENT|DOMESTIC_LINKED_STUDENT/);
  assert.equal((table.match(/FIRM_LINKED_STUDENT/g)||[]).length,1,'the same student-firm pair appears once in the compact mentor table');
  assert.doesNotMatch(table,/FIRM_UNKNOWN_STUDENT|FIRM_UNSUPPORTED_MENTOR_STUDENT/);
  for(const name of ['FIRM_UNKNOWN_STUDENT','FIRM_UNSUPPORTED_MENTOR_STUDENT']){
    const article=outcomeArticle(a.html(),name);
    assert.match(article,/class="outcome-mentor-unknown">导师未公开/);
    assert.doesNotMatch(article,/data-action="mentor"/,'an ID or name without relationship evidence cannot attach a mentor');
  }
  a.click('mentor',data.mentors[0].id);
  assert.doesNotMatch(a.get('#dialog-content').innerHTML,/FIRM_UNKNOWN_STUDENT|FIRM_UNSUPPORTED_MENTOR_STUDENT/);
  const legacy=firmFixture();
  for(const record of legacy.studentOutcomes.records)delete record.personId;
  const b=await app(legacy);b.route('#outcomes');b.change('outcome-firm','target');
  assert.match(b.get('#outcome-result-count').innerHTML,/找到 <strong>4<\/strong> 人 · 5 条去向记录/,'older records without personId deduplicate repeated student names');
});

test('the eight named domestic firms remain distinct from historical Ruihua records',async()=>{
  const data=firmFixture(),base=data.studentOutcomes.records[0];
  const names=['立信','天健','致同','容诚','天职国际','信永中和','大华','大信'];
  data.studentOutcomes.records=[...names,'瑞华'].map((name,index)=>({
    ...structuredClone(base),id:`scope-${index}`,personId:`scope-person-${index}`,studentName:`SCOPE_STUDENT_${index}`,mentorId:null,mentorName:null,relationship:null,
    outcome:{...base.outcome,organization:`${name}会计师事务所`,stage:'employed',statusLabel:'正式入职'}
  }));
  const a=await app(data);a.route('#outcomes');
  assert.match(a.get('#app').innerHTML,/瑞华历史去向单列/);
  a.change('outcome-firm','domestic8');
  for(let i=0;i<8;i++)assert(a.html().includes(`SCOPE_STUDENT_${i}`),names[i]);
  assert.doesNotMatch(a.html(),/SCOPE_STUDENT_8|历史事务所 · 瑞华/);
  assert.match(firmSummary(a.html()),/八大 <strong>8<\/strong>人/);
  assert.equal((a.html().match(/outcome-firm-badge domestic8/g)||[]).length,8);
  a.change('outcome-firm','historical_other');
  assert.match(a.html(),/SCOPE_STUDENT_8/);assert.match(a.html(),/outcome-firm-badge historical_other/);
  for(let i=0;i<8;i++)assert(!a.html().includes(`SCOPE_STUDENT_${i}`),names[i]);
  assert.equal(firmSummary(a.html()),'','historical firms do not contribute to the current four/eight summary');
  a.change('outcome-firm','target');assert.doesNotMatch(a.html(),/SCOPE_STUDENT_8/);
});

test('unnamed mentor career statements retain their source and degree limit without adding students',async()=>{
  const data=firmFixture(),a=await app(data);a.route('#outcomes');
  const html=a.get('#app').innerHTML;
  assert.match(html,/导师公开培养去向 · 未具名，不计人数/);
  assert.match(html,/class="mentor-career-statement"/);assert.match(html,/MENTOR_UNNAMED_CAREER_STATEMENT/);
  assert.match(html,/2025-05-01 · 硕士类型未明/);
  assert.match(html,/href="https:\/\/example.org\/public-destination"/);
  assert.doesNotMatch(html,/UNSOURCED_CAREER_STATEMENT|UNKNOWN_MENTOR_CAREER_STATEMENT/);
  assert.doesNotMatch(a.html(),/MENTOR_UNNAMED_CAREER_STATEMENT/);
  a.change('outcome-firm','target');assert.match(a.get('#outcome-result-count').innerHTML,/找到 <strong>4<\/strong> 人/);
});

test('outcome screenshots open and close the independent viewer while unsafe paths have no entry',async()=>{
  const data=firmFixture(),record=data.studentOutcomes.records[0];
  const safe='./evidence/firm-outcomes-20261114/destination-original.png';
  record.screenshots=[{src:safe,caption:'学校毕业去向原文',scope:['具名学生及就业单位'],width:1363,height:936}];
  const badPaths=['../private.png','./evidence/firm-outcomes-20261114/../private.png','javascript:alert(1)','https://example.org/unapproved.png'];
  const bad=badPaths.map((src,index)=>({...structuredClone(record),id:`bad-shot-${index}`,studentName:`UNSAFE_SHOT_STUDENT_${index}`,screenshots:[{src,caption:'不可用路径'}]}));
  data.studentOutcomes.records=[record,...bad];
  const a=await app(data);a.route('#outcomes');
  assert.match(outcomeArticle(a.html(),record.studentName),/data-action="outcome-image" data-id="firm-linked"/);
  for(const item of bad){
    assert.doesNotMatch(outcomeArticle(a.html(),item.studentName),/data-action="outcome-image"|outcome-shot-preview/);
    a.click('outcome-image',item.id);assert.equal(a.get('#review-image-dialog').open,false);
  }
  a.click('outcome-image',record.id);
  assert.equal(a.get('#review-image-dialog').open,true);
  assert.equal(a.get('#detail-dialog').open,false,'the source image does not open a mentor detail dialog');
  assert.equal(a.get('#review-image-title').textContent,`${record.studentName} · 去向原文`);
  assert(a.get('#review-image-content').innerHTML.includes(`src="${safe}"`));
  assert.match(a.get('#review-image-content').innerHTML,/具名学生及就业单位|学校毕业去向原文/);
  a.click('review-image-close');
  assert.equal(a.get('#review-image-dialog').open,false);assert.equal(a.get('#review-image-content').innerHTML,'');
  assert.deepEqual(a.errors,[]);
});

test('person counts keep same-name degrees and cohorts separate while a shared personId joins later snapshots',async()=>{
  const data=firmFixture(),base=structuredClone(data.studentOutcomes.records[0]);
  const record=(id,extra={})=>{
    const item={...structuredClone(base),id,studentName:'SAME_NAME_STUDENT',mentorId:null,mentorName:null,relationship:null,...extra};
    if(!Object.hasOwn(extra,'personId'))delete item.personId;
    return item;
  };
  data.studentOutcomes.records=[
    record('same-2025',{graduationYear:2025}),
    record('same-2025-later',{graduationYear:2025,outcome:{...base.outcome,asOf:'2026-10-01'}}),
    record('same-2026',{graduationYear:2026}),
    record('same-academic',{degree:'academic_master',degreeLabel:'会计学硕',graduationYear:2025}),
    record('same-cohort-2023',{graduationYear:null,cohort:'2023级'}),
    record('same-cohort-2024',{graduationYear:null,cohort:'2024级'}),
    record('known-person-earlier',{personId:'stable-person',graduationYear:2022}),
    record('known-person-later',{personId:'stable-person',studentName:'RENAMED_STUDENT',degree:'MAud',degreeLabel:'审计专硕',graduationYear:2026})
  ];
  const a=await app(data);a.route('#outcomes');a.change('outcome-degree','');a.change('outcome-firm','target');
  assert.match(a.get('#outcome-result-count').innerHTML,/找到 <strong>6<\/strong> 人 · 8 条去向记录/);
  assert.match(firmSummary(a.html()),/四大 <strong>6<\/strong>人/);
});

test('candidate, nonpublic and unsupported relationships do not count as confirmed mentors; legacy explicit evidence still works',async()=>{
  const data=firmFixture(),base=structuredClone(data.studentOutcomes.records[0]);
  const rejected=[
    ['candidate',{relationshipStatus:'candidate'}],
    ['not-public',{relationshipStatus:'not_public'}],
    ['non-public',{relationshipStatus:'non-public'}],
    ['missing-source',{relationshipStatus:'confirmed',relationship:{text:'尚无注册原文',sourceIds:['MISSING_RELATIONSHIP_SOURCE']}}],
    ['unsafe-source',{relationshipStatus:'confirmed',relationship:{text:'非法来源链接',sourceIds:['OUTCOME_UNSAFE']}}]
  ];
  const legacy={...base,id:'legacy-confirmed',personId:'legacy-confirmed',studentName:'LEGACY_CONFIRMED_STUDENT'};
  delete legacy.relationshipStatus;
  data.studentOutcomes.records=[legacy,...rejected.map(([id,extra])=>({...structuredClone(base),id,personId:id,studentName:`REJECTED_${id}`,...extra}))];
  const a=await app(data);a.route('#outcomes');a.change('outcome-firm','target');
  const summary=firmSummary(a.html());
  assert.match(summary,/导师已确认 <strong>1<\/strong>人/);assert.match(summary,/导师未公开 <strong>5<\/strong>人/);
  assert.match(firmTable(summary),/LEGACY_CONFIRMED_STUDENT/);assert.doesNotMatch(firmTable(summary),/REJECTED_/);
  for(const [id] of rejected)assert.match(outcomeArticle(a.html(),`REJECTED_${id}`),/outcome-mentor-unknown/);
  a.change('outcome-relationship','linked');assert.match(a.html(),/LEGACY_CONFIRMED_STUDENT/);assert.doesNotMatch(a.html(),/REJECTED_/);
  a.click('mentor',base.mentorId);assert.doesNotMatch(a.get('#dialog-content').innerHTML,/REJECTED_/);
  assert.deepEqual(a.errors,[]);
});

test('registered year-suffixed source IDs remain clickable instead of becoming descending citation ranges',async()=>{
  const data=outcomeFixture(),code='OUTCOME20261114-2021';
  data.sourceRegistry[code]={title:'专业学位点2021年报',url:'https://example.org/mpacc-2021.pdf'};
  const record=data.studentOutcomes.records.find(item=>item.id==='school');
  record.sourceIds=[code];record.outcome.sourceIds=[code];
  const a=await app(data);a.route('#outcomes');
  assert.match(a.html(),/<a[^>]+href="https:\/\/example.org\/mpacc-2021.pdf"[^>]*>\[OUTCOME20261114-2021\]<\/a>/);
});

test('undergraduate firm aggregates follow the degree filter without changing named student counts',async()=>{
  const data=outcomeFixture();
  data.studentOutcomes.employerSummaries=[{id:'aggregate',degree:'undergraduate',label:'本科历史累计',text:'本科方向累计45人获四大录取',scope:'四年累计，不能并入具名人数。',sourceIds:['OUTCOME_TEST']}];
  const a=await app(data);a.route('#outcomes');
  assert.doesNotMatch(a.get('#outcome-employers').innerHTML,/累计45人/);
  a.change('outcome-degree','undergraduate');
  assert.match(a.get('#outcome-employers').innerHTML,/本科方向累计45人/);
  assert.match(a.get('#outcome-result-count').innerHTML,/找到 <strong>2<\/strong> 人/);
  a.change('outcome-degree','');
  assert.match(a.get('#outcome-employers').innerHTML,/累计45人/);
  assert.match(a.get('#outcome-result-count').innerHTML,/找到 <strong>10<\/strong> 人/);
  a.change('outcome-degree','MPAcc');
  assert.doesNotMatch(a.get('#outcome-employers').innerHTML,/累计45人/);
});

test('thesis co-advisors and competition guidance keep distinct labels outside destinations',async()=>{
  const data=outcomeFixture(),mentor=data.mentors[0];
  const base={degree:'MPAcc',degreeLabel:'会计专硕',mentorId:mentor.id,mentorName:mentor.name,relationshipStatus:'confirmed',relationship:{text:'原文明示具体指导关系',sourceIds:['OUTCOME_TEST']},sourceIds:['OUTCOME_TEST'],limits:[]};
  data.studentOutcomes.achievements=[
    {...structuredClone(base),id:'thesis',studentName:'THESIS_STUDENT',coMentors:['共同指导老师'],relationshipType:'thesis_guidance',achievement:{text:'优秀论文',sourceIds:['OUTCOME_TEST']}},
    {...structuredClone(base),id:'team',studentName:'COMPETITION_TEAM',relationshipType:'competition_guidance',achievement:{text:'团队案例奖',sourceIds:['OUTCOME_TEST']}}
  ];
  const a=await app(data);a.route('#outcomes');
  const html=a.get('#app').innerHTML;
  assert(html.includes('论文导师：'+mentor.name+'、共同指导老师'));
  assert(html.includes('赛事指导：'+mentor.name));
  assert.doesNotMatch(a.html(),/THESIS_STUDENT|COMPETITION_TEAM/);
});
