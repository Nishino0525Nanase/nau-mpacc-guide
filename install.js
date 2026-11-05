/* Install UI and local offline support. This file does not send analytics. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const standalone = window.matchMedia('(display-mode: standalone)');
  const bundledEdition = location.hostname === 'appassets.androidplatform.net';
  let installed = standalone.matches || navigator.standalone === true;
  let pendingPrompt = null;
  let prompting = false;
  let dataReady = false;
  let offlineCache = false;
  let offlineReady = false;
  let registrationFailed = false;
  let actionMessage = '';

  // This preference must also work when analytics.js is unavailable offline.
  // Keep the parameter for analytics.js to process too, especially if storage fails.
  try {
    if (new URL(location.href).searchParams.get('exclude_self') === '1') {
      let saved = false;
      try {
        localStorage.setItem('nau_analytics_opt_out', '1');
        localStorage.removeItem('nau_mpacc_guide_anon_id_v1');
        saved = localStorage.getItem('nau_analytics_opt_out') === '1';
      } catch (_) {}
      const toast = $('#toast');
      if (toast) {
        toast.textContent = saved ? '已排除当前浏览器：以后的访问不计入统计。' : '本次使用了排除链接，但设置未能保存；下次请仍使用排除链接打开。';
        toast.classList.add('visible');
      }
    }
  } catch (_) {}

  function downloadUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value, location.href);
      return ['http:', 'https:'].includes(url.protocol) && /\.apk$/i.test(url.pathname) && !url.username && !url.password && !url.hash ? url.href : '';
    } catch (_) { return ''; }
  }

  function renderState() {
    const button = $('#install-app');
    const status = $('#install-status');
    if (button) {
      button.hidden = installed;
      button.disabled = prompting;
      button.textContent = pendingPrompt ? '安装到此设备' : '查看安装方法';
    }
    if (status) status.textContent = installed ? (standalone.matches || navigator.standalone === true ? '已在独立应用窗口中打开。' : '已安装，可从桌面或主屏幕打开。') : actionMessage || (pendingPrompt ? '此浏览器支持直接安装，点按后请完成浏览器确认。' : '若未出现安装提示，可按下方步骤添加；是否支持安装由浏览器决定。');
    const connection = $('#edition-connection');
    if (connection) {
      connection.textContent = bundledEdition ? '正在阅读安装包内置资料，可直接离线使用；点应用顶部“在线”查看最新内容。' : navigator.onLine === false || offlineCache
        ? '正在阅读本机保存的资料。联网后重新打开可检查更新；外部原帖需要联网。'
        : offlineReady
          ? '此设备已准备好离线阅读。联网打开时会优先获取最新资料；浏览器清理数据后需重新联网载入。'
          : registrationFailed
            ? '当前环境未能准备离线阅读，仍可联网使用网页。可在 HTTPS 地址和支持的浏览器中重试。'
            : '先保持联网载入一次，等待离线资料准备完成。外部原帖和文件下载需要联网。';
    }
    const notice = $('#offline-status');
    if (notice) {
      const offline = bundledEdition || navigator.onLine === false || offlineCache;
      notice.hidden = !offline;
      notice.textContent = bundledEdition ? '正在阅读安装包内置资料；Word / Excel 可保存到本机，外部原帖需要联网。' : dataReady
        ? '当前正在阅读此设备保存的资料；外部原帖与文件下载需要联网。'
        : '当前离线；首次使用请先联网载入资料。';
    }
  }

  function mount(meta = {}) {
    const target = $('#app-edition-cards');
    if (!target) return;
    const android = meta?.android || {};
    const androidUrl = android.available === true ? downloadUrl(android.url) : '';
    const bytes = Number.isFinite(android.bytes) && android.bytes > 0 ? ` · ${(android.bytes / 1024 / 1024).toFixed(1)} MB` : '';
    const checksum = /^[a-f\d]{64}$/i.test(android.sha256 || '') ? `<details class="apk-checksum"><summary>核对 SHA-256</summary><code>${esc(android.sha256.toLowerCase())}</code></details>` : '';
    target.innerHTML = `<article class="edition-card"><div class="edition-card-title"><img src="./icons/app-192.png" alt="" width="44" height="44"><div><h4>网页应用</h4><span>版本 ${esc(meta?.web?.version || '1.0.0')} · PWA</span></div></div><p>添加到主屏幕或桌面，可用独立窗口阅读同一份指南。导师、生活章节与原帖摘记支持离线阅读。</p><button class="button" id="install-app" type="button">查看安装方法</button><p id="install-status" class="edition-status" role="status" aria-live="polite"></p><p id="edition-connection" class="edition-connection" role="status" aria-live="polite"></p><details class="install-steps" id="install-steps"><summary>按设备查看安装方法</summary><ol><li><strong>Android：</strong>用 Chrome 打开此页，点右上角“更多” → “安装并创建快捷方式” → “安装”。部分版本显示“安装应用”或“添加到主屏幕”，按提示操作。</li><li><strong>iPhone / iPad：</strong>用 Safari 打开此页，点“分享” → “添加到主屏幕”；若出现“作为网页 App 打开”，保持开启，再点“添加”。</li><li><strong>电脑：</strong>用 Chrome 或 Edge 打开此页，点地址栏的安装图标；Chrome 也可在“更多” → “投放、保存和分享” → “将网页安装为应用”中操作。</li></ol><p>菜单名称会随版本变化。若应用内浏览器没有安装项，请先用 Safari、Chrome 或 Edge 打开；没有安装项时可继续使用网页。</p></details></article><article class="edition-card android-card"><div class="edition-card-title"><span class="file-icon apk-icon" aria-hidden="true">APK</span><div><h4>Android安装包</h4><span>${androidUrl ? `版本 ${esc(android.version || '待标注')}${esc(bytes)}` : '暂未提供下载'}</span></div></div><p>${androidUrl ? '内置完整指南，断网也可阅读；联网时可查看最新内容。下载后打开安装包，按系统提示安装。支持 Android 7.0 及以上，更新应用需下载新版安装包。' : '安装包准备完成后会在这里提供版本、文件大小与校验值。目前可先使用上方网页应用。'}</p>${androidUrl ? `<a class="button" href="${esc(androidUrl)}" download data-download="android-app">${esc(android.label || '下载 Android 安装包')} <span aria-hidden="true">↓</span></a>${checksum}` : '<span class="edition-unavailable">准备中</span>'}<p class="edition-footnote">应用版与网页使用同一份公开指南，原帖链接需要联网打开。</p></article>`;
    renderState();
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    pendingPrompt = event;
    actionMessage = '';
    renderState();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    pendingPrompt = null;
    actionMessage = '';
    renderState();
  });
  const displayChanged = event => {
    installed = event.matches || navigator.standalone === true;
    renderState();
  };
  if (standalone.addEventListener) standalone.addEventListener('change', displayChanged);
  else if (standalone.addListener) standalone.addListener(displayChanged);
  document.addEventListener('click', async event => {
    if (!event.target.closest('#install-app') || prompting || installed) return;
    if (!pendingPrompt) {
      const steps = $('#install-steps');
      if (steps) { steps.open = true; steps.querySelector('summary')?.focus(); }
      return;
    }
    const prompt = pendingPrompt;
    pendingPrompt = null;
    prompting = true;
    renderState();
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      actionMessage = choice?.outcome === 'accepted' ? '已提交安装请求，请按浏览器提示完成。安装后可从桌面或主屏幕打开。' : '已取消安装；可继续阅读，或按下方步骤稍后添加。';
    } catch (_) {
      actionMessage = '浏览器未能打开安装提示，请按下方步骤手动添加。';
    } finally {
      prompting = false;
      renderState();
    }
  });
  window.addEventListener('nau:data-ready', event => {
    dataReady = true;
    offlineCache = event.detail?.offlineCache === true;
    renderState();
  });
  window.addEventListener('online', () => { offlineCache = false; renderState(); });
  window.addEventListener('offline', renderState);
  window.NAUEdition = Object.freeze({mount});

  // Scope stays within this GitHub Pages project, including on a nested preview URL.
  if (bundledEdition) {
    offlineReady = true;
  } else if ('serviceWorker' in navigator && window.isSecureContext) {
    const scriptBase = new URL('./', document.currentScript?.src || location.href);
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'NAU_OFFLINE_READY') { offlineReady = true; renderState(); }
    });
    navigator.serviceWorker.register(new URL('sw.js', scriptBase), {scope:scriptBase.pathname, updateViaCache:'none'})
      .then(async registration => {
        await navigator.serviceWorker.ready;
        (navigator.serviceWorker.controller || registration.active)?.postMessage({type:'NAU_CHECK_OFFLINE'});
      })
      .catch(() => { registrationFailed = true; renderState(); });
  } else {
    registrationFailed = true;
  }
  renderState();
})();
