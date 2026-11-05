(() => {
  'use strict';
  const key = 'nau_analytics_opt_out';
  const button = document.getElementById('exclude-self');
  const status = document.getElementById('owner-status');
  const render = () => {
    try {
      const off = localStorage.getItem(key) === '1';
      button.textContent = off ? '恢复计入这个浏览器的访问' : '排除这个浏览器的访问';
      button.setAttribute('aria-pressed', String(off));
      status.textContent = off ? '已排除：这个浏览器的访问不会计入。' : '当前浏览器的指南访问会计入统计。';
    } catch { button.disabled = true; status.textContent = '浏览器禁止保存本地设置，无法持久排除自己的访问。'; }
  };
  button.addEventListener('click', () => {
    try {
      localStorage.setItem(key, localStorage.getItem(key) === '1' ? '0' : '1');
      render();
    } catch { status.textContent = '设置未保存，请检查浏览器的本地存储权限。'; }
  });
  render();
})();
