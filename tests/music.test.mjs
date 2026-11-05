import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const BASE_URL='https://guide.example/nau/';
const sampleTracks=()=>[
  {id:'sunrise',title:'走，一起去看日出吧',artist:'华晨宇',album:'希忘Hope',version:'专辑版',durationSeconds:275.4,audioUrl:'./media/music/sunrise.mp3',listeningLinks:[{label:'QQ音乐搜索',url:'https://y.qq.com/n/ryqq/search?w=华晨宇%20走一起去看日出吧',type:'search'}]},
  {id:'forever',title:'For Forever',artist:'华晨宇',album:'H',version:'专辑版',durationSeconds:280.7,audioUrl:'./media/music/forever.m4a',listeningLinks:[]},
  {id:'seek',title:'寻',artist:'华晨宇',album:'寻',version:'专辑版',durationSeconds:270.6,audioUrl:'./media/music/seek.mp3',listeningLinks:[]},
  {id:'light',title:'向阳而生',artist:'华晨宇',album:'华晨宇日出演唱会特辑',version:'现场版',durationSeconds:702.6,audioUrl:'./media/music/light.mp3',listeningLinks:[]},
];

function loadModule({AudioConstructor}={}) {
  let constructed=0,networkCalls=0,persistentCalls=0;
  const globalHandlers=new Map(),documentHandlers=new Map();
  const AudioClass=AudioConstructor||class {constructor(){constructed++;throw new Error('Audio must be lazy');}};
  const window={Audio:AudioClass,location:{href:BASE_URL},addEventListener:(name,fn)=>globalHandlers.set(name,fn),removeEventListener(){}};
  const document={baseURI:BASE_URL,hidden:false,addEventListener:(name,fn)=>documentHandlers.set(name,fn),removeEventListener(){}};
  vm.runInNewContext(readFileSync(new URL('../dist/music.js',import.meta.url),'utf8'),{
    window,document,location:window.location,URL,console,Audio:AudioClass,
    fetch(){networkCalls++;throw new Error('The music module must leave media fetching to explicit Audio playback');},
    localStorage:{getItem(){persistentCalls++;throw new Error('No persisted listening data');},setItem(){persistentCalls++;throw new Error('No persisted listening data');}},
    setTimeout,clearTimeout,
  });
  return {api:window.NAUMusic,document,constructed:()=>constructed,sideEffects:()=>({networkCalls,persistentCalls}),globalHandlers,documentHandlers};
}

class FakeAudio {
  constructor(){this.handlers=new Map();this.src='';this.paused=true;this.currentTime=0;this.duration=NaN;this.volume=1;this.muted=false;this.playCalls=0;this.pauseCalls=0;this.loadCalls=0;this.mode='resolve';this.pending=[];this.ended=false;}
  addEventListener(name,fn){if(!this.handlers.has(name))this.handlers.set(name,new Set());this.handlers.get(name).add(fn);}
  removeEventListener(name,fn){this.handlers.get(name)?.delete(fn);}
  emit(name){for(const fn of [...(this.handlers.get(name)||[])])fn({type:name,target:this});}
  load(){this.loadCalls++;this.duration=NaN;this.currentTime=0;this.ended=false;}
  removeAttribute(name){if(name==='src')this.src='';}
  pause(){this.pauseCalls++;this.paused=true;this.emit('pause');}
  play(){
    this.playCalls++;
    if(this.mode==='reject'){this.paused=true;return Promise.reject(Object.assign(new Error('blocked'),{name:'NotAllowedError'}));}
    if(this.mode==='pending')return new Promise((resolve,reject)=>this.pending.push({resolve:()=>{this.paused=false;this.emit('playing');resolve();},reject}));
    this.paused=false;this.ended=false;this.emit('playing');return Promise.resolve();
  }
}

function player(tracks=sampleTracks()) {
  const env=loadModule(),audio=new FakeAudio();
  return {...env,audio,engine:env.api.createPlayer({tracks,audio,baseUrl:BASE_URL})};
}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

function mockMusicContainer() {
  const nodes=new Map(),handlers=new Map();
  return {
    innerHTML:'',
    querySelector(selector){
      if(!nodes.has(selector))nodes.set(selector,{textContent:'',innerHTML:'',value:'',disabled:false,classList:{toggle(){}},setAttribute(){}});
      return nodes.get(selector);
    },
    querySelectorAll(){return [];},contains(){return true;},
    addEventListener(name,listener){if(!handlers.has(name))handlers.set(name,new Set());handlers.get(name).add(listener);},
    removeEventListener(name,listener){handlers.get(name)?.delete(listener);},
    dispatch(name,event){for(const listener of [...(handlers.get(name)||[])])listener(event);},
    handlerCount(){return [...handlers.values()].reduce((count,listeners)=>count+listeners.size,0);},
  };
}

test('music boot and selection remain silent and unloaded until explicit playback',async()=>{
  const env=loadModule();assert.equal(env.constructed(),0);
  assert.deepEqual(env.sideEffects(),{networkCalls:0,persistentCalls:0});
  const p=player();
  assert.equal(p.audio.src,'');assert.equal(p.audio.loadCalls,0);assert.equal(p.audio.playCalls,0);
  assert.equal(p.audio.autoplay,false);assert.equal(p.engine.getState().availableCount,4);
  assert.deepEqual(Array.from(p.engine.getState().availableIds),['sunrise','forever','seek','light']);
  p.engine.select('seek');await flush();
  assert.equal(p.engine.getState().selectedId,'seek');
  assert.equal(p.audio.src,'');assert.equal(p.audio.loadCalls,0);assert.equal(p.audio.playCalls,0);
  assert.deepEqual(p.sideEffects(),{networkCalls:0,persistentCalls:0});
  assert.equal(await p.engine.play(),true);
  assert.equal(p.audio.src,`${BASE_URL}media/music/seek.mp3`);
  assert.equal(p.audio.loadCalls,1);assert.equal(p.audio.playCalls,1);
  assert.equal(p.engine.getState().status,'playing');assert.match(p.engine.getState().message,/寻/);
  p.engine.select('forever');
  assert.equal(p.audio.paused,true,'selecting another row pauses current playback');
  assert.notEqual(p.audio.src,`${BASE_URL}media/music/forever.m4a`,'selection does not fetch the next track');
  assert.equal(p.audio.playCalls,1);
});

test('audio URLs accept only exact relative MP3 or M4A paths for the selected track',()=>{
  const {api}=loadModule();
  for(const good of ['./media/music/seek.mp3','./media/music/seek.m4a'])assert.equal(api.safeAudioUrl(good,'seek',BASE_URL),new URL(good,BASE_URL).href);
  for(const bad of ['javascript:alert(1)','data:audio/mpeg;base64,AA','blob:local-one','file:///seek.mp3','https://evil.example/nau/media/music/seek.mp3',`${BASE_URL}media/music/seek.mp3`,'https://guide.example.evil.example/nau/media/music/seek.mp3','https://evil@guide.example/nau/media/music/seek.mp3','https://guide.example/other/media/music/seek.mp3','/media/music/seek.mp3','./media/music/forever.mp3','./media/music/seek.wav','./media/music/seek.mp3?download=1','./media/music/seek.mp3#track'])assert.equal(api.safeAudioUrl(bad,'seek',BASE_URL),'',bad);
  assert.equal(api.safeAudioUrl('./media/music/seek.mp3','../seek',BASE_URL),'');
  const nativeBase='https://appassets.androidplatform.net/assets/guide/';
  assert.equal(api.safeAudioUrl('./media/music/seek.mp3','seek',nativeBase),'','bundled Android pages must not request missing local audio');
  const audio=new FakeAudio(),nativePlayer=api.createPlayer({tracks:sampleTracks(),audio,baseUrl:nativeBase});
  assert.equal(nativePlayer.getState().availableCount,0);
  assert.match(nativePlayer.getState().message,/联网.*在线/);
  assert.equal(audio.src,'');assert.equal(audio.loadCalls,0);assert.equal(audio.playCalls,0);
});

test('rejected playback and audio errors never claim success, and stale play cannot restart after pause',async()=>{
  const p=player();p.engine.select('seek');
  p.audio.mode='reject';assert.equal(await p.engine.play(),false);
  assert.notEqual(p.engine.getState().status,'playing');assert.match(p.engine.getState().message,/播放|浏览器|点击|允许/);
  p.audio.mode='pending';const oldPlay=p.engine.play();
  p.engine.pause();p.audio.pending[0].resolve();await oldPlay;await flush();
  assert.equal(p.audio.paused,true);assert.notEqual(p.engine.getState().status,'playing');
  p.audio.mode='resolve';await p.engine.play();p.audio.emit('error');
  assert.equal(p.engine.getState().status,'error');assert.match(p.engine.getState().message,/播放|读取|重试|格式|加载/);
});

test('an older failed play cannot overwrite a newer selection already playing',async()=>{
  const p=player();p.audio.mode='pending';const oldPlay=p.engine.play('seek');
  p.audio.mode='resolve';await p.engine.play('forever');
  p.audio.pending[0].reject(Object.assign(new Error('old request'),{name:'AbortError'}));
  await oldPlay;await flush();
  assert.equal(p.engine.getState().selectedId,'forever');assert.equal(p.engine.getState().status,'playing');
  assert.equal(p.audio.paused,false);assert.equal(p.audio.src,`${BASE_URL}media/music/forever.m4a`);
});

test('seek uses actual finite media duration, clamps values and follows time events',async()=>{
  const p=player();p.engine.select('seek');
  p.engine.seek(30);assert.equal(p.audio.currentTime,0,'playlist metadata does not make audio seekable');
  await p.engine.play();p.audio.duration=8;p.audio.emit('loadedmetadata');
  p.engine.seek(99);assert.equal(p.audio.currentTime,8);
  p.engine.seek(-10);assert.equal(p.audio.currentTime,0);
  p.audio.currentTime=3.5;p.audio.emit('timeupdate');
  assert.equal(p.engine.getState().currentTime,3.5);assert.equal(p.engine.getState().duration,8);
  p.engine.setVolume(8);assert.equal(p.audio.volume,1);
  p.engine.setVolume(-5);assert.equal(p.audio.volume,0);
  const priorMute=p.audio.muted;p.engine.toggleMute();assert.equal(p.audio.muted,!priorMute);
});

test('paused next only selects playable tracks, and automatic continuation stops at the last song',async()=>{
  const tracks=sampleTracks();tracks[1].audioUrl='https://evil.example/forever.mp3';
  const p=player(tracks);assert.equal(p.engine.getState().availableCount,3);
  p.engine.next(1);await flush();
  assert.equal(p.engine.getState().selectedId,'seek','invalid sources are skipped');
  assert.equal(p.audio.src,'');assert.equal(p.audio.loadCalls,0);assert.equal(p.audio.playCalls,0);
  assert.equal(await p.engine.play('forever'),false,'invalid audio sources cannot become playable');
  assert.equal(p.audio.loadCalls,0);assert.equal(p.audio.playCalls,0);
  await p.engine.play('seek');
  p.audio.paused=true;p.audio.ended=true;p.audio.emit('ended');await flush();
  assert.equal(p.engine.getState().selectedId,'light');assert.equal(p.engine.getState().status,'playing');
  const played=p.audio.playCalls;
  p.audio.paused=true;p.audio.ended=true;p.audio.emit('ended');await flush();
  assert.equal(p.audio.playCalls,played,'the final song does not create an endless loop');
  assert.notEqual(p.engine.getState().status,'playing');
});

test('dispose removes sources and listeners, and a late promise cannot restart sound',async()=>{
  const p=player();p.audio.mode='pending';
  const promise=p.engine.play('seek');p.engine.dispose();p.engine.dispose();
  p.audio.pending[0].resolve();await promise;await flush();
  assert.equal(p.audio.paused,true);assert.equal(p.audio.src,'');assert.equal(p.engine.getState().disposed,true);
  assert.equal([...p.audio.handlers.values()].reduce((count,listeners)=>count+listeners.size,0),0);
  const played=p.audio.playCalls;
  assert.equal(await p.engine.play('forever'),false);assert.equal(p.audio.playCalls,played);
});

test('route, visibility and pagehide pause one session, while permanent departure cleans it up',async()=>{
  const audios=[];class MountAudio extends FakeAudio {constructor(){super();audios.push(this);}}
  const env=loadModule({AudioConstructor:MountAudio});
  const container=mockMusicContainer(),playlist={artist:'华晨宇',tracks:sampleTracks()};
  const clickPlay=()=>container.dispatch('click',{target:{closest:selector=>selector==='[data-music-action]'?{dataset:{musicAction:'toggle'}}:null}});
  env.api.mount(container,playlist);
  const audio=audios[0];assert.equal(audio.src,'');assert.equal(audio.loadCalls,0);assert.equal(audio.playCalls,0);
  clickPlay();await flush();assert.equal(audio.paused,false);
  audio.duration=8;audio.emit('loadedmetadata');audio.currentTime=3;audio.emit('timeupdate');
  assert.equal(env.globalHandlers.has('beforeunload'),false);
  env.globalHandlers.get('pagehide')({persisted:true});
  assert.equal(audio.paused,true);assert.equal(env.api.isMounted(),true);
  const src=audio.src;clickPlay();await flush();
  assert.equal(audio.paused,false);assert.equal(audio.src,src);assert.equal(audio.currentTime,3);
  assert.equal(audios.length,1,'bfcache retains the same Audio session');
  env.document.hidden=true;env.documentHandlers.get('visibilitychange')();assert.equal(audio.paused,true);
  env.document.hidden=false;clickPlay();await flush();
  env.globalHandlers.get('nau:audio-pause')();assert.equal(audio.paused,true);
  clickPlay();await flush();env.api.leave();
  assert.equal(audio.paused,true);assert.equal(env.api.isMounted(),false);
  env.api.mount(container,playlist);assert.equal(audios.length,1,'returning to the route reuses the session');
  clickPlay();await flush();assert.equal(audio.paused,false);
  env.globalHandlers.get('pagehide')({persisted:false});
  assert.equal(audio.paused,true);assert.equal(env.api.isMounted(),false);assert.equal(audio.src,'');
  assert.equal([...audio.handlers.values()].reduce((count,listeners)=>count+listeners.size,0),0);
  assert.equal(container.handlerCount(),0);
  env.api.mount(container,playlist);
  assert.equal(audios.length,2);assert.equal(audios[1].src,'');assert.equal(audios[1].loadCalls,0);assert.equal(audios[1].playCalls,0);
});

test('music links stay on official HTTPS platforms and markup is escaped without import controls',()=>{
  const {api}=loadModule();
  for(const good of ['https://y.qq.com/n/ryqq/search?w=华晨宇','https://music.163.com/#/search/m/?s=华晨宇'])assert.equal(api.safeListeningUrl(good),new URL(good).href);
  for(const bad of ['javascript:alert(1)','data:text/html,bad','blob:local-one','file:///secret.mp3','/relative','http://y.qq.com/','https://y.qq.com.evil.example/','https://evil@y.qq.com/','https://evil.example/'])assert.equal(api.safeListeningUrl(bad),'');
  const tracks=sampleTracks();tracks[0].title='<img src=x onerror=alert(1)>';
  tracks[0].listeningLinks.push({label:'<script>bad</script>',url:'javascript:alert(1)',type:'direct'});
  const html=api.renderMarkup({title:'<script>oops</script>',ownerLabel:'<svg onload=bad()>',artist:'华晨宇',tracks});
  assert.match(html,/&lt;img/);
  assert.doesNotMatch(html,/<script|<img|<svg onload|href="javascript:|href="data:/i);
  assert.doesNotMatch(html,/<audio[^>]*autoplay|type=["']file["']|music-file-input|选择本机音频|移除本机音频/i);
});
