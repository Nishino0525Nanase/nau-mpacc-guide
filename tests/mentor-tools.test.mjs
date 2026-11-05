import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const dataset=JSON.parse(readFileSync(new URL('../dist/data/site-data.json',import.meta.url),'utf8'));
const decode=value=>value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');

async function app({secure=true,clipboard=true,denied=false,data=dataset}={}) {
  const elements=new Map(), handlers=new Map(), winHandlers=new Map(), copies=[], writes=[];
  let document;
  class Element {
    constructor(selector){this.selector=selector;this.dataset={};this.style={};this.attributes={};this.isConnected=true;this.open=false;this._html='';this.value='';this.textContent='';this.classList={add(){},remove(){},contains(){return false;}};}
    set innerHTML(value){
      this._html=value;
      if(this.selector==='#dialog-content') {
        const match=value.match(/<textarea[^>]*id="contact-copy-text"[^>]*>([\s\S]*?)<\/textarea>/);
        if(match) get('#contact-copy-text').value=decode(match[1]);
      }
    }
    get innerHTML(){return this._html;}
    querySelector(selector){return get(selector);}
    querySelectorAll(){return [];}
    addEventListener(name,fn){handlers.set(this.selector+':'+name,fn);}
    setAttribute(name,value){this.attributes[name]=value;}
    removeAttribute(name){delete this.attributes[name];}
    getBoundingClientRect(){return {height:90,left:0,right:800,top:0,bottom:700};}
    focus(){document.activeElement=this;}
    select(){this.selected=true;}
    scrollIntoView(){}
    showModal(){this.open=true;}
    close(){this.open=false;}
  }
  const get=selector=>{if(!elements.has(selector))elements.set(selector,new Element(selector));return elements.get(selector);};
  document={querySelector:get,querySelectorAll:()=>[],documentElement:{style:{setProperty(){}}},body:{style:{}},activeElement:get('start'),title:'',addEventListener:(name,fn)=>handlers.set(name,fn)};
  const location={href:'https://example.github.io/nau-mpacc-guide/',hash:''};
  const window={location,isSecureContext:secure,matchMedia:()=>({matches:false}),addEventListener:(name,fn)=>winHandlers.set(name,fn),dispatchEvent(){},scrollTo(){},scrollY:0};
  const navigator=clipboard?{clipboard:{writeText:async text=>{if(denied)throw new Error("NotAllowedError");copies.push(text);}}}:{};
  vm.runInNewContext(script,{document,window,location,navigator,URL,console,CSS:{escape:x=>x},CustomEvent:class{constructor(name,options){this.type=name;this.detail=options?.detail;}},Event:class{},fetch:async()=>({ok:true,json:async()=>structuredClone(data),headers:{get:()=>null}}),localStorage:{getItem:()=>null,setItem:(key,value)=>writes.push([key,value])},requestAnimationFrame:fn=>fn(),setTimeout:()=>1,clearTimeout(){}});
  for(let i=0;i<12;i++)await Promise.resolve();
  const click=(action,id,extra={})=>handlers.get('click')({target:{closest:selector=>selector==='[data-action]'?{dataset:{action,id,...extra}}:null}});
  return {get,copies,writes,click,location,window,editContact(text){get('#contact-copy-text').value=text;handlers.get('input')({target:{id:'contact-copy-text',value:text}});},async changeMentor(id){handlers.get('change')({target:{id:'contact-mentor',value:id}});await Promise.resolve();},route(hash){location.hash=hash;winHandlers.get('hashchange')();},async flush(){for(let i=0;i<6;i++)await Promise.resolve();}};
}

test('comparison enforces three distinct valid teachers and survives filters and route changes',async()=>{
 const a=await app();
 assert.match(a.get('#mentor-tools').innerHTML,/0 \/ 3/);
 a.click('compare-toggle','mentor-01');a.click('compare-toggle','mentor-27');a.click('compare-toggle','mentor-26');
 a.click('compare-toggle','mentor-02');a.click('compare-toggle','missing');
 assert.match(a.get('#mentor-tools').innerHTML,/3 \/ 3/);
 assert.match(a.get('#toast').textContent,/最多同时对比三位/);
 a.click('direction','G1');
 a.route('#life/life-08');a.route('#mentors');a.click('compare-open');
 const html=a.get('#dialog-content').innerHTML;
 assert.match(html,/董必荣/);assert.match(html,/王永妍/);assert.match(html,/傅祥斐/);
 assert.doesNotMatch(html,/<strong>温素彬<\/strong>/);
 a.click('compare-toggle','mentor-27');assert.match(a.get('#mentor-tools').innerHTML,/2 \/ 3/);
 a.click('compare-clear');assert.match(a.get('#mentor-tools').innerHTML,/0 \/ 3/);
 assert.match(a.get('#dialog-content').innerHTML,/选择两至三位/);
 assert.deepEqual(a.writes,[],'comparison must not create persistent or network-linked identity');
});

test('comparison retains source populations, limitations and direct links without assigning current quotas',async()=>{
 const a=await app();a.click('compare-toggle','mentor-01');a.click('compare-toggle','mentor-27');a.click('compare-toggle','mentor-26');a.click('compare-open');
 const html=a.get('#dialog-content').innerHTML;
 assert.match(html,/学院专硕|专硕历史/);assert.match(html,/MPAcc|1253/);
 assert.match(html,/案例作者|作者关系|教学案例/);
 assert.match(html,/本科/);assert.match(html,/本人经历自述|二手转述/);
 assert.match(html,/158917\/page.htm/);
 assert.match(html,/当年|名额/);assert.match(html,/未公开|核对|确认/);
 const row=html.match(/<tr><th scope="row">当前公开联系<\/th>([\s\S]*?)<\/tr>/)?.[1];
 assert(row);assert.match(row,/未公开（当前个人页）/);
 const historical=dataset.mentors.find(x=>x.id==='mentor-01').historicalContact;
 for(const email of JSON.stringify(historical).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)||[])assert(!row.includes(email),'old mailbox must not be promoted as current contact');
});

test('contact drafts target one teacher with truthful placeholders and can be copied securely',async()=>{
 const a=await app();a.click('compare-toggle','mentor-01');a.click('compare-toggle','mentor-27');a.click('contact-prepare','mentor-27');
 a.click('contact-mode',undefined,{mode:'draft'});
 let text=a.get('#contact-copy-text').value;
 assert.match(text,/王永妍老师您好/);assert.doesNotMatch(text,/董必荣老师您好/);
 assert.match(text,/【姓名】/);assert.match(text,/【学校、专业及年级／拟入学项目】/);assert.match(text,/准备进一步阅读【/);
 assert.doesNotMatch(text,/胡雨诺|刘鑫磊|海南大学|3\.04/);
 a.click('copy-contact');await a.flush();assert.equal(a.copies[0],text);
 await a.changeMentor('mentor-01');text=a.get('#contact-copy-text').value;assert.match(text,/董必荣老师您好/);assert.doesNotMatch(text,/王永妍老师您好/);
});

test('contact text remains selectable when clipboard is unavailable or denied',async()=>{
 const a=await app({secure:false,clipboard:false});a.click('contact-prepare');a.click('copy-contact');await a.flush();
 assert.equal(a.get('#contact-copy-text').selected,true);assert.match(a.get('#contact-copy-status').textContent,/手动|Ctrl\/Cmd/);
 assert.match(a.get('#contact-copy-text').value,/【导师姓名】/);
 const denied=await app({denied:true});denied.click('contact-prepare');denied.click('copy-contact');await denied.flush();assert.equal(denied.get('#contact-copy-text').selected,true);assert.equal(denied.copies.length,0);
});


test('edited contact text follows its teacher and text type across switching and reopening',async()=>{
 const a=await app();a.click('contact-prepare','mentor-01');
 assert.doesNotMatch(a.get('#dialog-content').innerHTML, /contact-copy-text[^>]*readonly/);
 a.editContact('甲老师的个人准备文字');
 await a.changeMentor('mentor-27');assert.doesNotMatch(a.get('#contact-copy-text').value,/甲老师的个人准备文字/);
 a.editContact('乙老师的不同准备文字');
 await a.changeMentor('mentor-01');assert.equal(a.get('#contact-copy-text').value,'甲老师的个人准备文字');
 a.click('contact-mode',undefined,{mode:'draft'});assert.match(a.get('#contact-copy-text').value,/邮件标题/);
 a.editContact('甲老师的修改后草稿');
 a.click('contact-mode',undefined,{mode:'outline'});assert.equal(a.get('#contact-copy-text').value,'甲老师的个人准备文字');
 a.click('compare-close');a.click('contact-prepare','mentor-01');assert.equal(a.get('#contact-copy-text').value,'甲老师的个人准备文字');
 a.click('contact-mode',undefined,{mode:'draft'});assert.equal(a.get('#contact-copy-text').value,'甲老师的修改后草稿');
 a.click('copy-contact');await a.flush();assert.equal(a.copies.at(-1),'甲老师的修改后草稿');
 assert.deepEqual(a.writes,[],'edits stay only in the current session');
});
