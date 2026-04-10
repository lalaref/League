/**
 * ALL-IN Basketball League — Admin Authentication
 * Simple client-side password gate for admin pages.
 * Password is stored in sessionStorage after first login.
 */
(function () {
  'use strict';

  var ADMIN_PASSWORD = 'allin2026admin';
  var STORAGE_KEY = 'aibl_admin_auth';

  // Check if already authenticated this session
  if (sessionStorage.getItem(STORAGE_KEY) === 'true') return;

  // Show login overlay
  var overlay = document.createElement('div');
  overlay.id = 'admin-auth-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:var(--color-bg,#1a1a2e);z-index:9999;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML =
    '<div style="background:var(--color-surface,#16213e);padding:2rem;border-radius:12px;max-width:360px;width:90%;text-align:center;">' +
      '<h2 style="color:var(--color-text,#fff);margin-bottom:1rem;">🔒 管理後台</h2>' +
      '<p style="color:var(--color-text-secondary,#a0a0b8);margin-bottom:1rem;font-size:0.9rem;">請輸入管理員密碼</p>' +
      '<input type="password" id="admin-pw-input" placeholder="密碼" style="width:100%;padding:0.75rem;border-radius:8px;border:1px solid var(--color-border,#2a2a4a);background:var(--color-bg,#1a1a2e);color:var(--color-text,#fff);font-size:1rem;margin-bottom:0.75rem;box-sizing:border-box;">' +
      '<div id="admin-pw-error" style="color:#ff6b6b;font-size:0.85rem;margin-bottom:0.75rem;display:none;">密碼錯誤</div>' +
      '<button id="admin-pw-btn" style="width:100%;padding:0.75rem;border-radius:8px;border:none;background:var(--color-accent,#e94560);color:#fff;font-size:1rem;cursor:pointer;font-weight:600;">登入</button>' +
    '</div>';

  document.body.appendChild(overlay);

  // Hide all main content until authenticated
  var main = document.querySelector('.main-content');
  if (main) main.style.display = 'none';

  var input = document.getElementById('admin-pw-input');
  var btn = document.getElementById('admin-pw-btn');
  var errEl = document.getElementById('admin-pw-error');

  function tryLogin() {
    if (input.value === ADMIN_PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY, 'true');
      overlay.remove();
      if (main) main.style.display = '';
    } else {
      errEl.style.display = 'block';
      input.value = '';
      input.focus();
    }
  }

  btn.addEventListener('click', tryLogin);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') tryLogin();
  });
  input.focus();
})();
