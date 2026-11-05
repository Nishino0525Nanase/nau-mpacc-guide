const test = require('node:test');
const assert = require('node:assert/strict');
const { createSender, parseConfig } = require('../dist/video/sender.js');

function element() {
  const handlers = {};
  return { textContent: '', disabled: false, checked: false, hidden: false, dataset: {}, srcObject: null,
    addEventListener(name, fn) { handlers[name] = fn; },
    fire(name) { return handlers[name]?.(); }, play() { return Promise.resolve(); } };
}
function setup(overrides = {}) {
  const elements = Object.fromEntries(['video','empty','status','badge','dot','countdown','preview','share','stop','consent','notice'].map(k => [k,element()]));
  const calls = { camera: [], fetch: [], peer: [], tracks: [] }, scheduled = new Map();
  let serial=0;
  const timers={setTimeout(fn,ms){ const id=++serial; scheduled.set(id,{fn,ms}); return id; },clearTimeout(id){scheduled.delete(id);}};
  const tracks=[0,1].map(i=>({kind:'video', stopped:false, stop(){this.stopped=true;calls.tracks.push(i);},addEventListener(){}}));
  const stream={getTracks:()=>tracks,getVideoTracks:()=>tracks};
  class PC {
    constructor(config){this.config=config;this.iceGatheringState='complete';this.connectionState='new';this.localDescription=null;this.remoteDescription=null;this.added=[];calls.peer.push(this);}
    addTrack(t){this.added.push(t);} async createOffer(){return {type:'offer',sdp:'v=0\r\no=sender'};}
    async setLocalDescription(d){this.localDescription=d;} async setRemoteDescription(d){this.remoteDescription=d;}
    addEventListener(){} removeEventListener(){} close(){this.closed=true;this.connectionState='closed';}
  }
  const config={signalOrigin:'https://signal.example',iceServers:[{urls:'stun:stun.cloudflare.com:3478'}]};
  const fetch=async(url,init)=>{calls.fetch.push({url,init});return {ok:true,status:200,json:async()=>init.method==='POST'?{id:'session_abcdefgh',senderToken:'s'.repeat(43),expiresAt:'2026-01-01T00:10:00.000Z'}:{id:'session_abcdefgh',answer:null,status:'waiting',expiresAt:'2026-01-01T00:10:00.000Z'}};};
  const camera=async constraints=>{calls.camera.push(constraints);return stream;};
  const controller=createSender({elements,config,mediaDevices:{getUserMedia:camera},PeerConnection:PC,fetch,now:()=>Date.parse('2026-01-01T00:00:00.000Z'),timers,...overrides});
  return {controller,elements,calls,tracks,stream,scheduled,config,timers,PC};
}

test('page construction never asks for camera or creates a remote session',()=>{
  const s=setup();assert.equal(s.calls.camera.length,0);assert.equal(s.calls.fetch.length,0);assert.equal(s.calls.peer.length,0);assert.equal(s.elements.share.disabled,true);
});
test('preview is an explicit camera-only request with no audio or remote signalling',async()=>{
  const s=setup();await s.controller.preview();
  assert.equal(s.calls.camera.length,1);assert.equal(s.calls.camera[0].audio,false);assert.equal(s.calls.camera[0].video.facingMode.ideal,'user');assert.equal(s.calls.fetch.length,0);assert.equal(s.calls.peer.length,0);assert.equal(s.elements.video.srcObject,s.stream);assert.equal(s.controller.getState(),'preview');assert.match(s.elements.status.textContent,/仅本地预览/);
  s.controller.stop();
});
test('a checkbox alone never starts capture or sharing',()=>{
  const s=setup();s.elements.consent.checked=true;s.controller.consentChanged();
  assert.equal(s.calls.camera.length,0);assert.equal(s.calls.fetch.length,0);assert.equal(s.elements.share.disabled,true);
});
test('sharing requires separate consent after preview',async()=>{
  const s=setup();await s.controller.preview();assert.equal(await s.controller.share(),false);assert.equal(s.calls.fetch.length,0);assert.equal(s.calls.peer.length,0);assert.match(s.elements.status.textContent,/单独勾选/);s.controller.stop();
});
test('explicit share sends only complete SDP and consent version after local preview',async()=>{
  const s=setup();await s.controller.preview();s.elements.consent.checked=true;s.controller.consentChanged();assert.equal(s.elements.share.disabled,false);await s.controller.share();
  assert.equal(s.calls.peer.length,1);assert.equal(s.calls.camera.length,1);
  const post=s.calls.fetch.find(c=>c.init.method==='POST');assert.ok(post);
  const body=JSON.parse(post.init.body);assert.deepEqual(Object.keys(body).sort(),['consentVersion','offer']);assert.equal(body.consentVersion,'camera-share-v1');assert.equal(body.offer.type,'offer');assert.equal(post.init.credentials,'omit');assert.equal(post.init.referrerPolicy,'no-referrer');assert.equal(s.controller.getState(),'waiting');assert.equal(s.elements.badge.textContent,'等待连接');s.controller.stop();
});
test('only actual peer connected state changes UI to sharing',async()=>{
  const s=setup();await s.controller.preview();s.elements.consent.checked=true;await s.controller.share();
  assert.equal(s.controller.getState(),'waiting');const pc=s.calls.peer[0];pc.connectionState='connected';pc.onconnectionstatechange();assert.equal(s.controller.getState(),'sharing');assert.match(s.elements.status.textContent,/正在向站主共享/);s.controller.stop();
});
test('stop terminates every camera track, peer, timers, and authenticated server session',async()=>{
  const s=setup();await s.controller.preview();s.elements.consent.checked=true;await s.controller.share();const pc=s.calls.peer[0];s.controller.stop();
  assert.ok(s.tracks.every(t=>t.stopped));assert.equal(pc.closed,true);assert.equal(s.elements.video.srcObject,null);assert.equal(s.elements.consent.checked,false);assert.equal(s.elements.stop.disabled,true);assert.equal(s.controller.getState(),'idle');assert.equal(s.scheduled.size,0);
  const del=s.calls.fetch.find(c=>c.init.method==='DELETE');assert.ok(del);assert.equal(del.init.headers.Authorization,'Bearer '+'s'.repeat(43));assert.ok(!del.url.includes('s'.repeat(43)));assert.equal(del.init.keepalive,true);
});
test('stopping during a pending camera permission closes the late returned stream',async()=>{
  let resolveCamera;const pending=new Promise(r=>{resolveCamera=r;});const s=setup({mediaDevices:{getUserMedia:()=>pending}});const wait=s.controller.preview();s.controller.stop();resolveCamera(s.stream);await wait;assert.ok(s.tracks.every(t=>t.stopped));assert.equal(s.elements.video.srcObject,null);assert.equal(s.calls.fetch.length,0);
});
test('missing backend configuration visibly disables remote sharing',async()=>{
  const s=setup({config:null});assert.equal(s.controller.isConfigured(),false);assert.match(s.elements.notice.textContent,/视频共享尚未启用/);await s.controller.preview();s.elements.consent.checked=true;s.controller.consentChanged();assert.equal(s.elements.share.disabled,true);assert.equal(await s.controller.share(),false);assert.equal(s.calls.fetch.length,0);s.controller.stop();
});
test('camera permission rejection cannot create remote sessions',async()=>{
  const err=Object.assign(new Error('denied'),{name:'NotAllowedError'});const s=setup({mediaDevices:{getUserMedia:async()=>{throw err;}}});assert.equal(await s.controller.preview(),false);assert.equal(s.calls.fetch.length,0);assert.match(s.elements.status.textContent,/未获得摄像头许可/);assert.equal(s.elements.stop.disabled,true);
});
test('expired or invalid server sessions fail closed and stop capture',async()=>{
  const s=setup({fetch:async()=>({ok:true,json:async()=>({id:'session_abcdefgh',senderToken:'s'.repeat(43),expiresAt:'2025-12-31T23:59:59.000Z'})})});await s.controller.preview();s.elements.consent.checked=true;assert.equal(await s.controller.share(),false);assert.ok(s.tracks.every(t=>t.stopped));assert.equal(s.calls.peer[0].closed,true);assert.equal(s.controller.getState(),'idle');
});
test('unsafe signal URLs are rejected rather than used for data transmission',()=>{
  for(const signalOrigin of ['http://signal.example','https://user:password@signal.example','https://signal.example/path','https://signal.example/?token=bad','javascript:bad'])assert.equal(parseConfig({signalOrigin}),null);
});
test('session expiry is bounded locally to ten minutes and stops the camera',async()=>{
  const s=setup();await s.controller.preview();s.elements.consent.checked=true;await s.controller.share();
  const deadline=[...s.scheduled.values()].find(x=>x.ms===600000);assert.ok(deadline);deadline.fn();assert.ok(s.tracks.every(t=>t.stopped));assert.match(s.elements.status.textContent,/共享时限/);
});
