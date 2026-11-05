(() => {
  'use strict';
  const key = 'nau_analytics_opt_out';
  const consentKey = 'nau_privacy_consent_v1';
  const identityKey = 'nau_mpacc_guide_anon_id_v1';
  const button = document.getElementById('exclude-self');
  const status = document.getElementById('owner-status');
  if (!button || !status) return;
  const render = () => {
    try {
      const off = localStorage.getItem(key) === '1';
      const consent = JSON.parse(localStorage.getItem(consentKey) || 'null');
      const granted = !!consent && consent.version === 1 && consent.analytics === true;
      const privacy = ['1', 'yes'].includes(String(navigator.doNotTrack || window.doNotTrack || '').toLowerCase()) || navigator.globalPrivacyControl === true;
      button.textContent = off ? '恢复计入这个浏览器的访问' : '排除这个浏览器的访问';
      button.setAttribute('aria-pressed', String(off));
      status.textContent = off ? '已排除：这个浏览器的访问不会计入。' : privacy ? '浏览器隐私信号已开启，匿名统计保持关闭。' : granted ? '已允许匿名统计，当前浏览器的指南访问会计入。' : '尚未允许匿名统计。恢复本人设置不会自动开启统计，可在指南页脚的 Cookie 设置中单独选择。';
    } catch { button.disabled = true; status.textContent = '浏览器禁止保存本地设置，无法持久排除自己的访问；匿名统计保持关闭。'; }
  };
  button.addEventListener('click', () => {
    try {
      const off = localStorage.getItem(key) !== '1';
      localStorage.setItem(key, off ? '1' : '0');
      if (off) localStorage.removeItem(identityKey);
      render();
    } catch { status.textContent = '设置未保存，请检查浏览器的本地存储权限。'; }
  });
  window.addEventListener('storage', event => { if ([key, consentKey, null].includes(event.key)) render(); });
  render();
})();
