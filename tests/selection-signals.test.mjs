import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const dataset=JSON.parse(readFileSync(new URL('../dist/data/site-data.json',import.meta.url),'utf8'));
const scriptPath=new URL('../dist/app.js',import.meta.url);

async function boot(data){
  const elements=new Map(),handlers=new Map(),windowHandlers=new Map();
  let document;
  class Element{
    constructor(selector){this.selector=selector;this.innerHTML='';this.textContent='';this.value='';this.dataset={};this.attributes={};this.style={};this.open=false;this.hidden=false;this.isConnected=true;this.classList={add(){},remove(){},contains(){return false;}};}
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
  vm.runInNewContext(readFileSync(scriptPath,'utf8'),{document,window,location,URL,CSS:{escape:x=>x},console,CustomEvent:class{},Event:class{},navigator:{},fetch:async()=>({ok:true,json:async()=>structuredClone(data),headers:{get:()=>null}}),localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame:fn=>fn(),setTimeout:()=>1,clearTimeout(){}});
  for(let i=0;i<12;i++)await Promise.resolve();
  return {get,
    click(action,id,extra={}){handlers.get('click')({target:{closest:selector=>selector==='[data-action]'?{dataset:{action,id,...extra}}:null},preventDefault(){}});},
    detail(id){this.click('mentor',id);return get('#dialog-content').innerHTML;},
    input(value){handlers.get('input')({target:{id:'mentor-search',value,parentElement:{querySelector:()=>get('.search-clear')}}});},
    coverage(value){handlers.get('change')({target:{id:'review-coverage',value}});},
    cards(){return get('#mentor-results').innerHTML;},
    panel(){return get('#mentor-selection-signals').innerHTML;}
  };
}

const emptyDossier=()=>({coverageStatus:'not_found',coverageLabel:'暂无可归属学生评价',summary:'',reviews:[],recommendationPoints:[],concerns:[],verificationQuestions:[],gaps:[]});
const sourceUrl='https://www.xiaohongshu.com/explore/aaaaaaaaaaaaaaaaaaaaaaaa';
function fixture(){
  const data=structuredClone(dataset);
  data.mentorAliases=[];data.ambiguousMentorAliases=[];data.socialPosts=[];
  data.studentOutcomes={records:[],statistics:[],achievements:[]};
  for(const mentor of data.mentors)mentor.studentReviews=emptyDossier();
  data.sourceRegistry.SIGNAL={title:'原帖选导评论',url:sourceUrl,canonicalUrl:sourceUrl,platform:'小红书'};
  data.sourceRegistry.UNSAFE_SIGNAL={title:'不安全来源',url:'javascript:alert(1)'};
  return data;
}
function setReview(data,name,options={}){
  const mentor=data.mentors.find(m=>m.name===name);
  const review={id:'signal-'+mentor.id,text:'ORIGINAL_REVIEW_BODY',narrator:'原帖评论者',date:'2025-04-02',degree:'未说明',relationship:'未说明',experienceType:'general',firsthand:null,polarity:'neutral',sourceIds:['SIGNAL'],sourceUrl,attribution:{status:'confirmed',reason:'原帖明确对应姓名'},contextAssessment:{eligibleForRecommendation:false,eligibleForConcern:false},...options};
  mentor.studentReviews={...emptyDossier(),coverageStatus:'weak_mentions',coverageLabel:'仅提名或身份未明',reviews:[review]};
  return {mentor,review};
}
const signal=(direction,text,kind='visible_quote')=>({direction,intensity:'strong',excerpt:{kind,text},sourceIds:['SIGNAL'],scope:'仅记录明确选择态度，理由及接触关系未说明。'});
function card(html,name){
  return (html.match(/<article class="mentor-card[^"]*">[\s\S]*?<\/article>/g)||[]).find(value=>value.includes(`<h3 class="mentor-name">${name}`))||'';
}
const namesInCards=html=>[...html.matchAll(/<h3 class="mentor-name">([^<]+)/g)].map(match=>match[1]);

test('an explicit abbreviated warning takes the lead over a positive project while preserving both records',async()=>{
  const data=fixture();
  const {mentor,review}=setReview(data,'叶邦银',{polarity:'negative',attribution:{status:'confirmed',alias:'YBY',reason:'YBY在该帖对应叶邦银'},selectionSignal:signal('avoid','AVOID_VISIBLE_EXCERPT 千万不要选YBY')});
  mentor.studentReviews.reviews.unshift({id:'positive-project',text:'POSITIVE_PROJECT_FACT：本科团队项目方向把关。',narrator:'具名本科学生',degree:'本科',firsthand:true,experienceType:'guidance',polarity:'positive',sourceIds:['SIGNAL'],sourceUrl,attribution:{status:'confirmed'}});
  const a=await boot(data),row=card(a.cards(),mentor.name);
  assert(row,'the teacher remains visible in the useful default');
  assert.match(row,/selection-signal-badge/);
  assert.match(row,/强烈劝退|强烈不建议/);
  assert.match(row,/AVOID_VISIBLE_EXCERPT/);
  if(row.includes('POSITIVE_PROJECT_FACT'))assert(row.indexOf('AVOID_VISIBLE_EXCERPT')<row.indexOf('POSITIVE_PROJECT_FACT'),'an unrelated positive project must not bury an explicit warning');
  const panel=a.panel();assert.match(panel,/叶邦银/);assert.match(panel,/YBY/);assert.match(panel,/AVOID_VISIBLE_EXCERPT/);
  assert.match(panel,/https:\/\/www\.xiaohongshu\.com\/explore\/aaaaaaaaaaaaaaaaaaaaaaaa/);
  const detail=a.detail(mentor.id);
  assert(detail.includes('AVOID_VISIBLE_EXCERPT')&&detail.includes('POSITIVE_PROJECT_FACT'));
  assert(detail.indexOf('AVOID_VISIBLE_EXCERPT')<detail.indexOf('POSITIVE_PROJECT_FACT'),'the full dossier also leads with the high-priority comment');
  assert.equal(review.firsthand,null);assert.equal(review.contextAssessment.eligibleForConcern,false);
});

test('a strong recommendation summary is prominent without becoming a quotation or firsthand guidance',async()=>{
  const data=fixture();
  const {mentor}=setReview(data,'李仲泽',{firsthand:false,polarity:'positive',selectionSignal:signal('recommend','STRONG_RECOMMENDATION_SUMMARY','recorded_summary')});
  const a=await boot(data),row=card(a.cards(),mentor.name);
  assert(row,'a teacher with an explicit strong attitude is included without a concrete-experience preview');
  assert.match(row,/强烈推荐/);assert.match(row,/已存摘要|评论摘要/);assert.match(row,/STRONG_RECOMMENDATION_SUMMARY/);
  const rendered=a.panel()+a.detail(mentor.id);
  for(const match of rendered.matchAll(/<(blockquote|q)\b[^>]*>([\s\S]*?)<\/\1>/g))assert(!match[2].includes('STRONG_RECOMMENDATION_SUMMARY'),'stored summaries must not become direct quotes');
  assert.doesNotMatch(rendered,/MPAcc指导亲历|明确MPAcc指导经历/);
  assert.match(rendered,/转述|亲历.*未|接触关系.*未|未说明/);
});

test('unmarked polarity, unresolved attribution and unsafe sources do not create priority signals',async()=>{
  const data=fixture();
  setReview(data,'董必荣',{polarity:'negative',text:'KEYWORD_ONLY 千万不要选，push，强烈推荐。'});
  setReview(data,'张力',{attribution:{status:'unresolved'},selectionSignal:signal('avoid','UNRESOLVED_SIGNAL')});
  setReview(data,'王烨',{sourceIds:['UNSAFE_SIGNAL'],sourceUrl:'javascript:alert(1)',selectionSignal:{...signal('recommend','UNSAFE_SOURCE_SIGNAL'),sourceIds:['UNSAFE_SIGNAL']}});
  const a=await boot(data);
  assert.doesNotMatch(a.panel(),/KEYWORD_ONLY|UNRESOLVED_SIGNAL|UNSAFE_SOURCE_SIGNAL/);
  a.click('mentor-scope','all');
  for(const name of ['董必荣','张力','王烨'])assert.doesNotMatch(card(a.cards(),name),/selection-signal-badge/);
});

test('priority visibility respects search, coverage filters and the roster order of teacher rows',async()=>{
  const data=fixture();
  const avoid=setReview(data,'叶邦银',{selectionSignal:signal('avoid','VALID_AVOID_SIGNAL')});
  const recommend=setReview(data,'李仲泽',{selectionSignal:signal('recommend','VALID_RECOMMEND_SIGNAL','recorded_summary')});
  const a=await boot(data);
  const wanted=new Set([avoid.mentor.name,recommend.mentor.name]);
  assert.deepEqual(namesInCards(a.cards()),data.mentors.map(m=>m.name).filter(name=>wanted.has(name)));
  a.input('李仲泽');assert.deepEqual(namesInCards(a.cards()),['李仲泽']);
  a.input('');a.coverage('not_found');assert(!namesInCards(a.cards()).some(name=>wanted.has(name)));
  a.coverage('');a.click('mentor-scope','all');assert.deepEqual(namesInCards(a.cards()),data.mentors.map(m=>m.name));
});

test('curated signal excerpts and scope text are escaped before prominent rendering',async()=>{
  const data=fixture();
  const {mentor}=setReview(data,'叶邦银',{selectionSignal:{...signal('avoid','<img src=x onerror=alert(2)> SIGNAL_ATTACK'),scope:'<script>SCOPE_ATTACK</script>'}});
  const a=await boot(data),html=a.panel()+card(a.cards(),mentor.name)+a.detail(mentor.id);
  assert.match(html,/&lt;img src=x onerror=alert\(2\)&gt; SIGNAL_ATTACK/);
  assert.match(html,/&lt;script&gt;SCOPE_ATTACK/);
  assert.doesNotMatch(html,/<img src=x|<script>SCOPE_ATTACK|href="javascript:/);
});
