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
  const click=(action,id,extra={})=>handlers.get('click')({target:{closest:selector=>selector==='[data-action]'?{dataset:{action,id,...extra},setAttribute(){}}:null}});
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
  for(const id of ['outcome-degree','outcome-relationship','outcome-type'])assert(a.get('#app').innerHTML.includes(`id="${id}"`),id);
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
