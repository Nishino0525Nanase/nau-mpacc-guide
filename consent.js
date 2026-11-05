/* Optional anonymous analytics consent. This does not request camera or microphone access. */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.NAUConsent) return;
  var KEY = 'nau_privacy_consent_v1';
  var ID_KEY = 'nau_mpacc_guide_anon_id_v1';
  var VERSION = 1;
  var memoryChoice = 'unset';
  var doc = window.document;
  var banner, dialog, analyticsCheckbox, dialogStatus, previousFocus;

  function store() { try { return window.localStorage; } catch (_) { return null; } }
  function readChoice() {
    if (memoryChoice === 'denied') return 'denied';
    try {
      var s = store();
      if (!s) return memoryChoice;
      var raw = s.getItem(KEY);
      if (!raw) return memoryChoice;
      var choice = JSON.parse(raw);
      if (choice.version !== VERSION || typeof choice.analytics !== 'boolean') return 'unset';
      return choice.analytics ? 'granted' : 'denied';
    } catch (_) { return memoryChoice; }
  }
  function clearIdentity() {
    try { var s = store(); if (s) s.removeItem(ID_KEY); } catch (_) {}
  }
  function privacySignal() {
    var n = window.navigator || {};
    var dnt = String(n.doNotTrack || window.doNotTrack || n.msDoNotTrack || '').toLowerCase();
    return dnt === '1' || dnt === 'yes' || n.globalPrivacyControl === true;
  }
  function notify() {
    if (typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') {
      window.dispatchEvent(new window.CustomEvent('nau:consentchange', { detail: { analytics: readChoice() === 'granted', choice: readChoice() } }));
    }
  }
  function refreshBanner() { if (banner) banner.hidden = readChoice() !== 'unset'; }
  function setChoice(allowed) {
    var saved = false;
    var previousMemory = memoryChoice;
    memoryChoice = 'unset';
    try {
      var s = store();
      if (s) {
        s.setItem(KEY, JSON.stringify({ version: VERSION, analytics: allowed === true }));
        saved = readChoice() === (allowed === true ? 'granted' : 'denied');
      }
    } catch (_) {}
    // A failed storage write must never turn on optional tracking.
    if (!saved && allowed !== true) {
      memoryChoice = 'denied';
      // Removing an old grant often still succeeds when quota prevents setItem.
      try { var fallbackStore = store(); if (fallbackStore) fallbackStore.removeItem(KEY); } catch (_) {}
    } else if (!saved) memoryChoice = previousMemory;
    if (allowed !== true) clearIdentity();
    refreshBanner();
    notify();
    return saved;
  }
  function closeSettings() {
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
  }
  function openSettings() {
    mount();
    if (!dialog) return;
    previousFocus = doc.activeElement;
    analyticsCheckbox.checked = readChoice() === 'granted';
    dialogStatus.textContent = privacySignal() ? '浏览器已开启隐私信号：即使允许匿名统计，本页也不会发送统计。' : '';
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    }
    var close = dialog.querySelector('[data-consent-close]');
    if (close) close.focus();
  }
  function choose(allowed) {
    var saved = setChoice(allowed);
    if (!saved && allowed === true) {
      openSettings();
      if (dialogStatus) dialogStatus.textContent = '浏览器未能保存选择，匿名统计仍保持关闭。你可以继续阅读。';
      return;
    }
    closeSettings();
  }
  function mount() {
    if (!doc || !doc.body || banner) return;
    banner = doc.createElement('section');
    banner.className = 'consent-banner';
    banner.setAttribute('aria-labelledby', 'consent-banner-title');
    banner.setAttribute('aria-label', 'Cookie与本地存储选择');
    banner.innerHTML = '<div class="consent-copy"><h2 id="consent-banner-title">Cookie 与本地存储</h2><p>联系清单与隐私选择保存在当前浏览器。只有你允许后，本页才使用匿名浏览器标识统计访问；拒绝不会影响阅读。</p></div><div class="consent-actions"><button type="button" class="consent-button" data-consent-essential>仅必要功能</button><button type="button" class="consent-button consent-allow" data-consent-allow>允许匿名统计</button><button type="button" class="consent-settings" data-cookie-settings>设置说明</button></div>';
    doc.body.appendChild(banner);
    dialog = doc.createElement('dialog');
    dialog.className = 'consent-dialog';
    dialog.setAttribute('aria-labelledby', 'consent-settings-title');
    dialog.innerHTML = '<div class="consent-dialog-top"><h2 id="consent-settings-title">Cookie 与本地存储设置</h2><button type="button" class="consent-close" data-consent-close aria-label="关闭隐私设置">×</button></div><p>本页目前使用本地存储。你可以单独决定是否允许匿名访问统计。</p><div class="consent-option"><label><input type="checkbox" checked disabled> 功能与选择保存</label><p>用于你主动保存的导师联系清单、隐私选择和排除本人访问设置。</p></div><div class="consent-option"><label><input type="checkbox" id="nau-consent-analytics"> 匿名访问统计（可选）</label><p>使用随机浏览器标识计算访问次数和去重访客数。不会记录你的姓名、邮箱、搜索输入或页面录像。</p></div><p class="consent-small">关闭后不再发送新的统计，并清除当前浏览器的匿名标识；此前已记录的匿名统计不会被追溯删除。此选择不包含摄像头或麦克风授权。</p><p class="consent-status" role="status" aria-live="polite"></p><div class="consent-dialog-actions"><button type="button" class="consent-button" data-consent-close>取消</button><button type="button" class="consent-button consent-allow" data-consent-save>保存选择</button></div>';
    doc.body.appendChild(dialog);
    analyticsCheckbox = dialog.querySelector('#nau-consent-analytics');
    dialogStatus = dialog.querySelector('.consent-status');
    dialog.addEventListener('click', function (event) { if (event.target === dialog) closeSettings(); });
    dialog.addEventListener('cancel', function () { if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus(); });
    refreshBanner();
  }

  window.NAUConsent = Object.freeze({
    getAnalyticsConsent: readChoice,
    setAnalyticsConsent: setChoice,
    openSettings: openSettings
  });
  // Clear legacy IDs before consent; old opt-in-free releases are not consent.
  if (readChoice() !== 'granted') clearIdentity();
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('storage', function (event) {
      if (event.key !== KEY && event.key !== null) return;
      memoryChoice = 'unset';
      if (readChoice() !== 'granted') clearIdentity();
      refreshBanner();
      if (analyticsCheckbox) analyticsCheckbox.checked = readChoice() === 'granted';
      notify();
    });
  }
  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('click', function (event) {
      var target = event.target && typeof event.target.closest === 'function' ? event.target : null;
      if (!target) return;
      if (target.closest('[data-cookie-settings]')) { event.preventDefault(); openSettings(); }
      else if (target.closest('[data-consent-essential]')) choose(false);
      else if (target.closest('[data-consent-allow]')) choose(true);
      else if (target.closest('[data-consent-save]')) choose(!!analyticsCheckbox.checked);
      else if (target.closest('[data-consent-close]')) closeSettings();
    });
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
  }
}());
