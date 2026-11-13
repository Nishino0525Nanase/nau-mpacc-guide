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
    var out = {
      type: '其他', os: '未知', browser: '未知', browserMajor: '未提供',
      context: '未识别', basis: '未提供可用分类信息', status: '未识别'
    };
    function read(target, key) {
      try { return target == null ? undefined : target[key]; } catch (_) { return undefined; }
    }
    function text(target, key) {
      var value = read(target, key);
      return typeof value === 'string' ? value : '';
    }
    function major(value) {
      if (typeof value !== 'string') return '未提供';
      var found = /^(\d{1,4})(?:\.\d+)*$/.exec(value);
      return found && Number(found[1]) > 0 ? String(Number(found[1])) : '未提供';
    }
    function uaMajor(pattern) {
      var found = pattern.exec(ua);
      return found ? major(found[1]) : '未提供';
    }
    n = n || {};
    var ua = text(n, 'userAgent');
    var platform = text(n, 'platform');
    var hints = read(n, 'userAgentData');
    var hintPlatform = text(hints, 'platform');
    var mobileValue = read(hints, 'mobile');
    var mobile = typeof mobileValue === 'boolean' ? mobileValue : null;
    var touch = read(n, 'maxTouchPoints');
    var brands = read(hints, 'brands');
    try { if (!Array.isArray(brands)) brands = []; } catch (_) { brands = []; }
    function brand(name) {
      var length = read(brands, 'length');
      if (typeof length !== 'number') return null;
      for (var i = 0; i < Math.min(length, 16); i += 1) {
        var item = read(brands, i);
        if (text(item, 'brand') === name) return { version: major(text(item, 'version')) };
      }
      return null;
    }
    var edge = brand('Microsoft Edge');
    var opera = brand('Opera');
    var chrome = brand('Google Chrome');
    var chromium = brand('Chromium');
    var ipad = /iPad/i.test(ua);
    var ipadDesktop = platform === 'MacIntel' && typeof touch === 'number' && touch > 1;
    var tablet = ipad || ipadDesktop || /Tablet|PlayBook/i.test(ua);
    var iosPhone = /iPhone|iPod/i.test(ua);
    var android = hintPlatform === 'Android' || /Android/i.test(ua);
    var typeBasis = '未提供设备类别标记';
    if (tablet) {
      out.type = '平板';
      typeBasis = ipadDesktop && !ipad ? 'iPad桌面模式线索' : '平板标记';
    } else if (iosPhone || /Windows Phone/i.test(ua) || mobile === true || (android && /Mobile/i.test(ua))) {
      out.type = '手机';
      typeBasis = iosPhone ? 'iPhone或iPod标记' : mobile === true ? 'UA-CH移动标记' : '移动设备标记';
    } else if (!android && (/Windows|macOS|Chrome OS|Linux/i.test(hintPlatform) || /Win|Mac|Linux|CrOS|X11/i.test(platform + ' ' + ua))) {
      out.type = '电脑';
      typeBasis = /^(Windows|macOS|Chrome OS|Linux)$/.test(hintPlatform) ? 'UA-CH桌面平台标记' : '桌面平台标记';
    } else if (android) {
      typeBasis = 'Android桌面模式或平板未区分';
    }

    if (ipad || ipadDesktop) out.os = 'iPadOS';
    else if (iosPhone) out.os = 'iOS';
    else if (/Windows Phone/i.test(ua)) out.os = 'Windows Phone';
    else if (android) out.os = 'Android';
    else if (hintPlatform === 'Windows' || /Windows NT|Win32|Win64/i.test(ua + ' ' + platform)) out.os = 'Windows';
    else if (hintPlatform === 'Chrome OS' || /CrOS/i.test(ua)) out.os = 'Chrome OS';
    else if (hintPlatform === 'macOS' || /Macintosh|MacIntel|MacPPC|Mac OS X/i.test(ua + ' ' + platform)) out.os = 'macOS';
    else if (hintPlatform === 'Linux' || /Linux|X11/i.test(ua + ' ' + platform)) out.os = 'Linux';

    var browserBasis = '未提供浏览器标记';
    function identify(name, context, pattern, knownBrand) {
      out.browser = name;
      out.context = context;
      var byUa = pattern ? uaMajor(pattern) : '未提供';
      out.browserMajor = byUa !== '未提供' ? byUa : knownBrand ? knownBrand.version : '未提供';
      browserBasis = pattern && pattern.test(ua) ? 'UA浏览器或应用标记' : '低熵品牌标记';
    }
    if (/wxwork\//i.test(ua)) identify('企业微信内置浏览器', '企业微信内置浏览器', /wxwork\/(\d+(?:\.\d+)*)/i);
    else if (/MicroMessenger/i.test(ua)) identify('微信内置浏览器', '微信内置浏览器', /MicroMessenger\/(\d+(?:\.\d+)*)/i);
    else if (/DingTalk(?:[\/( ]|$)/i.test(ua)) identify('钉钉内置浏览器', '钉钉内置浏览器', /DingTalk[\/( ](\d+(?:\.\d+)*)/i);
    else if (/baiduboxapp\//i.test(ua)) identify('百度App内置浏览器', '百度App内置浏览器', /baiduboxapp\/(\d+(?:\.\d+)*)/i);
    else if (/(?:^|[ ;])QQ\//i.test(ua)) identify('QQ内置浏览器', 'QQ内置浏览器', /(?:^|[ ;])QQ\/(\d+(?:\.\d+)*)/i);
    else if (/Edg(?:A|iOS)?\/|Edge\//i.test(ua) || edge) identify('Edge', '普通浏览器', /(?:Edg(?:A|iOS)?|Edge)\/(\d+(?:\.\d+)*)/i, edge);
    else if (/OPR\/|OPiOS\/|OPT\//i.test(ua) || opera) identify('Opera', '普通浏览器', /(?:OPR|OPiOS|OPT)\/(\d+(?:\.\d+)*)/i, opera);
    else if (/SamsungBrowser\//i.test(ua)) identify('三星浏览器', '普通浏览器', /SamsungBrowser\/(\d+(?:\.\d+)*)/i);
    else if (/UCBrowser\//i.test(ua)) identify('UC浏览器', '普通浏览器', /UCBrowser\/(\d+(?:\.\d+)*)/i);
    else if (/MQQBrowser\//i.test(ua)) identify('QQ浏览器', '普通浏览器', /MQQBrowser\/(\d+(?:\.\d+)*)/i);
    else if (/BaiduBrowser\//i.test(ua)) identify('百度浏览器', '普通浏览器', /BaiduBrowser\/(\d+(?:\.\d+)*)/i);
    else if (/Firefox\/|FxiOS\//i.test(ua)) identify('Firefox', '普通浏览器', /(?:Firefox|FxiOS)\/(\d+(?:\.\d+)*)/i);
    else if (/;\s*wv\)/i.test(ua)) identify('Android WebView', 'Android WebView', /Chrome\/(\d+(?:\.\d+)*)/i);
    else if (/Chrome\/|CriOS\//i.test(ua) || chrome) identify('Chrome', '普通浏览器', /(?:Chrome|CriOS)\/(\d+(?:\.\d+)*)/i, chrome);
    else if (/Version\/.+Safari\//i.test(ua)) identify('Safari', '普通浏览器', /Version\/(\d+(?:\.\d+)*)/i);
    else if (chromium) identify('Chromium系浏览器', '普通浏览器', null, chromium);

    out.basis = '设备：' + typeBasis + '；浏览器：' + browserBasis;
    if (android && out.type === '其他') out.status = '有歧义';
    else if (out.type !== '其他' || out.os !== '未知' || out.browser !== '未知') out.status = '推断';
    if (hintPlatform && ((android && hintPlatform !== 'Android') ||
        (iosPhone && !/^(iOS|iPadOS)$/.test(hintPlatform)) ||
        (hintPlatform === 'Android' && /Windows NT/i.test(ua)))) out.status = '有歧义';
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
        device_browser_major: device.browserMajor,
        device_browser_context: device.context,
        device_detection_basis: device.basis,
        device_detection_status: device.status,
        device_info_version: 'coarse_v4',
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
