import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const dataset=JSON.parse(readFileSync(new URL('../dist/data/site-data.json',import.meta.url),'utf8'));
const decode=value=>value.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');

function fixture(){
  const data=structuredClone(dataset);
  for(const [id,number,title] of [['life-13',13,'第十三章 预算与奖助'],['life-14',14,'第十四章 女生独立生活']]){
    const chapter=data.lifeChapters.find(chapter=>chapter.id===id);
    if(chapter)Object.assign(chapter,{number,title});
    else data.lifeChapters.push({id,number,title,blocks:[],sourceCodes:[]});
  }
  data.studentStart={title:'把眼前的几件事安顿好',intro:'按自己的阶段看，不必一次完成。',phases:[
    {id:'before',label:'到校前',summary:'先确认材料与第一晚用品。',tasks:[{title:'材料随身带',text:'原件不要放进快递箱。',chapterId:'life-02'},{title:'先留到校预算',text:'把确定缴费和预计收入分开。',chapterId:'life-13'}]},
    {id:'night',label:'第一晚',summary:'先能睡觉、洗漱和联系上值班人员。',tasks:[{title:'确认入住',text:'先找到本楼值班室。',chapterId:'life-03'}]},
    {id:'week',label:'第一周',summary:'把自己的生活路线走通。',tasks:[{title:'路线试走',text:'从宿舍走到常上课的楼。',chapterId:'life-11'}]},
    {id:'year',label:'研一',summary:'把课程、实践和论文放在同一张日历。',tasks:[{title:'保存本级安排',text:'按自己的培养节点准备。',chapterId:'life-08'}]}
  ],quickLinks:[{label:'预算与奖助',chapterId:'life-13'},{label:'独立生活与边界',chapterId:'life-14'}]};
  return data;
}

async function app(data=fixture(),hash='#life/life-01',chapterImages=''){
  const elements=new Map(),handlers=new Map(),winHandlers=new Map(),writes=[],events=[];
  let document,phaseButtons=[],appWrites=0,fetches=0;
  class Element{
    constructor(selector){this.selector=selector;this.dataset={};this.attributes={};this.style={};this.isConnected=true;this.open=false;this._html='';this.value='';this.textContent='';this.checked=false;this.classList={add(){},remove(){},contains(){return false;}};}
    set innerHTML(value){
      this._html=value;
      if(this.selector==='#app'){
        appWrites++;
        phaseButtons=[...value.matchAll(/<button[^>]*data-action="student-phase"[^>]*>/g)].map((match,index)=>{
          const button=new Element('phase:'+index);
          button.dataset={action:'student-phase',id:decode(match[0].match(/data-id="([^"]*)"/)?.[1]||'')};
          button.attributes['aria-pressed']=match[0].match(/aria-pressed="([^"]*)"/)?.[1];
          return button;
        });
      }
    }
    get innerHTML(){return this._html;}
    querySelector(selector){return get(selector);}
    querySelectorAll(selector){return selector==='[data-action="student-phase"]'?phaseButtons:[];}
    addEventListener(name,fn){handlers.set(this.selector+':'+name,fn);}
    setAttribute(name,value){this.attributes[name]=value;}
    removeAttribute(name){delete this.attributes[name];}
    getBoundingClientRect(){return {height:90,left:0,right:900,top:0,bottom:700};}
    focus(){document.activeElement=this;}
    scrollIntoView(){}
    showModal(){this.open=true;}
    close(){this.open=false;}
  }
  const get=selector=>{if(!elements.has(selector))elements.set(selector,new Element(selector));return elements.get(selector);};
  document={querySelector:get,querySelectorAll:selector=>selector==='[data-action="student-phase"]'?phaseButtons:[],documentElement:{style:{setProperty(){}}},body:{style:{}},activeElement:get('initial'),title:'',addEventListener:(name,fn)=>handlers.set(name,fn)};
  const location={href:'https://example.github.io/nau-mpacc-guide/'+hash,hash};
  const window={location,matchMedia:()=>({matches:false}),addEventListener:(name,fn)=>winHandlers.set(name,fn),dispatchEvent:event=>events.push(event.type),scrollTo(){},scrollY:0,NAULifeImages:{renderChapter:()=>chapterImages}};
  vm.runInNewContext(script,{document,window,location,navigator:{},URL,console,CSS:{escape:x=>x},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},Event:class{},fetch:async()=>{fetches++;return {ok:true,json:async()=>structuredClone(data),headers:{get:()=>null}};},localStorage:{getItem:()=>null,setItem:(key,value)=>writes.push([key,value])},requestAnimationFrame:fn=>fn(),setTimeout:()=>1,clearTimeout(){}});
  for(let i=0;i<12;i++)await Promise.resolve();
  return {get,writes,events,location,get appWrites(){return appWrites;},get fetches(){return fetches;},get phases(){return phaseButtons;},
    phase(id){handlers.get('click')({target:{closest:selector=>selector==='[data-action]'?{dataset:{action:'student-phase',id}}:null}});},
    route(value){location.hash=value;winHandlers.get('hashchange')();},
    change(target){handlers.get('change')({target});}
  };
}

test('new-student stages switch only their panel without routing, persistence or extra capture',async()=>{
  const a=await app();
  const initial=a.get('#app').innerHTML;
  assert.match(initial,/<details class="student-start" id="student-start">/);
  assert.doesNotMatch(initial,/<details class="student-start" id="student-start" open>/);
  assert.ok(initial.indexOf('<nav class="student-start-links"')<initial.indexOf('<details class="student-start"'),'topic links stay visible outside the optional stage checklist');
  assert.match(a.get('#student-start-content').innerHTML,/材料随身带/);
  assert.doesNotMatch(a.get('#student-start-content').innerHTML,/确认入住|路线试走|保存本级安排/);
  const writes=a.appWrites,events=a.events.length;
  a.phase('night');
  assert.match(a.get('#student-start-content').innerHTML,/确认入住/);
  assert.doesNotMatch(a.get('#student-start-content').innerHTML,/材料随身带/);
  assert.equal(a.phases.find(button=>button.dataset.id==='night').attributes['aria-pressed'],'true');
  assert.equal(a.phases.find(button=>button.dataset.id==='before').attributes['aria-pressed'],'false');
  a.phase('year');assert.match(a.get('#student-start-content').innerHTML,/保存本级安排/);
  const content=a.get('#student-start-content').innerHTML;
  a.phase('does-not-exist');assert.equal(a.get('#student-start-content').innerHTML,content);
  assert.equal(a.appWrites,writes,'switching a stage must preserve the current article and its native checkboxes');
  assert.equal(a.location.hash,'#life/life-01');
  assert.equal(a.events.length,events);assert.deepEqual(a.writes,[]);assert.equal(a.fetches,1);
});

test('starting points are collapsed on every chapter and new chapter labels lose their numbering',async()=>{
  const a=await app(fixture(),'#life/life-14');
  const html=a.get('#app').innerHTML;
  assert.match(html,/<details class="student-start" id="student-start">/);
  assert.doesNotMatch(html,/<details class="student-start" id="student-start" open>/);
  assert.match(html,/chapter-number">14<\/span><span>女生独立生活<\/span>/);
  assert.match(html,/href="#life\/life-13"/);assert.match(html,/href="#life\/life-14"/);
});

test('task and quick links allow only an existing chapter and safely escape text',async()=>{
  const data=fixture();
  data.studentStart.title='<img src=x onerror=alert(1)>';
  data.studentStart.phases[0].tasks=[{title:'<script>alert(2)</script>',text:'正文 <svg onload=alert(3)>',chapterId:'javascript:alert(4)'},{title:'不存在',text:'保留文字但不生成链接',chapterId:'life-99'},{title:'有效',text:'去第二章',chapterId:'life-02'}];
  data.studentStart.quickLinks.push({label:'危险入口',chapterId:'https://outside.example/'},{label:'不存在入口',chapterId:'life-99'});
  const a=await app(data),html=a.get('#app').innerHTML,panel=a.get('#student-start-content').innerHTML;
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(panel,/&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
  assert.doesNotMatch(html,/<img src=x|<script>alert\(2\)|<svg onload|href="(?:javascript:|https:\/\/outside)/);
  assert.doesNotMatch(html,/href="#life\/life-99"|危险入口|不存在入口/);
  assert.equal((panel.match(/阅读相关章节/g)||[]).length,1);
});

test('callouts and native checklists retain citations and escape markup without saving ticks',async()=>{
  const data=fixture();
  data.sourceRegistry.START_NOTE={title:'核对来源',url:'https://example.org/source'};
  data.lifeChapters.find(chapter=>chapter.id==='life-01').blocks=[
    {type:'callout',tone:'action',label:'先做这一件',title:'材料核对',text:'把原件随身带。[START_NOTE]',items:['逐项核对','<img src=x onerror=alert(1)>']},
    {type:'callout',tone:'confirm" onclick="alert(2)',title:'等待本级确认',text:'不要套用旧年份。'},
    {type:'checklist',title:'第一晚 <script>',items:['认清值班室[START_NOTE]','检查日常用品']}
  ];
  const a=await app(data),html=a.get('#app').innerHTML;
  assert.match(html,/class="life-callout life-callout-action" role="note"/);
  assert.match(html,/class="life-callout life-callout-note"/);
  assert.match(html,/class="citation" href="https:\/\/example.org\/source"/);
  assert.match(html,/aria-label="第一晚 &lt;script&gt;"/);
  assert.equal((html.match(/<label><input type="checkbox"><span>/g)||[]).length,2);
  assert.doesNotMatch(html,/<img src=x|onclick="alert|<script>/);
  const check=a.get('native-check');check.checked=true;a.change(check);
  a.phase('week');assert.equal(check.checked,true);assert.deepEqual(a.writes,[]);
});

test('older data without the entry remains usable and internships and routes still render',async()=>{
  const data=fixture();delete data.studentStart;
  const a=await app(data);
  assert.doesNotMatch(a.get('#app').innerHTML,/class="student-start"/);
  assert.ok(a.get('#app').innerHTML.includes(data.lifeChapters.find(chapter=>chapter.id==='life-01').title));
  a.phase('before');assert.deepEqual(a.writes,[]);
  a.route('#life/life-09');
  assert.match(a.get('#app').innerHTML,/事务所与企业实习资源/);
  assert.match(a.get('#app').innerHTML,/class="intern-legacy-chapter"/);
  a.route('#life/life-13');assert.match(a.get('#app').innerHTML,/第十三章 预算与奖助/);
});

test('internship preparation appears once before the hub and stays visible without a hub',async()=>{
  const data=fixture(),chapter=data.lifeChapters.find(chapter=>chapter.id==='life-09');
  const checklist={type:'checklist',title:'投递前核对',items:['确认出勤和地点'],placement:'before-internships'};
  chapter.concise=false;
  chapter.blocks=[checklist,{type:'p',text:'旧版奖助资料'}];
  const a=await app(data,'#life/life-09'),html=a.get('#app').innerHTML;
  const marker='<h4>'+checklist.title+'</h4>';
  assert.equal(html.split(marker).length-1,1,'the checklist must not be duplicated');
  assert.ok(html.indexOf(marker)<html.indexOf('<section class="internship-hub"'));
  const legacy=html.slice(html.indexOf('<details class="intern-legacy-chapter"'));
  assert.ok(!legacy.includes(marker),'the action checklist must not sit in the collapsed budget material');
  assert.match(legacy,/旧版奖助资料/);
  const old=structuredClone(data);delete old.internships;
  const fallback=await app(old,'#life/life-09');
  assert.equal(fallback.get('#app').innerHTML.split(marker).length-1,1,'placement must remain visible without an internship hub');
});

test('concise chapters show the answer before optional photos and archived detail',async()=>{
  const data=fixture(),chapter=data.lifeChapters.find(chapter=>chapter.id==='life-03');
  chapter.concise=true;
  chapter.blocks=[{type:'p',text:'先看床桌和卫浴情况。'},{type:'details',readingArchive:true,text:'详细资料与原文',blocks:[{type:'p',text:'这里是较长的原始资料。'}]}];
  const a=await app(data,'#life/life-03','<section class="test-photos">照片和图注</section>'),html=a.get('#app').innerHTML;
  const brief=html.indexOf('先看床桌和卫浴情况。'),photos=html.indexOf('<details class="life-photos-disclosure">'),archive=html.indexOf('<details class="source-disclosure reading-archive">');
  assert.ok(brief>=0&&brief<photos&&photos<archive,'the short answer must precede both optional sections');
  assert.equal((html.match(/test-photos/g)||[]).length,1);
  assert.match(html,/<summary><span>宿舍照片<\/span><small>点开查看<\/small><\/summary>/);
  assert.doesNotMatch(html,/<details class="(?:life-photos-disclosure|source-disclosure reading-archive)" open/);
  assert.equal(a.fetches,1);assert.deepEqual(a.writes,[]);
});

test('concise internship pages unwrap the archive into a single legacy fold',async()=>{
  const data=fixture(),chapter=data.lifeChapters.find(chapter=>chapter.id==='life-09');
  chapter.concise=true;
  chapter.blocks=[{type:'p',text:'先看工作地点和出勤。',placement:'before-internships'},{type:'details',readingArchive:true,text:'详细资料与原文',blocks:[{type:'p',text:'完整旧资料仅出现一次。'}]}];
  const a=await app(data,'#life/life-09'),html=a.get('#app').innerHTML;
  assert.ok(html.indexOf('先看工作地点和出勤。')<html.indexOf('<section class="internship-hub"'));
  assert.equal((html.match(/class="intern-legacy-chapter"/g)||[]).length,1);
  assert.equal((html.match(/完整旧资料仅出现一次。/g)||[]).length,1);
  assert.doesNotMatch(html,/source-disclosure reading-archive/,'the original archive must not be nested inside another fold');
});
