import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const dataset=JSON.parse(readFileSync(new URL('../dist/data/site-data.json',import.meta.url),'utf8'));

test('published aliases cover the roster while general comments remain separate from firsthand evidence',()=>{
  const byId=new Map(dataset.mentors.map(mentor=>[mentor.id,mentor]));
  const covered=new Set();
  for(const entry of dataset.mentorAliases){
    for(const id of entry.mentorIds){assert(byId.has(id));covered.add(id);}
    for(const code of entry.sourceIds)assert(dataset.sourceRegistry[code]);
    if(entry.status==='matched')assert.equal(entry.mentorIds.length,1);
    for(const id of entry.reviewIds){
      const records=entry.mentorIds.flatMap(mid=>byId.get(mid).studentReviews.reviews);
      const record=records.find(review=>review.id===id);assert(record);
      assert.equal(record.firsthand,null);assert.equal(record.experienceType,'general');
      assert.equal(record.contextAssessment.eligibleForRecommendation,false);
      assert.equal(record.contextAssessment.eligibleForConcern,false);
    }
  }
  assert.equal(covered.size,byId.size);
  assert.deepEqual(dataset.mentorAliases.find(x=>x.alias==='DBR').mentorIds,['mentor-01']);
  assert.deepEqual(dataset.mentorAliases.find(x=>x.alias==='LH').mentorIds,['mentor-18','mentor-22','mentor-32']);
  assert.deepEqual(dataset.mentorAliases.find(x=>x.alias==='WY').mentorIds,['mentor-03','mentor-31']);
});

async function boot(data) {
  const elements=new Map(),handlers=new Map();
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
  const window={location,matchMedia:()=>({matches:false}),addEventListener(){},dispatchEvent(){},scrollY:0,scrollTo(){}};
  vm.runInNewContext(script,{document,window,location,URL,CSS:{escape:x=>x},console,CustomEvent:class{},Event:class{},navigator:{},fetch:async()=>({ok:true,json:async()=>structuredClone(data),headers:{get:()=>null}}),localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame:fn=>fn(),setTimeout:()=>1,clearTimeout(){}});
  for(let i=0;i<12;i++)await Promise.resolve();
  return {get,
    click(action,id){const target=new Element('action');target.dataset={action,id};handlers.get('click')({target:{closest:selector=>selector==='[data-action]'?target:null}});},
    search(value){handlers.get('input')({target:{id:'mentor-search',value,parentElement:{querySelector:()=>get('.search-clear')}}});},
    names(){return [...get('#mentor-results').innerHTML.matchAll(/<h3 class="mentor-name">([^<]+)/g)].map(match=>match[1]);}
  };
}

function fixture() {
  const data=structuredClone(dataset);
  for(const mentor of data.mentors) mentor.studentReviews={coverageStatus:'not_found',coverageLabel:'暂无可归属学生评价',summary:'',reviews:[],recommendationPoints:[],concerns:[],verificationQuestions:[],gaps:[]};
  data.studentOutcomes={records:[],statistics:[],achievements:[]};
  data.sourceRegistry.ALIAS_GOOD={title:'对应原帖',url:'https://example.org/mentor-thread'};
  data.sourceRegistry.ALIAS_BAD={title:'无效链接',url:'javascript:alert(1)'};
  data.mentorAliases=[
    {alias:'DBR',variants:['d b r'],mentorIds:['mentor-01'],status:'matched',basis:'南审导师语境与姓名缩写对应',sourceIds:['ALIAS_GOOD'],reviewIds:['alias-nomination']},
    {alias:'LH',variants:['lh'],mentorIds:['mentor-18','mentor-22','mentor-32'],status:'ambiguous',basis:'同缩写对应多位老师，需要结合原对话',sourceIds:['ALIAS_GOOD'],reviewIds:[]},
    {alias:'SWT',variants:[],mentorIds:['mentor-34'],status:'search_only',basis:'SEARCH_ONLY_NOT_OBSERVED',sourceIds:[],reviewIds:[]}
  ];
  data.mentors[0].studentReviews={...data.mentors[0].studentReviews,coverageStatus:'weak_mentions',coverageLabel:'仅原帖提名',reviews:[{
    id:'alias-nomination',text:'ONLY_ALIAS_NOMINATION',narrator:'评论者',degree:'未说明',relationship:'未说明',firsthand:null,experienceType:'general',sourceIds:['ALIAS_GOOD'],sourceUrl:'https://example.org/mentor-thread',attribution:{status:'confirmed',alias:'DBR',reason:'用户确认该语境DBR对应董必荣'},contextAssessment:{eligibleForRecommendation:false,eligibleForConcern:false}
  }]};
  for(const [id,marker] of [['mentor-18','LI_HUA_OWN_EXPERIENCE'],['mentor-22','LING_HUA_OWN_EXPERIENCE'],['mentor-32','LI_HUI_OWN_EXPERIENCE']]) {
    const mentor=data.mentors.find(item=>item.id===id);
    mentor.studentReviews={...mentor.studentReviews,coverageStatus:'course_only',reviews:[{id:marker,text:marker,narrator:'课程学生',degree:'本科',relationship:'课程接触',firsthand:true,experienceType:'course',sourceIds:['ALIAS_GOOD'],sourceUrl:'https://example.org/mentor-thread',attribution:{status:'confirmed',reason:'各自原文明确姓名'}}]};
  }
  return data;
}

test('spaced and case-insensitive abbreviations find the named mentor across the useful default',async()=>{
  const data=fixture(),a=await boot(data);
  assert(!a.names().includes('董必荣'),'a nomination alone is not promoted into a concrete-experience row');
  for(const alias of ['DBR','dbr','d b r','D B R']) {
    a.search(alias);assert.deepEqual(a.names(),['董必荣'],alias);
  }
  a.click('mentor','mentor-01');
  assert.match(a.get('#dialog-content').innerHTML,/DBR/);
  assert.match(a.get('#dialog-content').innerHTML,/https:\/\/example.org\/mentor-thread/);
});

test('an ambiguous abbreviation exposes every candidate and keeps their student accounts separate',async()=>{
  const data=fixture();
  data.mentorAliases.push(
    {alias:'WY',mentorIds:['mentor-03','mentor-31'],status:'ambiguous',sourceIds:[]},
    {alias:'WYY',mentorIds:['mentor-27'],status:'search_only',sourceIds:[]},
    {alias:'WYQ',mentorIds:['mentor-29'],status:'search_only',sourceIds:[]}
  );
  const a=await boot(data);a.search('WY');
  assert.deepEqual(a.names(),['王烨','王禹'],'an exact WY lookup must not include WYY or WYQ');
  a.search('lh');
  assert.deepEqual(a.names(),['李华','凌华','李慧']);
  const page=a.get('#app').innerHTML+a.get('#mentor-results').innerHTML;
  assert.match(page,/候选|歧义|多位|待核对/);
  a.click('mentor','mentor-18');
  const detail=a.get('#dialog-content').innerHTML;
  assert.match(detail,/LH/);
  assert.match(detail,/LI_HUA_OWN_EXPERIENCE/);
  assert.doesNotMatch(detail,/LING_HUA_OWN_EXPERIENCE|LI_HUI_OWN_EXPERIENCE/);
});

test('matching a name does not upgrade a nomination to firsthand MPAcc guidance',async()=>{
  const a=await boot(fixture());a.search('DBR');a.click('mentor','mentor-01');
  const detail=a.get('#dialog-content').innerHTML;
  assert.match(detail,/ONLY_ALIAS_NOMINATION/);
  assert.match(detail,/亲历情况未明确|亲历.*未明确/);
  assert.doesNotMatch(detail,/MPAcc指导亲历|被推荐的具体理由|避雷与适配提醒/);
});

test('search-only leads stay out of observed mappings and alias content is escaped with safe links',async()=>{
  const data=fixture();
  data.mentorAliases[0].basis='对应依据 <img src=x onerror=alert(1)>';
  data.mentorAliases[0].sourceIds.push('ALIAS_BAD');
  const a=await boot(data),page=a.get('#app').innerHTML;
  assert.doesNotMatch(page,/SEARCH_ONLY_NOT_OBSERVED|javascript:|<img src=x/);
  a.search('DBR');a.click('mentor','mentor-01');
  const detail=a.get('#dialog-content').innerHTML;
  assert.doesNotMatch(detail,/javascript:|<img src=x/);
  const legacy=fixture();delete legacy.mentorAliases;
  const b=await boot(legacy);b.search('董必荣');
  assert.deepEqual(b.names(),['董必荣'],'older datasets without the new index still support normal name search');
});

test('an exact matched abbreviation shows its own original nomination without changing the normal concrete preview',async()=>{
  const data=fixture(),mentor=data.mentors.find(item=>item.id==='mentor-14');
  mentor.studentReviews={...mentor.studentReviews,coverageStatus:'non_mpacc_guidance',reviews:[
    {id:'ye-concrete',text:'EXISTING_UNDERGRAD_CONCRETE',narrator:'本科学生',degree:'本科',firsthand:true,experienceType:'guidance',sourceIds:['ALIAS_GOOD'],attribution:{status:'confirmed',reason:'明确具名本科项目经历'}},
    {id:'ye-alias-choice',text:'ALIAS_CHOICE_NO_REASON',narrator:'原帖评论者',degree:'未说明',firsthand:null,experienceType:'general',sourceIds:['ALIAS_GOOD'],attribution:{status:'confirmed',alias:'YBY',reason:'该条指代对应本老师'},contextAssessment:{eligibleForRecommendation:false,eligibleForConcern:false}}
  ]};
  data.mentorAliases.push(
    {alias:'YBY',mentorIds:[mentor.id],status:'matched',sourceIds:['ALIAS_GOOD'],reviewIds:['ye-alias-choice']},
    {alias:'YBX',mentorIds:[mentor.id],status:'search_only',sourceIds:[],reviewIds:['ye-alias-choice']},
    {alias:'YBA',mentorIds:[mentor.id,'mentor-01'],status:'ambiguous',sourceIds:['ALIAS_GOOD'],reviewIds:['ye-alias-choice']}
  );
  const a=await boot(data);
  const rows=()=>a.get('#mentor-results').innerHTML;
  assert.match(rows(),/EXISTING_UNDERGRAD_CONCRETE/);
  assert.doesNotMatch(rows(),/ALIAS_CHOICE_NO_REASON/);
  a.search('YBY');
  assert.deepEqual(a.names(),[mentor.name]);
  assert.match(rows(),/ALIAS_CHOICE_NO_REASON/);
  assert.match(rows(),/原帖提名|选择态度/);
  assert.match(rows(),/未说明经历/);
  assert.match(rows(),/https:\/\/example.org\/mentor-thread/);
  assert.doesNotMatch(rows(),/EXISTING_UNDERGRAD_CONCRETE/,'the requested alias comment takes precedence only for that exact abbreviation');
  a.search(mentor.name);
  assert.match(rows(),/EXISTING_UNDERGRAD_CONCRETE/);
  assert.doesNotMatch(rows(),/ALIAS_CHOICE_NO_REASON/);
  for(const alias of ['YBX','YBA']) {
    a.search(alias);
    assert.match(rows(),/EXISTING_UNDERGRAD_CONCRETE/,alias);
    assert.doesNotMatch(rows(),/ALIAS_CHOICE_NO_REASON/,alias);
  }
});
