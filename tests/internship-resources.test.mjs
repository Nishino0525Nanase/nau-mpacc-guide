import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const dataset=JSON.parse(readFileSync(new URL('../dist/data/site-data.json',import.meta.url),'utf8'));

async function app(data=dataset) {
  const elements=new Map(), handlers=new Map(), winHandlers=new Map(), writes=[];
  let document,fetches=0;
  class Element {
    constructor(selector){this.selector=selector;this.dataset={};this.style={};this.attributes={};this.isConnected=true;this.open=false;this.innerHTML='';this.value='';this.textContent='';this.classList={add(){},remove(){},contains(){return false;}};}
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
  }
  const get=selector=>{if(!elements.has(selector))elements.set(selector,new Element(selector));return elements.get(selector);};
  document={querySelector:get,querySelectorAll:()=>[],documentElement:{style:{setProperty(){}}},body:{style:{}},activeElement:get('start'),title:'',addEventListener:(name,fn)=>handlers.set(name,fn)};
  const location={href:'https://example.github.io/nau-mpacc-guide/',hash:''};
  const window={location,matchMedia:()=>({matches:false}),addEventListener:(name,fn)=>winHandlers.set(name,fn),dispatchEvent(){},scrollTo(){},scrollY:0};
  vm.runInNewContext(script,{document,window,location,navigator:{},URL,console,CSS:{escape:x=>x},CustomEvent:class{constructor(name,options){this.type=name;this.detail=options?.detail;}},Event:class{},fetch:async()=>{fetches++;return {ok:true,json:async()=>structuredClone(data),headers:{get:()=>null}};},localStorage:{getItem:()=>null,setItem:(key,value)=>writes.push([key,value])},requestAnimationFrame:fn=>fn(),setTimeout:()=>1,clearTimeout(){}});
  for(let i=0;i<12;i++)await Promise.resolve();
  return {get,writes,get fetches(){return fetches;},route(hash){location.hash=hash;winHandlers.get('hashchange')();},change(id,value){handlers.get('change')({target:{id,value}});},reset(){handlers.get('click')({target:{closest:selector=>selector==='[data-action]'?{dataset:{action:'reset-internships'}}:null}});}};
}

function fixture() {
  const data=structuredClone(dataset);
  data.sourceRegistry.TEST_INTERN={url:'https://example.org/official-internships',title:'官方招聘原文'};
  data.sourceRegistry.TEST_BAD_INTERN={url:'javascript:alert(1)',title:'不安全来源'};
  const resource=(id,kind,status,cityTags,extra={})=>({id,title:id,kind,status,cityTags,searchCities:[],eligibility:null,attendance:null,duration:null,period:null,applicationWindow:null,deadline:null,postedDate:null,url:'https://example.org/'+id,summary:'原文摘要',requirements:[],steps:[],limits:['以单个岗位原文和确认回复为准。'],sourceIds:['TEST_INTERN'],...extra});
  data.internships={intro:'南京及周边申请资源',scopeNote:'办公室所在地不等于项目工作地点。',firmGroupNote:'分组便于阅读，不作机构排名。',sourceNote:'保留原文边界。',firms:[
    {id:'fixture-four',name:'样例四大',group:'big_four',summary:'机构资料',officeRecords:[{city:'南京',branch:'KDI技术研发和交付中心 <附属类别>',address:'已核对的办公室地址',sourceIds:['TEST_INTERN']}],entryLinks:[{label:'官方入口',url:'https://example.org/careers'}],resources:[
      resource('open-nanjing','internship_program','program_open',['南京'],{eligibility:'在校研究生',duration:'通常2–4个月',period:'2026年冬季',applicationWindow:'2026年秋季'}),
      resource('closed-shanghai','historical','closed',['上海'],{deadline:'2026-10-16'}),
      resource('national-channel','channel','entry_only',[],{searchCities:['南京'],summary:'全国招聘入口，具体城市待检索'})
    ],questions:['项目是否需要客户现场或出差？'],prep:[]},
    {id:'fixture-domestic',name:'样例国内所',group:'domestic',summary:'机构资料',officeRecords:[],entryLinks:[],resources:[
      resource('announced-nanjing','internship_program','program_announced',['南京','苏州']),
      resource('formal-graduate','graduate_recruitment','program_open',['南京']),
      resource('preparation-club','preparation_program','program_open',['南京']),
      resource('unread-listing','job_listing','listing_seen',['南京'],{title:'名单 <img src=x onerror=alert(2)>',url:'javascript:alert(3)',sourceIds:['TEST_INTERN','TEST_BAD_INTERN'],requirements:['要求 <script>alert(4)</script>'],duration:['依据原文','没有承诺最短周期']})
    ],questions:[],prep:[]}
  ],commuteZones:[{id:'zone',title:'南京片区',summary:'先确认客户现场。',route:'原文支持的换乘方向',planningNotes:['自行实测通勤。'],sourceIds:['TEST_INTERN'],limits:['不承诺固定分钟数。'],exactMinutes:null}],campusChannels:[{id:'school',title:'校内实践确认',summary:'确认本级规则。',url:'https://example.org/school',sourceIds:['TEST_INTERN'],limits:['历史手册不直接当作本级规则。']}],applicationPlan:[{title:'整理可出勤时间',text:'准备建议',items:['列出考试、课程与论文节点。'],sourceIds:[],origin:'editorial'}],expansionInstitutions:[{name:'本地实践基地',summary:'仅供进一步了解',url:'https://example.org/base',sourceIds:['TEST_INTERN'],limits:['不是当前名额保证。']}]};
  return data;
}

test('internship filters use published project cities and keep channels and formal recruitment distinct',async()=>{
  const a=await app(fixture());
  a.route('#life/life-09');
  assert.match(a.get('#app').innerHTML,/事务所与企业实习资源/);
  assert.match(a.get('#app').innerHTML,/奖助、预算与原职业准备资料/);
  assert.match(a.get('#internship-results').innerHTML,/open-nanjing|national-channel/);
  assert.match(a.get('#internship-result-count').textContent,/2 家机构 · 4 条匹配资源/);
  assert.doesNotMatch(a.get('#internship-results').innerHTML,/closed-shanghai|formal-graduate|preparation-club/,'default view excludes historical and non-internship records');
  a.change('intern-city','南京');
  let html=a.get('#internship-results').innerHTML;
  assert.match(html,/open-nanjing|announced-nanjing/);
  assert.doesNotMatch(html,/national-channel|closed-shanghai/,'office and searchCities cannot make an entry a Nanjing vacancy');
  a.change('intern-status','programs');
  html=a.get('#internship-results').innerHTML;
  assert.match(html,/open-nanjing|announced-nanjing/);
  assert.doesNotMatch(html,/formal-graduate|preparation-club|unread-listing|national-channel|closed-shanghai/);
  a.change('intern-group','domestic');
  html=a.get('#internship-results').innerHTML;
  assert.match(html,/announced-nanjing/);
  assert.doesNotMatch(html,/open-nanjing/);
  a.route('#mentors');a.route('#life/life-09');
  assert.doesNotMatch(a.get('#internship-results').innerHTML,/open-nanjing/,'in-session filter survives route changes');
  a.reset();a.change('intern-status','channels');
  assert.match(a.get('#internship-results').innerHTML,/national-channel/);
  assert.doesNotMatch(a.get('#internship-results').innerHTML,/open-nanjing|formal-graduate/);
  a.reset();a.change('intern-status','past');
  assert.match(a.get('#internship-results').innerHTML,/closed-shanghai/);
  assert.doesNotMatch(a.get('#internship-results').innerHTML,/open-nanjing|announced-nanjing/);
  assert.equal(a.fetches,1);assert.deepEqual(a.writes,[]);
});

test('resource details show uncertainty, separate windows from periods, and safely render source content',async()=>{
  const a=await app(fixture());a.route('#life/life-09');a.change('intern-status','');
  const html=a.get('#internship-results').innerHTML;
  assert.match(html,/时长／周期要求/);assert.doesNotMatch(html,/最短周期<\/dt>/);
  assert.match(html,/通常2–4个月/);assert.match(html,/项目实施期/);assert.match(html,/网申窗口/);assert.match(html,/投递截止/);
  assert.match(html,/原文未公布，申请前核对/);
  assert.match(html,/项目公告 · 开放待核/);assert.match(html,/列表线索 · 状态待核/);
  assert.match(html,/正式校招 · 非实习/);assert.match(html,/校园预备项目 · 非实习/);
  assert.match(html,/查看历史公告/);assert.doesNotMatch(html,/立即投递|立即申请/);
  assert.match(html,/&lt;img src=x onerror=alert\(2\)&gt;/);
  assert.match(html,/&lt;script&gt;alert\(4\)&lt;\/script&gt;/);
  assert.doesNotMatch(html,/href="javascript:|<script>|<img src=x|\[object Object\]|\["依据原文"/);
  assert.match(html,/rel="noopener noreferrer"/);
  assert.match(html,/南京 · KDI技术研发和交付中心 &lt;附属类别&gt;/);
  assert.match(html,/class="intern-resource"[^>]*><summary>/,'details remain folded by default');
  assert.match(a.get('#app').innerHTML,/具体门槛以岗位原文为准/);
  assert.match(a.get('#app').innerHTML,/不是当前名额保证/);
});

test('legacy data without internships keeps the original life chapter usable',async()=>{
  const data=structuredClone(dataset);delete data.internships;
  const a=await app(data);a.route('#life/life-09');
  assert.doesNotMatch(a.get('#app').innerHTML,/internship-hub|intern-life-shortcut/);
  assert.match(a.get('#app').innerHTML,/chapter-pagination/);
  assert.doesNotMatch(a.get('#app').innerHTML,/资料格式不完整|暂时未能载入/);
});


test('enterprise finance and internal-audit resources have their own group and filter',async()=>{
  const data=fixture();
  data.internships.firms.push({id:'fixture-enterprise',name:'样例企业',group:'enterprise',resources:[{id:'finance-intern',title:'财务与内部审计实习',kind:'channel',status:'entry_only',url:'https://example.org/company/careers',sourceIds:['TEST_INTERN']}],entryLinks:[],officeRecords:[],questions:[]});
  const a=await app(data);a.route('#life/life-09');
  assert.match(a.get('#app').innerHTML,/<option value="enterprise">企业财务／内审<\/option>/);
  a.change('intern-group','enterprise');
  const html=a.get('#internship-results').innerHTML;
  assert.match(html,/样例企业|财务与内部审计实习/);
  assert.match(html,/<span class="intern-group-label">企业财务与内审<\/span>/);
  assert.doesNotMatch(html,/样例四大|样例国内所|intern-group-label">国内所/);
  assert.match(a.get('#internship-result-count').textContent,/1 家机构 · 1 条匹配资源/);
  a.change('intern-group','domestic');
  assert.match(a.get('#internship-results').innerHTML,/样例国内所/);
  assert.doesNotMatch(a.get('#internship-results').innerHTML,/样例企业/);
});

test('official source screenshots render in resources and chapters and reject unsafe locations',async()=>{
  const data=fixture();
  const captures=[{src:'./evidence/refresh-20261110/recruitment-01.png',caption:'招聘信息 <原文>',scope:'只截取标题与岗位要求。',sourceUrl:'https://example.org/recruitment',width:1280,height:900},
    ...['./evidence/refresh-20261110/../private.png','./evidence/not-allowed/a.png','./evidence/refresh-20261110/a.png?token=hidden','./evidence/refresh-20261110/a%2fb.png','https://evil.example/a.png','javascript:alert(1)'].map(src=>({src,caption:'UNSAFE_OFFICIAL_CAPTURE'}))];
  data.internships.firms[0].resources[0].screenshots=captures;
  const chapter=data.lifeChapters.find(item=>item.id==='life-08');
  chapter.blocks=[{type:'screenshots',items:captures,sourceUrl:'https://example.org/recruitment'}];
  const a=await app(data);a.route('#life/life-09');
  const resource=a.get('#internship-results').innerHTML;
  assert.match(resource,/src="\.\/evidence\/refresh-20261110\/recruitment-01\.png"/);
  assert.match(resource,/来源页面与评论截图|招聘信息 &lt;原文&gt;/);
  assert.doesNotMatch(resource,/UNSAFE_OFFICIAL_CAPTURE|href="javascript:|src="https:\/\/evil/);
  a.route('#life/life-08');
  const html=a.get('#app').innerHTML;
  assert.match(html,/src="\.\/evidence\/refresh-20261110\/recruitment-01\.png"/);
  assert.match(html,/只截取标题与岗位要求/);
  assert.doesNotMatch(html,/UNSAFE_OFFICIAL_CAPTURE/);
});
