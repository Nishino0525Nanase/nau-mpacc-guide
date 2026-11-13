import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
const code = await fs.readFile(new URL('../dist/analytics.js', import.meta.url), 'utf8');
const site = 'https://nishino0525nanase.github.io/nau-mpacc-guide/';
function boot(options = {}) {
  const map = options.map || new Map();
  const writes = [], requests = [], notices = [];
  const timers = new Map(), windowListeners = new Map(), documentListeners = new Map();
  let clock = 0, nextTimer = 1;
  function addListener(registry, type, listener) {
    if (!registry.has(type)) registry.set(type, new Set());
    registry.get(type).add(listener);
  }
  function emit(registry, type, detail = {}) {
    for (const listener of [...(registry.get(type) || [])]) listener({type, ...detail});
  }
  const toast = { textContent: '', classList: { add: value => notices.push(value) } };
  const window = {
    location: new URL(options.url || site),
    navigator: options.navigator || {},
    document: {
      referrer: options.referrer || '', getElementById: () => toast,
      visibilityState: options.initiallyHidden ? 'hidden' : 'visible',
      addEventListener: (type, listener) => addListener(documentListeners, type, listener),
      removeEventListener: (type, listener) => documentListeners.get(type)?.delete(listener)
    },
    localStorage: {
      getItem: key => { if (options.blocked) throw Error('blocked'); return map.get(key) ?? null; },
      setItem: (key, value) => { if (options.blocked || options.writeFails) throw Error('blocked'); writes.push(key); map.set(key, value); },
      removeItem: key => { if (options.blocked) throw Error('blocked'); map.delete(key); }
    },
    crypto: { randomUUID },
    performance: {now: () => clock},
    addEventListener: (type, listener) => addListener(windowListeners, type, listener),
    removeEventListener: (type, listener) => windowListeners.get(type)?.delete(listener),
    setTimeout: (callback, delay) => { const id = nextTimer++; timers.set(id, {callback, at: clock + delay}); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: (url, init) => { requests.push({url, init, payload: JSON.parse(init.body)}); return options.reject ? Promise.reject(Error('offline')) : Promise.resolve({ok: true}); },
    NAU_ANALYTICS: { token: 'phc_public_test_capture_token', apiHost: 'https://us.i.posthog.com', allowedHost: 'nishino0525nanase.github.io', pathPrefix: '/nau-mpacc-guide/', ...(options.config || {}) }
  };
  if (options.noTimers) delete window.setTimeout;
  if (options.noPerformance) delete window.performance;
  if (options.noLifecycle) delete window.document.addEventListener;
  window.history = { replaceState: (_a, _b, url) => { window.location = new URL(url); } };
  const context = vm.createContext({window, URL});
  vm.runInContext(code, context);
  return {
    window, map, writes, requests, toast, notices, timers, windowListeners, documentListeners,
    reload: () => vm.runInContext(code, context),
    advance(ms, runTimers = true) {
      const target = clock + ms;
      if (runTimers) {
        while (true) {
          const due = [...timers].filter(([, value]) => value.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
          if (!due) break;
          clock = due[1].at; timers.delete(due[0]); due[1].callback();
        }
      }
      clock = target;
    },
    fireTimer() {
      const due = [...timers][0];
      if (due) { timers.delete(due[0]); due[1].callback(); }
    },
    visibility(state) {
      window.document.visibilityState = state;
      emit(documentListeners, 'visibilitychange');
    },
    emit: (type, detail) => emit(windowListeners, type, detail)
  };
}
test('one anonymous pageview without persistent identity, private URL or cookies', () => {
  const env = boot({url: site + '?email=private@example.com#private', referrer:'https://search.example/?q=private'});
  assert.equal(env.requests.length, 1);
  const {payload, init} = env.requests[0];
  assert.equal(payload.event, '$pageview');
  assert.match(payload.distinct_id, /^pv_[a-f0-9-]{36}$/);
  assert.equal(payload.properties.$current_url, site);
  assert.equal(payload.properties.$process_person_profile, false);
  assert.equal(payload.properties.$ip, null);
  assert.equal(payload.properties.$geoip_disable, true);
  assert.equal(payload.properties.analytics_mode, 'aggregate_v3_devices');
  assert.equal(payload.properties.pageview_id, payload.distinct_id);
  assert.equal(payload.properties.dwell_tracking_version, 'visible_v1');
  assert.equal(payload.properties.device_type, '其他');
  assert.equal(payload.properties.device_os, '未知');
  assert.equal(payload.properties.device_browser, '未知');
  assert.equal(payload.properties.referrer_host, 'search.example');
  assert.equal(init.credentials, 'omit');
  assert.equal(init.referrerPolicy, 'no-referrer');
  assert.ok(!init.body.includes('private'));
  assert.deepEqual(env.writes, []);
  assert.equal(env.map.size, 0);
});
test('each full load uses a fresh event ID; duplicate script and hash changes add no PV', () => {
  const first = boot(); first.window.location.hash = '#life'; first.reload();
  const second = boot({map: first.map});
  assert.equal(first.requests.length, 1);
  assert.notEqual(first.requests[0].payload.distinct_id, second.requests[0].payload.distinct_id);
});
for (const [label, navigator, expected] of [
  ['reduced Android Chrome', {userAgent:'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/156.0.0.0 Mobile Safari/537.36', userAgentData:{mobile:true,platform:'Android'}}, ['手机','Android','Chrome']],
  ['explicit Android tablet', {userAgent:'Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36 Chrome/156.0.0.0 Safari/537.36', userAgentData:{mobile:false,platform:'Android'}}, ['平板','Android','Chrome']],
  ['ambiguous Android desktop mode', {userAgent:'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/156.0.0.0 Safari/537.36', userAgentData:{mobile:false,platform:'Android'}}, ['其他','Android','Chrome']],
  ['iPad desktop mode', {userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15', platform:'MacIntel',maxTouchPoints:5}, ['平板','iPadOS','Safari']],
  ['Mac without touch', {userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15', platform:'MacIntel',maxTouchPoints:0}, ['电脑','macOS','Safari']],
  ['iPhone Safari', {userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'}, ['手机','iOS','Safari']],
  ['iPhone Chrome', {userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/156.0 Mobile/15E148 Safari/604.1'}, ['手机','iOS','Chrome']],
  ['touchscreen Windows Edge', {userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/156.0.0.0 Safari/537.36 Edg/156.0.0.0',platform:'Win32',maxTouchPoints:10}, ['电脑','Windows','Edge']],
  ['Linux Firefox', {userAgent:'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',platform:'Linux x86_64'}, ['电脑','Linux','Firefox']],
  ['Chrome OS', {userAgent:'Mozilla/5.0 (X11; CrOS x86_64 1.0) AppleWebKit/537.36 Chrome/156.0.0.0 Safari/537.36'}, ['电脑','Chrome OS','Chrome']],
  ['Android WebView', {userAgent:'Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 Version/4.0 Chrome/156.0.0.0 Mobile Safari/537.36'}, ['手机','Android','Android WebView']],
  ['WeChat browser', {userAgent:'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/156.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0'}, ['手机','Android','微信内置浏览器']],
  ['low entropy brand only', {userAgentData:{platform:'Windows',mobile:false,brands:[{brand:'Not_A Brand'},{brand:'Chromium'},{brand:'Microsoft Edge'}]}}, ['电脑','Windows','Edge']],
  ['unidentified Mobile token', {userAgent:'UnknownAgent Mobile'}, ['其他','未知','未知']]
]) test('coarse device categories: '+label, () => {
  const env=boot({navigator});
  assert.equal(env.requests.length,1);
  const p=env.requests[0].payload.properties;
  assert.deepEqual([p.device_type,p.device_os,p.device_browser],expected);
  assert.deepEqual(env.writes,[]);
  assert.equal(env.map.size,0);
});
test('device fields allow only browser major version and never raw UA, model, full versions or high entropy requests', () => {
  let highEntropyCalls=0;
  const ua='Mozilla/5.0 (Linux; Android 14; PRIVATE_MODEL_22122RK93C Build/PRIVATE_BUILD) AppleWebKit/537.36 Chrome/156.1.2.3 Mobile Safari/537.36';
  const env=boot({navigator:{userAgent:ua,userAgentData:{mobile:true,platform:'Android',brands:[{brand:'Google Chrome',version:'PRIVATE_VERSION'}],getHighEntropyValues:()=>{highEntropyCalls++;throw Error('must not be called');}}}});
  assert.equal(highEntropyCalls,0);
  assert.equal(env.requests.length,1);
  assert.deepEqual(Object.keys(env.requests[0].payload.properties).sort(),[
    '$current_url','$geoip_disable','$host','$ip','$pathname','$process_person_profile',
    'analytics_mode','device_browser','device_browser_major','device_browser_context','device_detection_basis',
    'device_detection_status','device_info_version','device_os','device_type','referrer_host','source','pageview_id','dwell_tracking_version'
  ].sort());
  assert.doesNotMatch(env.requests[0].init.body,/PRIVATE_|156\.1\.2\.3|userAgent|model|platformVersion|device_id/);
  assert.equal(env.requests[0].payload.properties.device_browser_major, '156');
  assert.equal(env.requests[0].payload.properties.device_info_version, 'coarse_v4');
});
for (const [label, userAgent, browser, browserMajor, browserContext] of [
  ['QQ in-app uses QQ version rather than engine version', 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36 MQQBrowser/6.2 QQ/9.0.0.0', 'QQ内置浏览器', '9', 'QQ内置浏览器'],
  ['standalone QQ browser', 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36 MQQBrowser/6.2', 'QQ浏览器', '6', '普通浏览器'],
  ['UC browser', 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/100.0.4896.127 UCBrowser/16.3.0.1315 Mobile Safari/537.36', 'UC浏览器', '16', '普通浏览器'],
  ['Baidu app is not generic WebView', 'Mozilla/5.0 (Linux; Android 12; K; wv) AppleWebKit/537.36 Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36 baiduboxapp/13.60.0.10', '百度App内置浏览器', '13', '百度App内置浏览器'],
  ['desktop DingTalk is not ordinary Chrome', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36 DingTalk/7.6.40', '钉钉内置浏览器', '7', '钉钉内置浏览器'],
  ['DingTalk parenthesized token', 'Mozilla/5.0 (Linux; Android 14; K; wv) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36 DingTalk(7.6.40)', '钉钉内置浏览器', '7', '钉钉内置浏览器'],
  ['enterprise WeChat wins over WeChat marker', 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.54 wxwork/4.1.39', '企业微信内置浏览器', '4', '企业微信内置浏览器'],
  ['WeChat version is not underlying Chrome version', 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.54', '微信内置浏览器', '8', '微信内置浏览器'],
  ['legacy desktop Edge', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/70.0.3538.102 Safari/537.36 Edge/18.19045', 'Edge', '18', '普通浏览器'],
  ['Safari uses Version rather than WebKit build', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1', 'Safari', '26', '普通浏览器'],
  ['iOS Chrome has its own browser major', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/156.1.2.3 Mobile/15E148 Safari/604.1', 'Chrome', '156', '普通浏览器'],
  ['generic WebView reports Chrome major', 'Mozilla/5.0 (Linux; Android 14; K; wv) AppleWebKit/537.36 Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36', 'Android WebView', '120', 'Android WebView']
]) test('browser context and major: '+label, () => {
  const env = boot({navigator:{userAgent}});
  const p = env.requests[0].payload.properties;
  assert.equal(p.device_browser, browser);
  assert.equal(p.device_browser_major, browserMajor);
  assert.equal(p.device_browser_context, browserContext);
  assert.equal(p.device_info_version, 'coarse_v4');
  assert.equal(p.device_detection_status, '推断');
  assert.match(p.device_detection_basis, /^设备：.+；浏览器：UA浏览器或应用标记$/);
  assert.doesNotMatch(env.requests[0].init.body, /userAgent|model|platformVersion/);
});
test('allowed low-entropy brands expose only known family and integer major', () => {
  let calls = 0;
  const env = boot({navigator:{userAgentData:{
    platform:'Windows', mobile:false,
    brands:[{brand:'PRIVATE_BRAND',version:'PRIVATE_VERSION'},{brand:'Chromium',version:'156'},{brand:'Microsoft Edge',version:'156.1.2.3'}],
    getHighEntropyValues(){calls++;throw Error('not permitted');}
  }}});
  const p = env.requests[0].payload.properties;
  assert.equal(p.device_browser, 'Edge');
  assert.equal(p.device_browser_major, '156');
  assert.equal(p.device_os, 'Windows');
  assert.equal(p.device_browser_context, '普通浏览器');
  assert.match(p.device_detection_basis, /UA-CH桌面平台标记.*低熵品牌标记/);
  assert.equal(calls, 0);
  assert.doesNotMatch(env.requests[0].init.body, /PRIVATE_|156\.1\.2\.3|Windows 1[01]|platformVersion/);
});
test('an unknown brand or malformed known-brand version is not echoed', () => {
  for (const brands of [
    [{brand:'PRIVATE_BRAND',version:'PRIVATE_VERSION'}],
    [{brand:'Google Chrome',version:'PRIVATE_VERSION'}]
  ]) {
    const env = boot({navigator:{userAgentData:{platform:'Windows',mobile:false,brands}}});
    const p = env.requests[0].payload.properties;
    assert.equal(p.device_browser_major, '未提供');
    assert.doesNotMatch(env.requests[0].init.body, /PRIVATE_|platformVersion/);
  }
});
test('ambiguous Android desktop mode remains uncertain and frozen OS tokens are not reported as versions', () => {
  const env = boot({navigator:{
    userAgent:'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/156.0.0.0 Safari/537.36',
    userAgentData:{platform:'Android',mobile:false}
  }});
  const p = env.requests[0].payload.properties;
  assert.equal(p.device_type, '其他');
  assert.equal(p.device_os, 'Android');
  assert.equal(p.device_detection_status, '有歧义');
  assert.match(p.device_detection_basis, /Android桌面模式或平板未区分/);
  assert.doesNotMatch(env.requests[0].init.body, /Android 10|device_model|os_version|platformVersion/);
});
test('a blocked optional getter cannot discard a usable desktop UA', () => {
  const navigator = {
    userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/156.0.0.0 Safari/537.36',
    platform:'Win32'
  };
  Object.defineProperty(navigator, 'userAgentData', {get(){throw Error('blocked');}});
  const env = boot({navigator});
  const p = env.requests[0].payload.properties;
  assert.deepEqual([p.device_type,p.device_os,p.device_browser,p.device_browser_major], ['电脑','Windows','Chrome','156']);
  assert.equal(p.device_detection_status, '推断');
  assert.doesNotMatch(env.requests[0].init.body, /Windows 1[01]/);
});
test('a blocked UA getter still permits low-entropy platform and browser hints', () => {
  const navigator = {userAgentData:{platform:'Windows',mobile:false,brands:[{brand:'Microsoft Edge',version:'156'}]}};
  Object.defineProperty(navigator, 'userAgent', {get(){throw Error('blocked');}});
  const env = boot({navigator});
  const p = env.requests[0].payload.properties;
  assert.deepEqual([p.device_type,p.device_os,p.device_browser,p.device_browser_major], ['电脑','Windows','Edge','156']);
  assert.match(p.device_detection_basis, /低熵品牌标记/);
});
test('restricted device getters fail safely without breaking the one-count behavior', () => {
  const navigator=Object.defineProperty({},'userAgent',{get(){throw Error('restricted');}});
  const env=boot({navigator});
  assert.equal(env.requests.length,1);
  const p=env.requests[0].payload.properties;
  assert.deepEqual([p.device_type,p.device_os,p.device_browser],['其他','未知','未知']);
});
test('owner exclusion is applied before capture, saved, and survives ordinary reopening', () => {
  const env = boot({url: site + '?exclude_self=1#mentors'});
  assert.equal(env.requests.length, 0);
  assert.equal(env.map.get('nau_analytics_opt_out'), '1');
  assert.equal(env.window.location.href, site + '#mentors');
  assert.match(env.toast.textContent, /已排除当前浏览器/);
  assert.equal(boot({map: env.map}).requests.length, 0);
});
test('owner link fails closed and reports when the persistent write fails', () => {
  const env = boot({url: site + '?exclude_self=1', writeFails: true});
  assert.equal(env.requests.length, 0);
  assert.equal(env.window.NAUAnalytics.isOptedOut(), true);
  assert.match(env.toast.textContent, /未能保存/);
});
test('legacy identity is deleted; prior explicit refusal is respected', () => {
  const map = new Map([['nau_mpacc_guide_anon_id_v1','old-id'],['nau_privacy_consent_v1',JSON.stringify({version:1, analytics:false})]]);
  const env=boot({map});
  assert.equal(map.has('nau_mpacc_guide_anon_id_v1'), false);
  assert.equal(env.requests.length, 0);
});
for (const [label, opts] of [
  ['owner', {map:new Map([['nau_analytics_opt_out','1']])}],
  ['DNT', {navigator:{doNotTrack:'1'}}],
  ['GPC', {navigator:{globalPrivacyControl:true}}],
  ['blocked settings', {blocked:true}],
  ['other host', {url:'https://example.com/nau-mpacc-guide/'}],
  ['preview', {url:'https://preview.example/nau-mpacc-guide/'}],
  ['different repository', {url:'https://nishino0525nanase.github.io/another/'}],
  ['removed video page', {url:site+'video/'}],
  ['removed management page', {url:site+'admin/'}],
  ['secret key', {config:{token:'phx_private_key'}}],
  ['untrusted endpoint', {config:{apiHost:'https://example.com'}}]
]) test(label+' sends no count', () => assert.equal(boot(opts).requests.length, 0));
test('device properties are not read before exclusion, storage, host, or config guards', () => {
  for(const opts of [
    {url:site+'?exclude_self=1'},
    {map:new Map([['nau_analytics_opt_out','1']])},
    {navigator:{doNotTrack:'1'}},
    {navigator:{globalPrivacyControl:true}},
    {blocked:true},
    {url:'https://example.com/nau-mpacc-guide/'},
    {url:site+'admin/'},
    {config:{enabled:false}}
  ]) {
    let reads=0;
    const navigator={...opts.navigator};
    for(const key of ['userAgent','platform','userAgentData','maxTouchPoints']) {
      Object.defineProperty(navigator,key,{get(){reads++;throw Error('device access before guard');}});
    }
    const env=boot({...opts,navigator});
    assert.equal(env.requests.length,0);
    assert.equal(reads,0);
  }
});
test('network failure never breaks the guide', async () => {
  assert.doesNotThrow(() => boot({reject:true}));
  await new Promise(resolve=>setImmediate(resolve));
});
test('visible time uses cumulative checkpoints linked only to the current page load', () => {
  const env = boot({url: site + '?private=secret#private'});
  env.advance(45000);
  assert.equal(env.requests.filter(r => r.payload.event === '$pageview').length, 1);
  const events = env.requests.filter(r => r.payload.event === 'nau_page_dwell');
  assert.deepEqual(events.map(r => r.payload.properties.dwell_visible_ms), [15000, 30000, 45000]);
  assert.deepEqual(events.map(r => r.payload.properties.dwell_sequence), [1, 2, 3]);
  for (const request of events) {
    assert.equal(request.payload.distinct_id, env.requests[0].payload.distinct_id);
    assert.equal(request.payload.properties.pageview_id, env.requests[0].payload.distinct_id);
    assert.equal(request.payload.properties.dwell_tracking_version, 'visible_v1');
    assert.equal(request.payload.properties.dwell_reason, 'heartbeat');
    assert.equal(request.init.keepalive, true);
    assert.equal(request.init.credentials, 'omit');
    assert.equal(request.init.referrerPolicy, 'no-referrer');
    assert.doesNotMatch(request.init.body, /secret|#private|\?private/);
  }
  assert.equal(env.map.size, 0);
  assert.deepEqual(env.writes, []);
});
test('hidden time is paused, quick leaves flush, and duplicate lifecycle events do not double count', () => {
  const env = boot();
  env.advance(6000);
  env.visibility('hidden');
  assert.equal(env.requests.at(-1).payload.properties.dwell_visible_ms, 6000);
  assert.equal(env.requests.at(-1).payload.properties.dwell_reason, 'hidden');
  assert.equal(env.timers.size, 0);
  env.advance(600000);
  env.visibility('hidden'); env.emit('pagehide', {persisted: false});
  assert.equal(env.requests.length, 2);
  env.emit('pageshow', {persisted: true});
  assert.equal(env.timers.size, 0);
  env.visibility('visible');
  env.advance(4000);
  env.emit('pagehide', {persisted: true});
  assert.equal(env.requests.at(-1).payload.properties.dwell_visible_ms, 10000);
  assert.equal(env.requests.at(-1).payload.properties.dwell_reason, 'pagehide');
  env.emit('pagehide', {persisted: true});
  assert.equal(env.requests.length, 3);
});
test('BFCache restores continue the same page without counting suspended time or a second pageview', () => {
  const env = boot();
  env.advance(5000);
  env.emit('pagehide', {persisted: true});
  env.advance(3600000);
  env.emit('pageshow', {persisted: true});
  env.advance(15000);
  assert.equal(env.requests.length, 3);
  assert.equal(env.requests.at(-1).payload.properties.dwell_visible_ms, 20000);
  assert.equal(env.requests.filter(r => r.payload.event === '$pageview').length, 1);
  assert.equal(env.requests[0].payload.distinct_id, env.requests.at(-1).payload.distinct_id);
  assert.equal(env.timers.size, 1);
});
test('initially hidden loads start timing only when visible', () => {
  const env = boot({initiallyHidden: true});
  assert.equal(env.timers.size, 0);
  env.advance(3600000);
  env.visibility('visible');
  env.advance(3000);
  env.visibility('hidden');
  assert.equal(env.requests.length, 2);
  assert.equal(env.requests.at(-1).payload.properties.dwell_visible_ms, 3000);
});
test('a missed visibility event never leaves a background heartbeat running', () => {
  const env = boot();
  env.advance(15000);
  env.window.document.visibilityState = 'hidden';
  env.advance(60000);
  assert.equal(env.requests.length, 2);
  assert.equal(env.requests.at(-1).payload.properties.dwell_visible_ms, 15000);
  assert.equal(env.timers.size, 0);
});
test('delayed callbacks cap sleep gaps and monotonic clock regressions add no negative duration', () => {
  const env = boot();
  env.advance(3600000, false);
  env.fireTimer();
  assert.equal(env.requests.at(-1).payload.properties.dwell_visible_ms, 20000);
  env.advance(-60000, false);
  env.emit('pagehide');
  assert.equal(env.requests.length, 2);
  assert.equal(env.requests.at(-1).payload.properties.dwell_visible_ms, 20000);
});
test('disabling capture cancels dwell timers and listeners without sending another event', () => {
  const env = boot();
  env.advance(2000);
  assert.equal(env.window.NAUAnalytics.disable(), true);
  assert.equal(env.timers.size, 0);
  for (const registry of [env.windowListeners, env.documentListeners]) {
    assert.equal([...registry.values()].reduce((sum, values) => sum + values.size, 0), 0);
  }
  env.advance(60000); env.visibility('hidden'); env.emit('pagehide'); env.emit('pageshow', {persisted: true});
  assert.equal(env.requests.length, 1);
});
test('owner, DNT, GPC, prior refusal and unsupported lifecycle APIs never start dwell capture', () => {
  for (const options of [
    {url: site + '?exclude_self=1'},
    {navigator: {doNotTrack: '1'}},
    {navigator: {globalPrivacyControl: true}},
    {map: new Map([['nau_privacy_consent_v1', JSON.stringify({version: 1, analytics: false})]])}
  ]) {
    const env = boot(options);
    env.advance(60000); env.visibility('hidden'); env.emit('pagehide');
    assert.equal(env.requests.length, 0);
    assert.equal(env.timers.size, 0);
  }
  for (const options of [{noTimers: true}, {noPerformance: true}, {noLifecycle: true}]) {
    const env = boot(options);
    env.advance(60000); env.visibility('hidden'); env.emit('pagehide');
    assert.equal(env.requests.length, 1);
    assert.equal(env.timers.size, 0);
  }
});
test('opt out set by another tab stops pending dwell capture', () => {
  const env = boot();
  env.advance(1000);
  env.map.set('nau_analytics_opt_out', '1');
  env.emit('storage', {key: 'nau_analytics_opt_out'});
  env.advance(60000); env.visibility('hidden');
  assert.equal(env.requests.length, 1);
  assert.equal(env.timers.size, 0);
});
test('dwell network failure does not interrupt lifecycle and later cumulative reports recover earlier totals', async () => {
  const env = boot({reject: true});
  assert.doesNotThrow(() => { env.advance(15000); env.advance(15000); env.visibility('hidden'); });
  assert.deepEqual(env.requests.filter(r => r.payload.event === 'nau_page_dwell').map(r => r.payload.properties.dwell_visible_ms), [15000, 30000]);
  await new Promise(resolve => setImmediate(resolve));
});
test('public HTML and source omit removed UI and media capability', async () => {
  const html=await fs.readFile(new URL('../dist/index.html', import.meta.url),'utf8');
  assert.doesNotMatch(html,/consent\.(?:js|css)|data-cookie-settings|自愿视频|站点管理|\.\/video\/|\.\/admin\//);
  assert.doesNotMatch(code,/getUserMedia|RTCPeerConnection|document\.cookie|setInterval|sessionStorage/);
  for(const path of ['../dist/video/index.html','../dist/admin/index.html','../dist/consent.js']) {
    await assert.rejects(fs.access(new URL(path,import.meta.url)));
  }
});
