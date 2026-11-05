const MAX_BODY_BYTES = 128 * 1024;
const SECURE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), display-capture=()',
  'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; media-src 'self' blob:; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...SECURE_HEADERS, 'Content-Type': 'application/json; charset=utf-8' } });
}

function runtimeConfig(env) {
  if (typeof env.SIGNAL_ORIGIN !== 'string' || typeof env.ADMIN_SHARED_SECRET !== 'string' || env.ADMIN_SHARED_SECRET.trim().length < 32) return null;
  try {
    const url = new URL(env.SIGNAL_ORIGIN);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    return { signalOrigin: url.origin, secret: env.ADMIN_SHARED_SECRET.trim() };
  } catch { return null; }
}

function publicSession(item, includeOffer) {
  const validDate = value => typeof value === 'string' ? Number.isFinite(Date.parse(value)) : typeof value === 'number' && Number.isFinite(value);
  if (!item || !/^[A-Za-z0-9_-]{16,80}$/.test(item.id || '') || !validDate(item.createdAt) || !validDate(item.expiresAt) || !['waiting', 'answered'].includes(item.status)) return null;
  const value = { id: item.id, createdAt: item.createdAt, expiresAt: item.expiresAt, status: item.status };
  if (includeOffer) {
    if (item.offer?.type !== 'offer' || typeof item.offer.sdp !== 'string' || !item.offer.sdp.trim()) return null;
    value.offer = { type: 'offer', sdp: item.offer.sdp };
  }
  return value;
}

async function readAnswer(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) return { error: 'json_required', status: 415 };
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { error: 'request_too_large', status: 413 };
  const reader = request.body?.getReader();
  if (!reader) return { error: 'invalid_answer', status: 400 };
  const chunks = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY_BYTES) { await reader.cancel(); return { error: 'request_too_large', status: 413 }; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (body?.answer?.type !== 'answer' || typeof body.answer.sdp !== 'string' || !body.answer.sdp.trim()) return { error: 'invalid_answer', status: 400 };
    return { value: { answer: { type: 'answer', sdp: body.answer.sdp } } };
  } catch { return { error: 'invalid_answer', status: 400 }; }
}

function ownerClient() {
  'use strict';
  const list = document.getElementById('session-list');
  const notice = document.getElementById('list-notice');
  const video = document.getElementById('remote-video');
  const status = document.getElementById('view-status');
  const activeLabel = document.getElementById('active-id');
  const remaining = document.getElementById('remaining');
  const endButton = document.getElementById('end-session');
  const refreshButton = document.getElementById('refresh-sessions');
  let sessions = [], active = null, sequence = 0, listLoading = false;

  function timeMs(value) {
    if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
    return Date.parse(value);
  }
  function secondsLeft(expiresAt) { return Math.max(0, Math.ceil((timeMs(expiresAt) - Date.now()) / 1000)); }
  function duration(value) { const s = Math.max(0, value); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  async function api(path, options = {}) {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
    let body = {};
    try { body = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(response.status === 404 ? '对方已停止共享，或会话已到期。' : response.status === 409 ? '此会话已由另一个站主管理窗口接收。' : response.status === 401 || response.status === 403 ? '当前账号没有访问这项操作的权限。' : response.status === 503 ? '视频交流后台尚未配置完成。' : '暂时无法连接视频服务，请稍后重试。');
      error.status = response.status;
      throw error;
    }
    return body;
  }
  function renderList() {
    list.replaceChildren();
    const visible = sessions.filter(s => /^[A-Za-z0-9_-]{16,80}$/.test(s.id || '') && Number.isFinite(timeMs(s.expiresAt)) && secondsLeft(s.expiresAt) > 0);
    document.getElementById('session-count').textContent = String(visible.length);
    if (!visible.length) {
      const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = '目前没有访客主动共享画面。'; list.append(empty); return;
    }
    visible.forEach(session => {
      const item = document.createElement('article'); item.className = 'session-card';
      const copy = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = '会话 ' + session.id.slice(0, 8);
      const detail = document.createElement('p'); detail.textContent = (session.status === 'answered' ? '已协商视频连接' : '等待站主查看') + ' · 剩余 ' + duration(secondsLeft(session.expiresAt));
      copy.append(title, detail);
      const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary';
      button.textContent = active?.id === session.id ? '当前会话' : session.status === 'answered' ? '连接已协商' : '查看此共享';
      button.disabled = active?.id === session.id || session.status === 'answered';
      button.addEventListener('click', () => watch(session.id));
      item.append(copy, button); list.append(item);
    });
  }
  async function refreshSessions() {
    if (listLoading || document.hidden) return;
    listLoading = true; refreshButton.disabled = true;
    try {
      const body = await api('/api/sessions');
      sessions = Array.isArray(body.sessions) ? body.sessions : [];
      notice.textContent = '仅列出仍有效、由访客主动发起的共享。';
      renderList();
    } catch (error) { notice.textContent = error.message; }
    finally { listLoading = false; refreshButton.disabled = false; }
  }
  function clearActive(message) {
    const old = active; active = null; sequence += 1;
    if (old) {
      clearInterval(old.poll); clearInterval(old.clock); clearTimeout(old.connectDeadline); clearTimeout(old.disconnectDeadline);
      old.controller.abort();
      old.pc.ontrack = null; old.pc.onconnectionstatechange = null; old.pc.close();
    }
    video.pause(); video.srcObject = null;
    activeLabel.textContent = '尚未选择共享会话'; remaining.textContent = '';
    endButton.disabled = true; status.textContent = message || '请选择一项由访客主动发起的共享。';
    renderList();
    return old;
  }
  async function finish(message, tellSender) {
    const old = clearActive(message);
    if (old && tellSender) {
      try { await api('/api/sessions/' + old.id, { method: 'DELETE' }); }
      catch (error) { if (error.status !== 404) notice.textContent = '本机已断开。结束通知暂未送达，对方页面会在连接中断或到期后关闭摄像头。'; }
    }
    refreshSessions();
  }
  function gatherComplete(pc, signal) {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', changed); signal.removeEventListener('abort', aborted); };
      const done = (error) => { if (settled) return; settled = true; cleanup(); error ? reject(error) : resolve(); };
      const changed = () => { if (pc.iceGatheringState === 'complete') done(); };
      const aborted = () => done(new DOMException('Aborted', 'AbortError'));
      const timer = setTimeout(() => done(new Error('网络候选收集超时。当前连接不含 TURN 中继，部分网络无法直接连通。')), 12000);
      pc.addEventListener('icegatheringstatechange', changed); signal.addEventListener('abort', aborted, { once: true });
      if (signal.aborted) aborted(); else changed();
    });
  }
  async function watch(id) {
    if (active) await finish('上一会话已结束。', true);
    if (typeof RTCPeerConnection !== 'function') { status.textContent = '当前浏览器不支持实时视频连接。'; return; }
    const run = ++sequence;
    status.textContent = '正在读取访客主动提交的视频共享请求…';
    try {
      const item = await api('/api/sessions/' + id);
      if (run !== sequence) return;
      if (!item.offer || item.offer.type !== 'offer' || typeof item.offer.sdp !== 'string' || !Number.isFinite(timeMs(item.expiresAt)) || secondsLeft(item.expiresAt) === 0) throw new Error('共享请求不可用或已经到期。');
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] });
      const state = { id, pc, run, expiresAt: item.expiresAt, controller: new AbortController(), checking: false };
      active = state; endButton.disabled = false; activeLabel.textContent = '正在查看：会话 ' + id.slice(0, 8);
      renderList();
      const current = () => active === state && sequence === run;
      const showConnected = () => { if (current() && pc.connectionState === 'connected') status.textContent = video.readyState >= 2 ? '正在接收共享画面。对方可随时停止。' : '连接已建立，正在等待视频画面…'; };
      video.onplaying = showConnected;
      pc.ontrack = event => {
        if (!current()) return;
        if (event.track.kind !== 'video') { event.track.stop(); return; }
        video.srcObject = new MediaStream([event.track]);
        video.play().catch(() => { if (current()) status.textContent = '画面已到达，请点视频上的播放按钮查看。'; });
        event.track.addEventListener('ended', () => { if (current()) finish('对方已结束视频共享。', false); }, { once: true });
        showConnected();
      };
      pc.onconnectionstatechange = () => {
        if (!current()) return;
        if (pc.connectionState === 'connected') { clearTimeout(state.connectDeadline); clearTimeout(state.disconnectDeadline); showConnected(); }
        else if (pc.connectionState === 'failed') finish('视频连接失败。部分网络需要额外的 TURN 中继；当前会话已停止。', true);
        else if (pc.connectionState === 'disconnected') {
          status.textContent = '视频连接中断，正在等待网络恢复…';
          clearTimeout(state.disconnectDeadline);
          state.disconnectDeadline = setTimeout(() => { if (current()) finish('连接持续中断，本次共享已结束。', true); }, 10000);
        }
      };
      await pc.setRemoteDescription(item.offer);
      for (const transceiver of pc.getTransceivers()) transceiver.direction = transceiver.receiver.track.kind === 'video' ? 'recvonly' : 'inactive';
      await pc.setLocalDescription(await pc.createAnswer());
      status.textContent = '正在协商点对点连接，请保持页面打开…';
      await gatherComplete(pc, state.controller.signal);
      if (!current()) return;
      await api('/api/sessions/' + id + '/answer', { method: 'POST', signal: state.controller.signal, body: JSON.stringify({ answer: { type: 'answer', sdp: pc.localDescription.sdp } }) });
      if (!current()) return;
      state.connectDeadline = setTimeout(() => { if (current() && pc.connectionState !== 'connected') finish('未能建立视频连接。当前网络可能需要 TURN 中继，本次共享已停止。', true); }, 25000);
      const clock = () => {
        if (!current()) return;
        const left = secondsLeft(state.expiresAt); remaining.textContent = '剩余 ' + duration(left);
        if (left === 0) finish('本次共享已到期，连接已关闭。', true);
      };
      clock(); state.clock = setInterval(clock, 1000);
      state.poll = setInterval(async () => {
        if (!current() || state.checking) return;
        state.checking = true;
        try { await api('/api/sessions/' + id, { signal: state.controller.signal }); }
        catch (error) { if (current() && error.status === 404) finish('对方已停止共享，或本次共享已到期。', false); else if (current() && error.name !== 'AbortError') finish('无法确认共享状态，已断开画面。', true); }
        finally { state.checking = false; }
      }, 3000);
    } catch (error) {
      if (run === sequence || active?.run === run) {
        if (active) await finish(error.name === 'AbortError' ? '连接已结束。' : error.message, error.status !== 409);
        else status.textContent = error.message;
      }
    }
  }
  endButton.addEventListener('click', () => finish('已结束本次共享并断开画面。', true));
  refreshButton.addEventListener('click', refreshSessions);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshSessions(); });
  window.addEventListener('pagehide', () => {
    const old = clearActive('连接已关闭。');
    if (old) fetch('/api/sessions/' + old.id, { method: 'DELETE', credentials: 'same-origin', keepalive: true }).catch(() => {});
  });
  setInterval(refreshSessions, 5000);
  refreshSessions();
}

const OWNER_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>网站管理员的视频会话</title><style>
:root{font-family:system-ui,"PingFang SC","Microsoft YaHei",sans-serif;color:#183b43;background:#f6f5ee}*{box-sizing:border-box}body{margin:0}.shell{max-width:1120px;margin:auto;padding:34px 24px 60px}a{color:#24695f}.eyebrow{font-size:12px;letter-spacing:.16em;color:#527b72;font-weight:700}h1{font-size:32px;margin:12px 0 14px;letter-spacing:-.04em}p{line-height:1.85;color:#576d70}header{max-width:840px}.note{border-left:3px solid #668c7a;padding:10px 18px;background:#edf1e8;font-size:14px}.grid{display:grid;grid-template-columns:minmax(280px,350px) minmax(0,1fr);gap:24px;margin-top:28px}.panel{background:#fff;border:1px solid #dae1da;border-radius:18px;padding:24px}h2{font-size:19px;margin:0 0 16px}.panel-head{display:flex;align-items:center;justify-content:space-between;gap:14px}.panel-head h2{margin:0}button{font:inherit;cursor:pointer;border:0;border-radius:10px;padding:11px 15px;font-weight:600;background:#1d5e56;color:white}button:disabled{cursor:default;opacity:.5}.secondary{background:#eff3ed;color:#275e52;border:1px solid #d6e0d5;font-size:13px}.danger{background:#8a3f31}.session-card{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 0;border-bottom:1px solid #e6ebe3}.session-card:last-child{border-bottom:0}.session-card strong{font-size:14px}.session-card p{font-size:12px;margin:5px 0}.empty{padding:24px 0}.small{font-size:13px;line-height:1.8}.viewer{background:#132c32;border-radius:12px;aspect-ratio:4/3;display:flex;align-items:center;overflow:hidden;position:relative}video{display:block;width:100%;height:100%;object-fit:contain;background:#132c32}.view-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}.view-head strong{font-size:14px}.view-head span{font-variant-numeric:tabular-nums;font-size:13px;color:#688078}#view-status{min-height:50px;font-size:14px}#session-count{background:#e9f1e8;color:#2f6553;border-radius:20px;padding:3px 9px;font-size:13px}.warning{color:#7d5846}button:focus-visible,a:focus-visible{outline:3px solid #c99565;outline-offset:4px}@media(max-width:760px){.grid{grid-template-columns:1fr}.shell{padding:25px 16px 40px}h1{font-size:27px}.panel{padding:20px}.view-head{flex-wrap:wrap}}</style></head><body><main class="shell"><header><a href="https://nishino0525nanase.github.io/nau-mpacc-guide/">← 返回南审指南</a><p class="eyebrow">OWNER · LIVE SHARING</p><h1>网站管理员的视频会话</h1><p><strong>视频接收方：网站管理员（GitHub：Nishino0525Nanase）</strong></p><p>这里只显示访客在独立共享页中明确同意、主动开启的摄像头会话。阅读指南、接受 Cookie 或允许匿名统计，都不会开启摄像头。</p><p class="note">后台只接收当前实时画面，不录制、不截帧、不接收音频。访客始终能看到本地预览与共享状态，并可随时停止。单次共享最多 10 分钟。</p></header><div class="grid"><section class="panel"><div class="panel-head"><h2>有效共享 <span id="session-count">0</span></h2><button class="secondary" id="refresh-sessions" type="button">刷新</button></div><p class="small" id="list-notice" role="status">正在读取主动共享会话…</p><div id="session-list"></div></section><section class="panel"><div class="view-head"><strong id="active-id">尚未选择共享会话</strong><span id="remaining"></span></div><div class="viewer"><video id="remote-video" autoplay playsinline muted controls aria-label="访客主动共享的实时摄像头画面"></video></div><p id="view-status" role="status" aria-live="polite">请选择一项由访客主动发起的共享。</p><button class="danger" id="end-session" type="button" disabled>结束本次共享</button><p class="small warning">部分校园网、移动网络或防火墙环境需要 TURN 中继。无法直连时会显示失败并停止，不会把“正在等待”当成“已收到画面”。</p></section></div></main><script>(${ownerClient.toString()})();</script></body></html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const config = runtimeConfig(env);
    if (!config) return json({ error: 'video_service_not_configured' }, 503);
    if (url.pathname === '/' && (request.method === 'GET' || request.method === 'HEAD')) {
      return new Response(request.method === 'HEAD' ? null : OWNER_HTML, { headers: { ...SECURE_HEADERS, 'Content-Type': 'text/html; charset=utf-8' } });
    }
    const match = /^\/api\/sessions(?:\/([A-Za-z0-9_-]{16,80})(\/answer)?)?$/.exec(url.pathname);
    if (!match || url.search) return json({ error: 'not_found' }, 404);
    const [, id, answer] = match;
    const allowed = !id ? request.method === 'GET' : answer ? request.method === 'POST' : ['GET', 'DELETE'].includes(request.method);
    if (!allowed) return json({ error: 'method_not_allowed' }, 405);
    if (request.method !== 'GET') {
      const origin = request.headers.get('Origin');
      if ((origin && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: 'origin_not_allowed' }, 403);
    }
    let body;
    if (answer) {
      const parsed = await readAnswer(request);
      if (parsed.error) return json({ error: parsed.error }, parsed.status);
      body = JSON.stringify(parsed.value);
    }
    const upstreamPath = '/owner/sessions' + (id ? '/' + id : '') + (answer ? '/answer' : '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const upstream = await fetch(config.signalOrigin + upstreamPath, {
        method: request.method,
        headers: { 'Authorization': 'Bearer ' + config.secret, 'Accept': 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body, redirect: 'error', signal: controller.signal
      });
      if (!/^application\/json(?:;|$)/i.test(upstream.headers.get('Content-Type') || '')) return json({ error: 'upstream_unavailable' }, 502);
      const responseBytes = await upstream.arrayBuffer();
      if (responseBytes.byteLength > 1024 * 1024) return json({ error: 'upstream_response_too_large' }, 502);
      let data;
      try { data = JSON.parse(new TextDecoder().decode(responseBytes)); } catch { return json({ error: 'upstream_unavailable' }, 502); }
      if (!upstream.ok) {
        const allowedErrors = ['unauthorized', 'session_unavailable', 'invalid_answer', 'method_not_allowed', 'origin_not_allowed', 'service_unavailable', 'request_too_large', 'invalid_json'];
        return json({ error: allowedErrors.includes(data?.error) ? data.error : 'upstream_request_failed' }, upstream.status);
      }
      if (request.method === 'GET' && !id) {
        if (!Array.isArray(data?.sessions)) return json({ error: 'upstream_unavailable' }, 502);
        return json({ sessions: data.sessions.map(item => publicSession(item, false)).filter(Boolean) }, upstream.status);
      }
      if (request.method === 'GET') {
        const session = publicSession(data, true);
        return session ? json(session, upstream.status) : json({ error: 'upstream_unavailable' }, 502);
      }
      return json({ ok: data?.ok === true, ...(answer ? { status: 'answered' } : {}) }, upstream.status);
    } catch { return json({ error: 'upstream_unavailable' }, 502); }
    finally { clearTimeout(timeout); }
  }
};
