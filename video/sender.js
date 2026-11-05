(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.NAUVideoSender = api; if (root.document) api.mount(root); }
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var CONSENT_VERSION = 'camera-share-v1';
  var DEFAULT_ICE = [{ urls: 'stun:stun.cloudflare.com:3478' }];
  function parseConfig(value) {
    try {
      if (!value || typeof value.signalOrigin !== 'string') return null;
      var u = new URL(value.signalOrigin);
      if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.pathname !== '/') return null;
      return { signalOrigin: u.origin, iceServers: Array.isArray(value.iceServers) ? value.iceServers : DEFAULT_ICE };
    } catch (_) { return null; }
  }
  function expiryTime(value) { return typeof value === 'number' ? value : Date.parse(value); }
  function createSender(options) {
    var o = options || {}, el = o.elements, config = parseConfig(o.config);
    var timers = o.timers || { setTimeout: setTimeout, clearTimeout: clearTimeout };
    var now = o.now || Date.now, stream = null, peer = null, session = null;
    var state = 'idle', epoch = 0, pollTimer = null, deadlineTimer = null, networkTimer = null, gatherCancel = null, countdownTimer = null;
    var destroyed = false, api = null, pendingRequests = new Set();
    function status(text, mode) {
      el.status.textContent = text;
      el.badge.textContent = mode === 'sharing' ? '正在共享' : mode === 'waiting' ? '等待连接' : mode === 'preview' ? '仅本地预览' : mode === 'starting' ? '准备连接' : '未开启';
      el.badge.dataset.state = mode === 'sharing' || mode === 'waiting' || mode === 'starting' ? 'sharing' : mode;
      el.dot.dataset.state = el.badge.dataset.state;
    }
    function renderButtons() {
      el.preview.disabled = destroyed || ['requesting', 'starting', 'waiting', 'sharing'].includes(state) || !!stream;
      el.share.disabled = destroyed || !config || !stream || !el.consent.checked || state !== 'preview';
      el.stop.disabled = !stream && !['requesting', 'starting', 'waiting', 'sharing'].includes(state);
      el.consent.disabled = ['starting', 'waiting', 'sharing'].includes(state);
    }
    function stopTracks(s) { if (s && typeof s.getTracks === 'function') s.getTracks().forEach(function (track) { try { track.stop(); } catch (_) {} }); }
    function clearTimer(name) { if (name !== null) timers.clearTimeout(name); }
    function sendDelete(s) {
      if (!config || !s || !s.id || !s.senderToken || typeof o.fetch !== 'function') return;
      try {
        var r = o.fetch(config.signalOrigin + '/api/sessions/' + encodeURIComponent(s.id), { method: 'DELETE', headers: { Authorization: 'Bearer ' + s.senderToken }, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', keepalive: true, mode: 'cors' });
        if (r && r.catch) r.catch(function () {});
      } catch (_) {}
    }
    function stop(message) {
      epoch += 1;
      if (gatherCancel) { var cancel = gatherCancel; gatherCancel = null; cancel(); }
      [pollTimer, deadlineTimer, networkTimer, countdownTimer].forEach(clearTimer);
      pollTimer = deadlineTimer = networkTimer = countdownTimer = null;
      pendingRequests.forEach(function (pending) { clearTimer(pending.timeout); if (pending.controller) { try { pending.controller.abort(); } catch (_) {} } });
      pendingRequests.clear();
      var oldSession = session; session = null;
      if (peer) { var oldPeer = peer; peer = null; oldPeer.onconnectionstatechange = null; try { oldPeer.close(); } catch (_) {} }
      var oldStream = stream; stream = null; stopTracks(oldStream); el.video.srcObject = null; el.empty.hidden = false;
      state = 'idle'; el.consent.checked = false; el.countdown.hidden = true;
      status(message || '摄像头已关闭，视频共享已停止。', 'idle'); renderButtons(); sendDelete(oldSession);
    }
    function request(path, method, body, token) {
      var init = { method: method, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', mode: 'cors', headers: {} };
      if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
      if (token) init.headers.Authorization = 'Bearer ' + token;
      var controller = o.AbortController ? new o.AbortController() : null;
      if (controller) init.signal = controller.signal;
      var timeout = timers.setTimeout(function () { if (controller) controller.abort(); }, 12000);
      var pending = { controller: controller, timeout: timeout }; pendingRequests.add(pending);
      return Promise.resolve().then(function () { return o.fetch(config.signalOrigin + path, init); }).then(function (response) {
        if (!response.ok) { var e = new Error(response.status === 404 ? 'session_unavailable' : 'service_unavailable'); e.status = response.status; throw e; }
        return response.json();
      }).finally(function () { clearTimer(timeout); pendingRequests.delete(pending); });
    }
    function waitForIce(pc) {
      if (pc.iceGatheringState === 'complete') return Promise.resolve();
      return new Promise(function (resolve, reject) {
        var finished = false;
        function finish(error) { if (finished) return; finished = true; clearTimer(timeout); pc.removeEventListener('icegatheringstatechange', change); gatherCancel = null; error ? reject(error) : resolve(); }
        function change() { if (pc.iceGatheringState === 'complete') finish(); }
        var timeout = timers.setTimeout(function () { finish(new Error('ice_timeout')); }, 12000);
        gatherCancel = function () { finish(new Error('cancelled')); };
        pc.addEventListener('icegatheringstatechange', change); change();
      });
    }
    function countDown(myEpoch) {
      if (!session || myEpoch !== epoch) return;
      var remaining = expiryTime(session.expiresAt) - now();
      if (remaining <= 0) { stop('已到本次共享时限，摄像头已关闭。'); return; }
      var seconds = Math.ceil(remaining / 1000);
      el.countdown.hidden = false; el.countdown.textContent = '本次共享剩余 ' + Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
      countdownTimer = timers.setTimeout(function () { countDown(myEpoch); }, 1000);
    }
    async function poll(myEpoch) {
      if (!session || !peer || myEpoch !== epoch) return;
      var current = session;
      try {
        var result = await request('/api/sessions/' + encodeURIComponent(current.id), 'GET', undefined, current.senderToken);
        if (myEpoch !== epoch || !session || !peer) return;
        if (result.answer && !peer.remoteDescription) {
          if (result.answer.type !== 'answer' || typeof result.answer.sdp !== 'string') throw new Error('invalid_answer');
          await peer.setRemoteDescription(result.answer);
          if (myEpoch !== epoch || !peer) return;
          status('站主已回应，正在建立视频连接；尚未确认连接成功。', 'waiting');
          clearTimer(networkTimer); networkTimer = timers.setTimeout(function () { if (myEpoch === epoch && peer && peer.connectionState !== 'connected') stop('当前网络未能建立视频连接，摄像头已关闭。部分网络需要另行配置中继服务。'); }, 25000);
        }
        pollTimer = timers.setTimeout(function () { poll(myEpoch); }, 2500);
      } catch (error) {
        if (myEpoch !== epoch) return;
        stop(error.status === 404 ? '共享会话已结束或过期，摄像头已关闭。' : '视频服务连接中断，摄像头已关闭。请确认网络后重新选择是否共享。');
      }
    }
    async function preview() {
      if (destroyed || state !== 'idle' || stream) return false;
      if (!o.mediaDevices || typeof o.mediaDevices.getUserMedia !== 'function') { status('当前浏览器不支持摄像头预览，或页面不在安全连接中。仍可返回指南阅读。', 'idle'); return false; }
      var myEpoch = ++epoch; state = 'requesting'; status('等待浏览器摄像头许可；允许后仅在本机预览，不会共享给站主。', 'starting'); renderButtons();
      try {
        var captured = await o.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 24 } }, audio: false });
        if (destroyed || myEpoch !== epoch) { stopTracks(captured); return false; }
        stream = captured; el.video.srcObject = captured; el.empty.hidden = true;
        if (el.video.play) { var play = el.video.play(); if (play && play.catch) play.catch(function () {}); }
        captured.getTracks().forEach(function (track) { if (track.addEventListener) track.addEventListener('ended', function () { if (stream === captured) stop('摄像头已由浏览器或设备关闭，共享已停止。'); }, { once: true }); });
        state = 'preview'; status('仅本地预览，画面尚未共享给站主。', 'preview'); renderButtons(); return true;
      } catch (error) {
        if (myEpoch !== epoch) return false;
        state = 'idle';
        status(error && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') ? '未获得摄像头许可，没有共享任何画面。你可以继续阅读指南。' : error && error.name === 'NotFoundError' ? '没有找到可用摄像头，没有共享画面。' : '摄像头未能开启。请检查设备和浏览器权限，没有共享画面。', 'idle'); renderButtons(); return false;
      }
    }
    async function share() {
      if (destroyed || !config || !stream || state !== 'preview' || !el.consent.checked) { if (!el.consent.checked) status('如需共享，请先单独勾选摄像头共享同意。仅预览不会传给站主。', stream ? 'preview' : 'idle'); return false; }
      if (typeof o.PeerConnection !== 'function' || typeof o.fetch !== 'function') { stop('当前浏览器不支持实时视频连接，摄像头已关闭。'); return false; }
      var myEpoch = ++epoch; state = 'starting'; status('正在准备你主动选择的视频连接，可随时停止并关闭摄像头。', 'starting'); renderButtons();
      try {
        var pc = new o.PeerConnection({ iceServers: config.iceServers }); peer = pc;
        stream.getVideoTracks().forEach(function (track) { pc.addTrack(track, stream); });
        pc.onconnectionstatechange = function () {
          if (myEpoch !== epoch || peer !== pc) return;
          if (pc.connectionState === 'connected') { clearTimer(networkTimer); networkTimer = null; state = 'sharing'; status('正在向站主共享实时画面。仅视频，无音频；你可随时停止。', 'sharing'); renderButtons(); }
          else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') stop('视频连接已结束或失败，摄像头已关闭。部分网络可能需要中继服务。');
          else if (pc.connectionState === 'disconnected') { status('视频连接中断，正在关闭共享。', 'waiting'); clearTimer(networkTimer); networkTimer = timers.setTimeout(function () { if (myEpoch === epoch && peer === pc && pc.connectionState !== 'connected') stop('视频连接中断，摄像头已关闭。'); }, 5000); }
        };
        await pc.setLocalDescription(await pc.createOffer()); await waitForIce(pc);
        if (myEpoch !== epoch || peer !== pc) return false;
        var created = await request('/api/sessions', 'POST', { offer: { type: 'offer', sdp: pc.localDescription.sdp }, consentVersion: CONSENT_VERSION });
        if (!created || !/^[A-Za-z0-9_-]{8,}$/.test(created.id || '') || !/^[A-Za-z0-9_-]{20,}$/.test(created.senderToken || '') || !Number.isFinite(expiryTime(created.expiresAt)) || expiryTime(created.expiresAt) <= now()) throw new Error('invalid_session');
        if (myEpoch !== epoch || peer !== pc) { sendDelete(created); return false; }
        session = { id: created.id, senderToken: created.senderToken, expiresAt: Math.min(expiryTime(created.expiresAt), now() + 600000) };
        state = 'waiting'; status('等待站主连接。摄像头预览保持可见，你可随时停止共享。', 'waiting'); renderButtons(); countDown(myEpoch);
        clearTimer(deadlineTimer); deadlineTimer = timers.setTimeout(function () { if (myEpoch === epoch) stop('已到本次共享时限，摄像头已关闭。'); }, Math.max(0, session.expiresAt - now()));
        poll(myEpoch); return true;
      } catch (error) {
        if (myEpoch !== epoch) return false;
        stop(error.message === 'ice_timeout' ? '未能完成网络连接准备，摄像头已关闭。部分网络需要中继服务。' : '未能建立共享会话，摄像头已关闭。没有确认连接成功，请稍后重新选择是否共享。'); return false;
      }
    }
    function consentChanged() { renderButtons(); }
    function destroy() { destroyed = true; stop('页面已离开前台，摄像头已关闭。'); }
    el.preview.addEventListener('click', preview); el.share.addEventListener('click', share); el.stop.addEventListener('click', function () { stop(); }); el.consent.addEventListener('change', consentChanged);
    if (!config) el.notice.textContent = '视频共享尚未启用。你仍可选择仅在本机预览；画面不会因此离开本机，也不会共享给站主。';
    else el.notice.textContent = '';
    renderButtons();
    api = { preview: preview, share: share, stop: stop, destroy: destroy, consentChanged: consentChanged, getState: function () { return state; }, isConfigured: function () { return !!config; } };
    return api;
  }
  function mount(win) {
    var doc = win.document, ids = { video: 'local-video', empty: 'video-empty', status: 'video-status', badge: 'state-badge', dot: 'state-dot', countdown: 'countdown', preview: 'preview-video', share: 'share-video', stop: 'stop-video', consent: 'camera-consent', notice: 'setup-notice' }, elements = {};
    Object.keys(ids).forEach(function (key) { elements[key] = doc.getElementById(ids[key]); });
    if (Object.values(elements).some(function (v) { return !v; })) return null;
    var controller = createSender({ elements: elements, config: win.NAU_VIDEO_PUBLIC, mediaDevices: win.navigator.mediaDevices, PeerConnection: win.RTCPeerConnection, fetch: win.fetch ? win.fetch.bind(win) : null, AbortController: win.AbortController });
    win.addEventListener('pagehide', function () { controller.stop('页面已关闭，摄像头已停止。'); });
    doc.addEventListener('visibilitychange', function () { if (doc.hidden) controller.stop('页面已离开前台，摄像头已关闭。'); });
    return controller;
  }
  return { createSender: createSender, mount: mount, parseConfig: parseConfig, consentVersion: CONSENT_VERSION };
}));
