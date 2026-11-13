import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const dataset=JSON.parse(readFileSync(new URL('../dist/data/site-data.json',import.meta.url),'utf8'));

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
  return {get,click(action,id,extra={}){handlers.get('click')({target:{closest:selector=>selector==='[data-action]'?{dataset:{action,id,...extra}}:null}});},detail(id){this.click('mentor',id);return get('#dialog-content').innerHTML;}};
}

const emptyDossier=()=>({coverageStatus:'not_found',coverageLabel:'暂无可归属学生评价',summary:'',reviews:[],recommendationPoints:[],concerns:[],verificationQuestions:[],gaps:[]});
const xhsUrl='https://www.xiaohongshu.com/explore/aaaaaaaaaaaaaaaaaaaaaaaa';
function fixture(){
  const data=structuredClone(dataset);
  delete data.mentorAliases;
  data.ambiguousMentorAliases=[];
  data.socialPosts=[];
  data.studentOutcomes={records:[],statistics:[],achievements:[]};
  for(const mentor of data.mentors)mentor.studentReviews=emptyDossier();
  data.sourceRegistry.CTX_XHS={title:'测试选导帖',platform:'小红书',url:xhsUrl,canonicalUrl:xhsUrl,date:'2025-04-02'};
  data.sourceRegistry.CTX_SCHOOL={title:'具名校友访谈',platform:'南京审计大学新闻网',url:'https://news.nau.edu.cn/2026/0101/c1a100/page.htm'};
  data.sourceRegistry.CTX_OTHER={title:'外部记录',url:'https://example.org/notes'};
  data.sourceRegistry.CTX_BAD={title:'恶意来源',url:'javascript:alert(1)'};
  return data;
}
function setReview(data,mentorIndex,overrides={}){
  const review={id:'context-review-'+mentorIndex,text:'EXISTING_REVIEW_SUMMARY',narrator:'原帖评论者',date:'2025-04-02',degree:'未说明',relationship:'未说明',experienceType:'general',firsthand:null,sourceIds:['CTX_XHS'],sourceUrl:xhsUrl,attribution:{status:'confirmed',reason:'该帖具名对应这位老师'},contextAssessment:{eligibleForRecommendation:false,eligibleForConcern:false},...overrides};
  data.mentors[mentorIndex].studentReviews={...emptyDossier(),coverageStatus:'weak_mentions',reviews:[review],recommendationPoints:[{text:'UNSUPPORTED_RECOMMENDATION',reviewIds:[review.id]}],concerns:[{text:'UNSUPPORTED_CONCERN',reviewIds:[review.id]}]};
  return review;
}
function post(id,overrides={}){return {id,title:'本站上下文记录',url:xhsUrl,canonicalUrl:xhsUrl,sourceIds:['CTX_XHS'],platform:'小红书',author:'原帖作者',date:'2025-04-02',category:'导师评价线索',topic:'导师讨论',summary:'POST_CONTEXT_MARKER',comments:[],...overrides};}

test('visible words and stored summaries remain distinct from an explicitly tentative interpretation',async()=>{
  const data=fixture();
  setReview(data,0,{contextNotes:{excerpt:{kind:'visible_quote',text:'VISIBLE_WORDS',sourceIds:['CTX_XHS'],scope:'截图中的可见片段'},context:['VISIBLE_REPLY_CONTEXT'],interpretation:{text:'POSSIBLE_READING',confidence:'limited',alternative:'ALTERNATIVE_READING'},limits:['未给具体指导过程'],sourceIds:['CTX_XHS']}});
  setReview(data,1,{contextNotes:{excerpt:{kind:'summary',text:'STORED_SUMMARY',sourceIds:['CTX_XHS']},context:['STORED_REPLY_CONTEXT'],interpretation:{text:'SUMMARY_READING',confidence:'contextual'},sourceIds:['CTX_XHS']}});
  const a=await boot(data),quote=a.detail('mentor-01');
  assert.match(quote,/review-context-hint[^>]*>语境解读/);assert.match(quote,/原话片段/);assert.match(quote,/<blockquote[^>]*>[^]*VISIBLE_WORDS[^]*<\/blockquote>/);
  assert.match(quote,/VISIBLE_REPLY_CONTEXT/);assert.match(quote,/可能的意思/);assert.match(quote,/解读，未作事实确认/);
  assert.match(quote,/POSSIBLE_READING/);assert.match(quote,/ALTERNATIVE_READING/);
  assert.match(quote,/亲历情况未明确/);assert.doesNotMatch(quote,/UNSUPPORTED_RECOMMENDATION|UNSUPPORTED_CONCERN|MPAcc指导亲历/);
  const summary=a.detail('mentor-02');assert.match(summary,/已存摘要/);assert.match(summary,/review-context-summary[^]*STORED_SUMMARY/);
  assert.doesNotMatch(summary,/<blockquote[^>]*>[^]*STORED_SUMMARY/,'a summary is not presented as a quotation');
});

test('context content is escaped and only safe registered source links become clickable',async()=>{
  const data=fixture();
  setReview(data,0,{sourceIds:['CTX_XHS','CTX_BAD'],contextNotes:{excerpt:{kind:'recorded_quote',text:'<script>QUOTE_ATTACK</script>',sourceIds:['CTX_BAD','CTX_XHS'],scope:'<img src=x onerror=alert(2)>'},context:['<img src=x onerror=alert(3)>'],interpretation:{text:'<script>READING_ATTACK</script>',confidence:'limited',alternative:'<img src=x onerror=alert(4)>'},limits:['<iframe src=x>'],sourceIds:['CTX_BAD','CTX_XHS']}});
  const a=await boot(data),html=a.detail('mentor-01');
  assert.match(html,/&lt;script&gt;QUOTE_ATTACK/);assert.match(html,/&lt;script&gt;READING_ATTACK/);
  assert.doesNotMatch(html,/<script>|<img src=x|<iframe src=x|href="javascript:/);
  assert.match(html,/href="https:\/\/www\.xiaohongshu\.com\/explore\/aaaaaaaaaaaaaaaaaaaaaaaa"/);
});

test('the local context action opens an actual matching post and never invents a post id',async()=>{
  const data=fixture();setReview(data,0);data.socialPosts=[post('source-linked-post')];
  const a=await boot(data),html=a.detail('mentor-01');
  assert.match(html,/data-action="post"[^>]*data-id="source-linked-post"/);
  a.click('post','source-linked-post',{mentorId:'mentor-01'});assert.match(a.get('#dialog-content').innerHTML,/POST_CONTEXT_MARKER/);assert.match(a.get('#dialog-content').innerHTML,/返回董必荣导师资料/);a.click('mentor','mentor-01');assert.match(a.get('#dialog-content').innerHTML,/EXISTING_REVIEW_SUMMARY/);

  const canonical=fixture();
  setReview(canonical,0,{sourceIds:[],sourceUrl:'https://www.rednote.com/discovery/item/aaaaaaaaaaaaaaaaaaaaaaaa?share=test'});
  canonical.socialPosts=[post('canonical-linked-post',{sourceIds:[]})];
  const b=await boot(canonical);assert.match(b.detail('mentor-01'),/data-action="post"[^>]*data-id="canonical-linked-post"/);

  const unrelated=fixture();setReview(unrelated,0,{sourceIds:['UNREGISTERED'],sourceUrl:'https://evil.example/?next='+xhsUrl});
  unrelated.socialPosts=[post('decoy-post',{sourceIds:['UNREGISTERED']})];
  const c=await boot(unrelated);assert.doesNotMatch(c.detail('mentor-01'),/data-action="post"/,'neither an unknown code nor a URL substring proves a match');
});

test('legacy records keep source platform labels without receiving an empty context block',async()=>{
  const data=fixture();setReview(data,0);
  setReview(data,1,{sourceIds:['CTX_SCHOOL'],sourceUrl:data.sourceRegistry.CTX_SCHOOL.url,experienceType:'interview'});
  setReview(data,2,{sourceIds:['CTX_OTHER'],sourceUrl:data.sourceRegistry.CTX_OTHER.url,experienceType:'interview'});
  const a=await boot(data),xhs=a.detail('mentor-01');
  assert.match(xhs,/review-source-platform[^>]*>小红书/);assert.match(xhs,/EXISTING_REVIEW_SUMMARY/);
  assert.doesNotMatch(xhs,/class="review-context-notes|class="review-context-hint/);
  const school=a.detail('mentor-02');assert.match(school,/review-source-platform[^>]*>校方访谈/);
  const other=a.detail('mentor-03');
  assert.doesNotMatch(other,/review-source-platform[^>]*>(?:小红书|校方访谈)/,'an interview at an unrelated domain is not a school interview');
});
