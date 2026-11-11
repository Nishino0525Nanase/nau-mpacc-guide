/* Page-open counts and approximate foreground-visible duration. No cookies, visitor ID, SDK or replay.
 * Each page load gets an ephemeral random event ID; never interpret it as UV.
 * Owner exclusion uses a local preference, processed before any capture.
 * Device categories are estimates, not a hardware model or persistent identity.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.NAUAnalytics) return;
  var OPT_OUT = 'nau_analytics_opt_out';
  var OLD_ID = 'nau_mpacc_guide_anon_id_v1';
  var OLD_CHOICE = 'nau_privacy_consent_v1';
  var disabled = false;
  var attempted = false;
  var stopDwell = function () {};
  var DWELL_VERSION = 'visible_v1';
  function storage() {
    try { return window.localStorage; } catch (_) { return null; }
  }
  function clearOldIdentity() {
    try { var s = storage(); if (s) s.removeItem(OLD_ID); } catch (_) {}
  }
  function isOptedOut() {
    if (disabled) return true;
    var n = window.navigator || {};
    var dnt = String(n.doNotTrack || window.doNotTrack || n.msDoNotTrack || '').toLowerCase();
    if (dnt === '1' || dnt === 'yes' || n.globalPrivacyControl === true) return true;
    try {
      var s = storage();
      if (!s || s.getItem(OPT_OUT) === '1') return true;
      // Respect an explicit refusal from an earlier release.
      var raw = s.getItem(OLD_CHOICE);
      if (raw) {
        var choice = JSON.parse(raw);
        if (choice && choice.version === 1 && choice.analytics === false) return true;
      }
      return false;
    } catch (_) { return true; }
  }
  function disable() {
    disabled = true;
    stopDwell();
    clearOldIdentity();
    try {
      var s = storage();
      if (!s) return false;
      s.setItem(OPT_OUT, '1');
      return s.getItem(OPT_OUT) === '1';
    } catch (_) { return false; }
  }
  function config() {
    var c = window.NAU_ANALYTICS;
    if (!c || c.enabled === false || typeof c.token !== 'string' || !/^phc_[A-Za-z0-9_-]{10,}$/.test(c.token)) return null;
    if (typeof c.allowedHost !== 'string' || typeof c.pathPrefix !== 'string') return null;
    if (!c.allowedHost || /[/:?#\s]/.test(c.allowedHost) || c.pathPrefix.charAt(0) !== '/' || /[?#]/.test(c.pathPrefix)) return null;
    try {
      var api = new URL(c.apiHost);
      if (!['https://us.i.posthog.com', 'https://eu.i.posthog.com'].includes(api.origin)) return null;
      if (api.pathname !== '/' || api.search || api.hash || api.username || api.password) return null;
      return { token: c.token, apiHost: api.origin, host: c.allowedHost.toLowerCase(), prefix: c.pathPrefix.replace(/\/?$/, '/') };
    } catch (_) { return null; }
  }
  function allowedPage(c) {
    try {
      var p = new URL(window.location.href);
      if (p.protocol !== 'https:' || p.hostname.toLowerCase() !== c.host) return null;
      if (c.host === 'localhost' || c.host.endsWith('.localhost') || /^127\./.test(c.host) || c.host === '0.0.0.0' || c.host === '[::1]') return null;
      if (![c.prefix, c.prefix.slice(0, -1), c.prefix + 'index.html'].includes(p.pathname)) return null;
      if (p.searchParams.has('admin') || /^#\/?(?:admin|dashboard)(?:[/?]|$)/i.test(p.hash)) return null;
      return p;
    } catch (_) { return null; }
  }
  function notifyOwner(saved) {
    var doc = window.document;
    var target = doc && doc.getElementById && doc.getElementById('toast');
    if (!target) return;
    target.textContent = saved ? '已排除当前浏览器：以后的访问不计入统计。' : '本次访问已排除，但设置未能保存；下次请仍使用排除链接打开。';
    if (target.classList) target.classList.add('visible');
  }
  function coarseDevice(n) {
    var out = { type: '其他', os: '未知', browser: '未知' };
    try {
      n = n || {};
      var ua = String(n.userAgent || '');
      var platform = String(n.platform || '');
      var hints = n.userAgentData || {};
      var hintPlatform = String(hints.platform || '');
      var mobile = typeof hints.mobile === 'boolean' ? hints.mobile : null;
      var brands = Array.isArray(hints.brands) ? hints.brands : [];
      function brand(name) {
        return brands.some(function (item) { return item && item.brand === name; });
      }
      var tablet = /iPad/i.test(ua) || (platform === 'MacIntel' && Number(n.maxTouchPoints) > 1);
      var iosPhone = /iPhone|iPod/i.test(ua);
      var android = hintPlatform === 'Android' || /Android/i.test(ua);
      if (tablet || /Tablet|PlayBook/i.test(ua)) out.type = '平板';
      else if (iosPhone || /Windows Phone/i.test(ua) || mobile === true || (android && /Mobile/i.test(ua))) out.type = '手机';
      // An Android UA without Mobile may be a tablet or a phone in desktop mode.
      else if (!android && (/Windows|macOS|Chrome OS|Linux/i.test(hintPlatform) || /Win|Mac|Linux|CrOS|X11/i.test(platform + ' ' + ua))) out.type = '电脑';

      if (tablet) out.os = 'iPadOS';
      else if (iosPhone) out.os = 'iOS';
      else if (/Windows Phone/i.test(ua)) out.os = 'Windows Phone';
      else if (android) out.os = 'Android';
      else if (hintPlatform === 'Windows' || /Windows NT|Win32|Win64/i.test(ua + ' ' + platform)) out.os = 'Windows';
      else if (hintPlatform === 'Chrome OS' || /CrOS/i.test(ua)) out.os = 'Chrome OS';
      else if (hintPlatform === 'macOS' || /Macintosh|MacIntel|MacPPC|Mac OS X/i.test(ua + ' ' + platform)) out.os = 'macOS';
      else if (hintPlatform === 'Linux' || /Linux|X11/i.test(ua + ' ' + platform)) out.os = 'Linux';

      if (/MicroMessenger/i.test(ua)) out.browser = '微信内置浏览器';
      else if (/Edg(?:A|iOS)?\//i.test(ua) || brand('Microsoft Edge')) out.browser = 'Edge';
      else if (/OPR\/|OPiOS\/|OPT\//i.test(ua) || brand('Opera')) out.browser = 'Opera';
      else if (/SamsungBrowser\//i.test(ua)) out.browser = '三星浏览器';
      else if (/Firefox\/|FxiOS\//i.test(ua)) out.browser = 'Firefox';
      else if (/;\s*wv\)/i.test(ua)) out.browser = 'Android WebView';
      else if (/Chrome\/|CriOS\//i.test(ua) || brand('Google Chrome')) out.browser = 'Chrome';
      else if (/Version\/.+Safari\//i.test(ua)) out.browser = 'Safari';
      else if (brand('Chromium')) out.browser = 'Chromium系浏览器';
    } catch (_) {}
    return out;
  }
  function send(c, payload) {
    try {
      var request = window.fetch(c.apiHost + '/i/v0/e/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        keepalive: true,
        mode: 'cors'
      });
      if (request && typeof request.catch === 'function') request.catch(function () {});
    } catch (_) {}
  }
  function startDwell(c, pageview) {
    var doc = window.document;
    if (!doc || typeof doc.addEventListener !== 'function' || typeof doc.removeEventListener !== 'function' ||
        typeof window.addEventListener !== 'function' || typeof window.removeEventListener !== 'function' ||
        typeof window.setTimeout !== 'function' || typeof window.clearTimeout !== 'function' ||
        !window.performance || typeof window.performance.now !== 'function') return;
    var timer = null;
    var stopped = false;
    var suspended = false;
    var active = doc.visibilityState === 'visible';
    var visibleMs = 0;
    var lastSentMs = 0;
    var sequence = 0;
    function now() {
      try {
        var value = window.performance.now();
        return typeof value === 'number' && Number.isFinite(value) ? value : null;
      } catch (_) { return null; }
    }
    var lastSample = now();
    if (lastSample === null) return;
    function clearTimer() {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    }
    function stop() {
      if (stopped) return;
      stopped = true;
      active = false;
      clearTimer();
      doc.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pagehide);
      window.removeEventListener('pageshow', pageshow);
      window.removeEventListener('storage', storageChange);
    }
    function account() {
      var value = now();
      if (value === null) { lastSample = null; return; }
      // Bound a delayed sample so a frozen browser or sleeping device cannot add hours.
      // Visibility estimates foreground display, not attention or continuous reading.
      if (active && lastSample !== null) visibleMs += Math.min(20000, Math.max(0, value - lastSample));
      lastSample = value;
    }
    function report(reason) {
      if (stopped) return;
      if (isOptedOut()) { stop(); return; }
      account();
      var total = Math.floor(visibleMs);
      if (total <= lastSentMs) return;
      lastSentMs = total;
      sequence += 1;
      var properties = Object.assign({}, pageview.properties, {
        dwell_visible_ms: total,
        dwell_sequence: sequence,
        dwell_reason: reason
      });
      send(c, { api_key: c.token, event: 'nau_page_dwell', distinct_id: pageview.distinct_id, properties: properties });
    }
    function schedule() {
      if (!stopped && active && timer === null) timer = window.setTimeout(heartbeat, 15000);
    }
    function heartbeat() {
      timer = null;
      if (doc.visibilityState !== 'visible') {
        active = false;
        report('hidden');
        return;
      }
      report('heartbeat');
      schedule();
    }
    function visibility() {
      if (stopped) return;
      if (doc.visibilityState !== 'visible') {
        report('hidden');
        active = false;
        clearTimer();
      } else {
        if (isOptedOut()) { stop(); return; }
        active = !suspended;
        lastSample = now();
        schedule();
      }
    }
    function pagehide() {
      report('pagehide');
      suspended = true;
      active = false;
      clearTimer();
    }
    function pageshow(event) {
      if (stopped || !event.persisted) return;
      if (isOptedOut()) { stop(); return; }
      suspended = false;
      active = doc.visibilityState === 'visible';
      lastSample = now();
      schedule();
    }
    function storageChange(event) {
      if ((!event.key || event.key === OPT_OUT || event.key === OLD_CHOICE) && isOptedOut()) stop();
    }
    stopDwell = stop;
    doc.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pagehide);
    window.addEventListener('pageshow', pageshow);
    window.addEventListener('storage', storageChange);
    schedule();
  }
  clearOldIdentity();
  window.NAUAnalytics = Object.freeze({ disable: disable, isOptedOut: isOptedOut });
  try {
    var ownerPage = new URL(window.location.href);
    if (ownerPage.searchParams.get('exclude_self') === '1') {
      var saved = disable();
      ownerPage.searchParams.delete('exclude_self');
      if (window.history && typeof window.history.replaceState === 'function') window.history.replaceState(null, '', ownerPage.href);
      notifyOwner(saved);
      return;
    }
  } catch (_) { return; }
  function capture() {
    var c = config();
    if (attempted || !c || isOptedOut() || typeof window.fetch !== 'function') return;
    var p = allowedPage(c);
    if (!p || !window.crypto || typeof window.crypto.randomUUID !== 'function') return;
    var id;
    try { id = 'pv_' + window.crypto.randomUUID(); } catch (_) { return; }
    var referrer = '';
    try { referrer = new URL(window.document.referrer).hostname; } catch (_) {}
    var device = coarseDevice(window.navigator);
    var payload = {
      api_key: c.token,
      event: '$pageview',
      distinct_id: id,
      properties: {
        source: 'nau-mpacc-guide',
        analytics_mode: 'aggregate_v3_devices',
        pageview_id: id,
        dwell_tracking_version: DWELL_VERSION,
        device_type: device.type,
        device_os: device.os,
        device_browser: device.browser,
        $process_person_profile: false,
        $current_url: p.origin + p.pathname,
        $pathname: p.pathname,
        $host: p.hostname,
        referrer_host: referrer,
        $ip: null,
        $geoip_disable: true
      }
    };
    attempted = true;
    send(c, payload);
    try { startDwell(c, payload); } catch (_) { stopDwell(); }
  }
  capture();
}());
