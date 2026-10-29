// Daftarkan service worker (butuh HTTPS atau localhost) + tombol "Pasang Aplikasi" di Android.
(function(){
  if ('serviceWorker' in navigator){
    const base = location.pathname.includes('/pages/') ? '../' : './';
    window.addEventListener('load', () => navigator.serviceWorker.register(base + 'sw.js').catch(() => {}));
  }
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferred = e;
    if (document.getElementById('pwa-install')) return;
    try { if (sessionStorage.getItem('pwa-dismissed')) return; } catch (_) {}
    const b = document.createElement('div');
    b.id = 'pwa-install';
    b.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(12px + env(safe-area-inset-bottom));z-index:900;display:flex;align-items:center;background:#111;color:#fff;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.3);font:700 13px sans-serif;overflow:hidden;';
    const go = document.createElement('button');
    go.textContent = '⬇ Pasang Aplikasi';
    go.style.cssText = 'background:none;border:0;color:#fff;font:inherit;padding:11px 8px 11px 16px;cursor:pointer;';
    go.onclick = async () => { b.remove(); deferred.prompt(); await deferred.userChoice; deferred = null; };
    const x = document.createElement('button');
    x.textContent = '✕'; x.setAttribute('aria-label', 'Tutup');
    x.style.cssText = 'background:none;border:0;color:#bbb;font:inherit;padding:11px 14px 11px 6px;cursor:pointer;';
    x.onclick = () => { b.remove(); try { sessionStorage.setItem('pwa-dismissed', '1'); } catch (_) {} };
    b.append(go, x);
    document.body.appendChild(b);
  });
  window.addEventListener('appinstalled', () => { const b = document.getElementById('pwa-install'); if (b) b.remove(); });
})();
