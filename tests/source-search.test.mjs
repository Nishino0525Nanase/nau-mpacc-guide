import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const dataset=JSON.parse(readFileSync(new URL('../dist/data/site-data.json',import.meta.url),'utf8'));

async function app(data=dataset) {
  const elements=new Map(), handlers=new Map(), windowHandlers=new Map();
  let document;
  class Element {
    constructor(selector){this.selector=selector;this.dataset={};this.style={};this.attributes={};this.innerHTML='';this.textContent='';this.value='';this.open=false;this.isConnected=true;this.classList={add(){},remove(){},contains(){return false;}};}
    querySelector(selector){return get(selector);}
    querySelectorAll(){return [];}
    addEventListener(name,handler){handlers.set(this.selector+':'+name,handler);}
    getBoundingClientRect(){return {height:90,left:0,right:800,top:0,bottom:700};}
    setAttribute(name,value){this.attributes[name]=value;}
    removeAttribute(name){delete this.attributes[name];}
    focus(){document.activeElement=this;}
    scrollIntoView(){}
    showModal(){this.open=true;}
    close(){this.open=false;}
  }
  const get=selector=>{if(!elements.has(selector))elements.set(selector,new Element(selector));return elements.get(selector);};
  document={querySelector:get,querySelectorAll:()=>[],documentElement:{style:{setProperty(){}}},body:{style:{}},activeElement:get('start'),addEventListener:(name,handler)=>handlers.set(name,handler)};
  const location={href:'https://example.github.io/nau-mpacc-guide/',hash:'#posts'};
  const window={location,addEventListener:(name,handler)=>windowHandlers.set(name,handler),dispatchEvent(){},matchMedia:()=>({matches:false}),scrollTo(){}};
  vm.runInNewContext(script,{document,window,location,navigator:{},URL,console,CSS:{escape:value=>value},CustomEvent:class{},Event:class{},fetch:async()=>({ok:true,json:async()=>structuredClone(data),headers:{get:()=>null}}),localStorage:{getItem:()=>null},requestAnimationFrame:fn=>fn(),setTimeout:()=>1,clearTimeout(){}});
  for(let index=0;index<12;index++)await Promise.resolve();
  return {
    get,
    search(value){handlers.get('input')({target:{id:'post-search',value,parentElement:{querySelector:()=>get('.search-clear')}}});},
    filter(id,value){handlers.get('change')({target:{id,value}});},
    click(action,id){handlers.get('click')({target:{closest:selector=>selector==='[data-action]'?{dataset:{action,id}}:null}});},
    route(hash){location.hash=hash;windowHandlers.get('hashchange')();},
    results(){return get('#post-results').innerHTML;},
    count(){return Number(get('#post-result-count').innerHTML.match(/<strong>(\d+)<\/strong>/)?.[1]);}
  };
}

test('source search finds practical details already present in tips and comment attribution',async()=>{
  const a=await app();
  for(const [query,title] of [
    ['胖乖生活','南审新生必备学习/生活app'],
    ['2024—2025年度序时账','社会审计学院2024级审计专硕实习实践专访：企业篇'],
    ['林瑜','南审mpacc导师求推荐']
  ]) {
    a.search(query);
    assert(a.count()>0,`search must find ${query}`);
    assert(a.results().includes(title),`${title} contains ${query} in the source details`);
  }
});

test('source search covers displayed scope but excludes internal and superseded metadata',async()=>{
  const data=structuredClone(dataset),post=data.socialPosts[0];
  post.readingScopes=['VISIBLE_READING_SCOPE'];
  post.limitations='VISIBLE_USE_LIMIT';
  post.inputFiles=['INTERNAL_FILE_MARKER'];
  post.comments=[{author:'VISIBLE_COMMENT_AUTHOR',text:'Current comment body',relationship:'VISIBLE_RELATIONSHIP',limits:['VISIBLE_COMMENT_LIMIT'],contextInterpretationBeforeRound10:{content:'SUPERSEDED_COMMENT_BODY'}}];
  const a=await app(data);
  for(const query of ['VISIBLE_READING_SCOPE','VISIBLE_USE_LIMIT','VISIBLE_COMMENT_AUTHOR','VISIBLE_RELATIONSHIP','VISIBLE_COMMENT_LIMIT']) {
    a.search(query);assert.equal(a.count(),1,query);assert(a.results().includes(post.title));
  }
  for(const query of ['INTERNAL_FILE_MARKER','SUPERSEDED_COMMENT_BODY']) {a.search(query);assert.equal(a.count(),0,query);}
});

test('comment details retain real relationship and limits stored under the legacy field names',async()=>{
  const a=await app(),id='69cba3e80000000028008246';
  const post=dataset.socialPosts.find(post=>post.id===id),comment=post.comments.find(comment=>comment.author==='木渎');
  a.click('post',id);
  const html=a.get('#dialog-content').innerHTML;
  assert(html.includes(comment.relationship),'the explicit undergraduate perspective must appear beside the comment');
  assert(html.includes(comment.limits),'the distinction between course experience and hearsay must remain visible');
  assert.doesNotMatch(html,/\[object Object\]|contextInterpretationBeforeRound10/);
});

test('comment details display all distinct boundaries and escape array metadata',async()=>{
  const data=structuredClone(dataset),post=data.socialPosts[0];
  post.comments=[{author:'Comment author',text:'Current body',identity:'本科生',relationship:'只上过课程 <script>alert(1)</script>',assessment:'仅反映课程经历',limits:['仅反映课程经历','不能外推到MPAcc论文指导']}];
  const a=await app(data);a.click('post',post.id);
  const html=a.get('#dialog-content').innerHTML;
  assert.match(html,/本科生 \/ 只上过课程 &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html,/仅反映课程经历；不能外推到MPAcc论文指导/);
  assert.equal((html.match(/仅反映课程经历/g)||[]).length,1);
  assert.doesNotMatch(html,/<script>|\[&quot;仅反映/);
});

test('exact source numbers and combined filters survive the broader content search',async()=>{
  const data=structuredClone(dataset),first=structuredClone(data.socialPosts[0]),second=structuredClone(data.socialPosts[1]);
  first.sourceIds=['R79'];second.sourceIds=['R799'];
  first.topic='测试主题甲';second.topic='测试主题乙';
  first.category=second.category='测试类别';
  first.tips=second.tips=['共同可见经历'];
  data.socialPosts=[first,second];data.sourceRegistry={R79:{url:first.url},R799:{url:second.url}};
  const a=await app(data);
  a.search('r79');assert.equal(a.count(),1);assert(a.results().includes(first.title));assert(!a.results().includes(second.title));
  a.search('共同可见经历');assert.equal(a.count(),2);
  a.filter('post-topic','测试主题乙');assert.equal(a.count(),1);assert(a.results().includes(second.title));
  a.filter('post-category','不存在的类别');assert.equal(a.count(),0);
  a.click('reset-posts');assert.equal(a.count(),2);
  a.route('#life/life-01');a.route('#posts');assert.equal(a.count(),2);
});

test('long source codes and complete post IDs find the same employment source shown on its card',async()=>{
  const a=await app();
  for(const query of ['FO20261114-XIE','fo20261114-2021','FO20261114-2022','FO20261114-XIE-POST']) {
    a.search(query);assert.equal(a.count(),1,query);
    assert.match(a.results(),/校友风采之20届会计专业谢晓俊/);
    assert.match(a.results(),/FO20261114-XIE \/ FO20261114-2021 \/ FO20261114-2022/);
    assert.doesNotMatch(a.results(),/>IE-POST</);
  }
});

test('a post in two themes remains discoverable under either theme and keeps the search intersection',async()=>{
  const a=await app();a.search('Nau研一到期中啦');assert.equal(a.count(),1);
  for(const topic of ['导师与培养','学习与就业']) {
    a.filter('post-topic',topic);assert.equal(a.count(),1,topic);
    assert.match(a.results(),/Nau研一到期中啦/);
  }
  a.filter('post-topic','住宿与日常');assert.equal(a.count(),0);
  a.click('reset-posts');
  assert.doesNotMatch(a.get('#app').innerHTML,/<option[^>]*>导师与培养\n学习与就业<\/option>/);
});
