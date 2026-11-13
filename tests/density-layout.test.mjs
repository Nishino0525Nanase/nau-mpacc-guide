import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const dataset=JSON.parse(readFileSync(new URL('../dist/data/site-data.json',import.meta.url),'utf8'));

async function boot(data) {
  const elements=new Map(),handlers=new Map(),windowHandlers=new Map(),writes=[];
  let document;
  class Element {
    constructor(selector){this.selector=selector;this.innerHTML='';this.textContent='';this.value='';this.dataset={};this.attributes={};this.style={};this.open=false;this.isConnected=true;this.classList={add(){},remove(){},contains(){return false;}};}
    querySelector(selector){return get(selector);}
    querySelectorAll(){return [];}
    addEventListener(name,fn){handlers.set(this.selector+':'+name,fn);}
    setAttribute(name,value){this.attributes[name]=value;}
    removeAttribute(name){delete this.attributes[name];}
    getBoundingClientRect(){return {height:70,left:0,right:900,top:0,bottom:700};}
    focus(){document.activeElement=this;}
    scrollIntoView(){}
    showModal(){this.open=true;}
    close(){this.open=false;}
  }
  const get=selector=>{if(!elements.has(selector))elements.set(selector,new Element(selector));return elements.get(selector);};
  document={querySelector:get,querySelectorAll:()=>[],documentElement:{style:{setProperty(){}}},body:{style:{}},activeElement:get('start'),addEventListener:(name,fn)=>handlers.set(name,fn)};
  const location={href:'https://example.github.io/nau-mpacc-guide/',hash:''};
  const window={location,matchMedia:()=>({matches:false}),addEventListener:(name,fn)=>windowHandlers.set(name,fn),dispatchEvent(){},scrollY:0,scrollTo(){}};
  vm.runInNewContext(script,{document,window,location,URL,CSS:{escape:x=>x},console,CustomEvent:class{},Event:class{},navigator:{},fetch:async()=>({ok:true,json:async()=>structuredClone(data),headers:{get:()=>null}}),localStorage:{getItem:()=>null,setItem:(key,value)=>writes.push([key,value])},requestAnimationFrame:fn=>fn(),setTimeout:()=>1,clearTimeout(){}});
  for(let i=0;i<12;i++)await Promise.resolve();
  return {get,writes,
    click(action,id){const target=new Element('action');target.dataset={action,id};handlers.get('click')({target:{closest:selector=>selector==='[data-action]'?target:null}});},
    change(id,value){handlers.get('change')({target:{id,value}});},
    input(id,value){handlers.get('input')({target:{id,value,parentElement:{querySelector:()=>get('.search-clear')}}});},
    route(hash){location.hash=hash;windowHandlers.get('hashchange')();},
    cards(){return get('#mentor-results').innerHTML;}
  };
}

function fixture() {
  const data=structuredClone(dataset);
  for(const mentor of data.mentors) mentor.studentReviews={coverageStatus:'not_found',coverageLabel:'暂无可归属学生评价',summary:'',reviews:[],recommendationPoints:[],concerns:[],verificationQuestions:[],gaps:[]};
  data.sourceRegistry.DENSITY_REVIEW={title:'可核对的学生原文',url:'https://example.org/student-original',date:'2025-05-01'};
  data.sourceRegistry.DENSITY_OUTCOME={title:'可核对的毕业去向',url:'https://example.org/destination-original',date:'2026-06-26'};
  const missing=data.mentors[0],course=data.mentors[1],direct=data.mentors[2],secondhand=data.mentors[3];
  missing.studentReviews.reviews=[{id:'uncertain',attribution:{status:'unresolved'},text:'UNRESOLVED_PREVIEW_CLAIM',firsthand:true,experienceType:'guidance'}];
  missing.studentReviews.recommendationPoints=[{text:'UNSUPPORTED_PREVIEW_PRAISE',reviewIds:['uncertain']}];
  course.studentReviews={...course.studentReviews,coverageStatus:'course_only',coverageLabel:'本科课程经历',reviews:[{
    id:'mixed-course',attribution:{status:'confirmed',reason:'原文明确全名'},firsthand:true,experienceType:'course',degree:'本科',year:'2024级',relationship:'本科课程与朋友转述混合',sourceIds:['DENSITY_REVIEW'],sourceUrl:'https://example.org/student-original',text:'MIXED_PREVIEW_HEARSAY：本人上课，朋友还说导师保证好工作。',hearsayParts:['朋友的论文与就业经历属于转述'],contextAssessment:{eligibleForRecommendation:true,eligibleForConcern:true}
  },{
    id:'course',attribution:{status:'confirmed',reason:'原文明确全名'},firsthand:true,experienceType:'course',degree:'本科',year:'2024级',relationship:'仅本科课程接触',sourceIds:['DENSITY_REVIEW'],sourceUrl:'https://example.org/student-original',text:'COURSE_CONCRETE_EXPERIENCE：逐题讲解。 <script>bad()</script>',contextAssessment:{eligibleForRecommendation:true,eligibleForConcern:true}
  }]};
  direct.studentReviews={...direct.studentReviews,coverageStatus:'mpacc_guidance',coverageLabel:'MPAcc指导亲历',reviews:[
    {id:'less-relevant-course',attribution:{status:'confirmed'},firsthand:true,experienceType:'course',degree:'本科',sourceIds:['DENSITY_REVIEW'],text:'LESS_RELEVANT_COURSE'},
    {id:'direct',attribution:{status:'confirmed'},firsthand:true,experienceType:'guidance',degree:'MPAcc',year:'2023级',relationship:'学位论文导师',sourceIds:['DENSITY_REVIEW'],sourceUrl:'https://example.org/student-original',text:'DIRECT_CONCRETE_EXPERIENCE：逐轮修改研究设计。',contextAssessment:{eligibleForRecommendation:true,eligibleForConcern:true}}
  ]};
  secondhand.studentReviews={...secondhand.studentReviews,coverageStatus:'course_only',reviews:[
    {id:'secondhand',attribution:{status:'confirmed'},firsthand:false,experienceType:'guidance',text:'SECONDHAND_PREVIEW_CLAIM',sourceIds:['DENSITY_REVIEW']},
    {id:'general',attribution:{status:'confirmed'},firsthand:null,experienceType:'general',text:'GENERAL_PREVIEW_ENDORSEMENT',sourceIds:['DENSITY_REVIEW'],contextAssessment:{eligibleForRecommendation:false,eligibleForConcern:false}}
  ]};
  const outcome=(id,studentName,mentorId,mentorName,organization)=>({id,studentName,mentorId,mentorName,degree:'MPAcc',degreeLabel:'MPAcc',graduationYear:2026,relationship:mentorId?{text:'明确学位导师',sourceIds:['DENSITY_OUTCOME']}:null,sourceIds:['DENSITY_OUTCOME'],limits:['具名历史个案'],outcome:{type:'employment',organization,program:null,year:2026,statusLabel:'学校公开的毕业去向',asOf:'2026-06-26',sourceIds:['DENSITY_OUTCOME']}});
  data.studentOutcomes={records:[outcome('linked','DIRECT_DESTINATION_STUDENT',direct.id,direct.name,'VERIFIED_DIRECT_EMPLOYER'),outcome('school-only','SCHOOL_ONLY_STUDENT',null,null,'UNLINKED_EMPLOYER')],statistics:[],achievements:[]};
  return data;
}

function card(html,name) {
  const cards=html.match(/<article class="mentor-card[^"]*">[\s\S]*?<\/article>/g)||[];
  const found=cards.find(value=>value.includes(`<h3 class="mentor-name">${name}`));
  assert(found,`missing mentor card for ${name}`);
  return found;
}

test('compact mentor rows do not turn unresolved, general or secondhand claims into concrete previews',async()=>{
  const data=fixture(),a=await boot(data);a.click('mentor-scope','all');const html=a.cards();
  for(const marker of ['UNRESOLVED_PREVIEW_CLAIM','UNSUPPORTED_PREVIEW_PRAISE','SECONDHAND_PREVIEW_CLAIM','GENERAL_PREVIEW_ENDORSEMENT'])assert(!html.includes(marker),marker);
  const missing=card(html,data.mentors[0].name);
  assert.match(missing,/record-empty/,'an empty fact stays a compact empty cell');
  assert.doesNotMatch(missing,/未核到公开毕业去向|暂无可归属学生评价|现有个人体验材料不足/,'directory rows should not repeat long missing-information prose');
  assert.doesNotMatch(missing,/VERIFIED_DIRECT_EMPLOYER|UNLINKED_EMPLOYER/);
});

test('course previews keep degree and source while mixed hearsay stays in the full dossier',async()=>{
  const data=fixture(),a=await boot(data),html=card(a.cards(),data.mentors[1].name);
  assert.match(html,/COURSE_CONCRETE_EXPERIENCE/);
  assert.match(html,/本科.*课程|课程.*本科/);
  assert.match(html,/href="https:\/\/example.org\/student-original"/);
  assert.doesNotMatch(html,/MPAcc指导亲历|<script>|MIXED_PREVIEW_HEARSAY/);
  a.click('mentor',data.mentors[1].id);
  assert.match(a.get('#dialog-content').innerHTML,/MIXED_PREVIEW_HEARSAY/,'folding short previews must not erase original context');
  assert.match(a.get('#dialog-content').innerHTML,/朋友的论文与就业经历属于转述/);
});

test('direct MPAcc experience and evidenced destination are visible together without school-only attribution',async()=>{
  const data=fixture(),a=await boot(data),html=card(a.cards(),data.mentors[2].name);
  assert.match(html,/DIRECT_CONCRETE_EXPERIENCE/);
  assert.match(html,/MPAcc/);
  assert.doesNotMatch(html,/LESS_RELEVANT_COURSE/,'the strongest directly relevant experience gets the short preview');
  assert.match(html,/VERIFIED_DIRECT_EMPLOYER/);
  assert.doesNotMatch(html,/UNLINKED_EMPLOYER/);
  assert.match(html,/href="https:\/\/example.org\/student-original"/);
  a.click('mentor',data.mentors[2].id);
  const detail=a.get('#dialog-content').innerHTML;
  assert.match(detail,/LESS_RELEVANT_COURSE/,'the full dossier preserves material omitted from the short row');
  assert.match(detail,/DIRECT_DESTINATION_STUDENT/);
});

test('compact rows keep save, review filtering and comparison across life navigation',async()=>{
  const data=fixture(),a=await boot(data),course=data.mentors[1],direct=data.mentors[2];
  a.click('save',direct.id);a.click('saved-only');
  assert.match(a.cards(),new RegExp(direct.name));assert(!a.cards().includes(course.name));
  a.click('saved-only');a.click('compare-toggle',course.id);a.click('compare-toggle',direct.id);
  a.change('review-coverage','mpacc_guidance');
  assert.match(a.cards(),new RegExp(direct.name));assert(!a.cards().includes(course.name));
  a.route('#life/life-03');a.route('#mentors');a.click('compare-open');
  const detail=a.get('#dialog-content').innerHTML;
  assert(detail.includes(course.name)&&detail.includes(direct.name));
  assert.match(detail,/DIRECT_CONCRETE_EXPERIENCE/);assert.match(detail,/本科/);
  assert(a.writes.some(([,value])=>Object.hasOwn(JSON.parse(value),direct.id)),'explicit saves remain persistent');
});

test('the useful default hides empty rows while the full roster, search, saved list and explicit coverage can still reach them',async()=>{
  const data=fixture(),a=await boot(data),missing=data.mentors[0];
  const count=()=>[...a.cards().matchAll(/<article class="mentor-card[^"]*">/g)].length;
  assert.equal(count(),2,'only concrete course experience and a documented destination occupy the initial list');
  assert(!a.cards().includes(missing.name));
  a.click('mentor-scope','all');
  assert.equal(count(),data.mentors.length);
  const orderedNames=[...a.cards().matchAll(/<h3 class="mentor-name">([^<]+)/g)].map(match=>match[1]);
  assert.deepEqual(orderedNames,data.mentors.map(mentor=>mentor.name),'the switch must preserve roster order rather than rank teachers');
  a.click('mentor-scope','useful');assert.equal(count(),2);
  a.input('mentor-search',missing.name);assert.equal(count(),1);assert(a.cards().includes(missing.name));
  a.input('mentor-search','');assert.equal(count(),2);
  a.click('save',missing.id);a.click('saved-only');assert.equal(count(),1);assert(a.cards().includes(missing.name));
  a.click('saved-only');assert.equal(count(),2);
  a.change('review-coverage','not_found');assert(a.cards().includes(missing.name));
  assert(!a.cards().includes(data.mentors[2].name),'explicit evidence filtering still respects its own scope');
});

test('negative or unverified MPAcc mentions neither label nor outrank an explicitly identified MPAcc student',async()=>{
  const cases=[
    ['会计学硕士（原文，未确认MPAcc）','硕士'],
    ['本科（CPA班项目经历；不当成MPAcc）','本科'],
    ['未独立核验；处于MPAcc选课帖场景','阶段未明']
  ];
  for(const [degree,label] of cases){
    const data=fixture(),mentor=data.mentors[5];
    const ambiguous={id:'ambiguous-degree',firsthand:true,experienceType:'guidance',degree,attribution:{status:'confirmed'},sourceIds:['DENSITY_REVIEW'],text:'AMBIGUOUS_DEGREE_EXPERIENCE：讨论过一次研究方法。',contextAssessment:{eligibleForRecommendation:true,eligibleForConcern:true}};
    mentor.studentReviews={...mentor.studentReviews,coverageStatus:'guidance_unspecified',reviews:[ambiguous]};
    const a=await boot(data),html=card(a.cards(),mentor.name);
    const scope=html.match(/<span class="mentor-review-scope">([\s\S]*?)<\/span>/)?.[1];
    assert(scope,degree);assert(scope.includes(label),degree);assert(!scope.includes('MPAcc'),degree);
    mentor.studentReviews.reviews.push({...ambiguous,id:'explicit-mpacc',degree:'MPAcc',text:'EXPLICIT_MPACC_EXPERIENCE：逐轮核对论文证据。'});
    const b=await boot(data),preferred=card(b.cards(),mentor.name);
    assert.match(preferred,/EXPLICIT_MPACC_EXPERIENCE/,degree);
    assert.doesNotMatch(preferred,/AMBIGUOUS_DEGREE_EXPERIENCE/,degree);
  }
});
