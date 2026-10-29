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
    const b = document.createElement('button');
    b.id = 'pwa-install'; b.textContent = '⬇ Pasang Aplikasi';
    b.style.cssText = 'position:fixed;right:14px;bottom:calc(14px + env(safe-area-inset-bottom));z-index:9999;background:#ED1B2F;color:#fff;border:0;border-radius:999px;padding:12px 18px;font:700 14px sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);';
    b.onclick = async () => { b.remove(); deferred.prompt(); await deferred.userChoice; deferred = null; };
    document.body.appendChild(b);
  });
  window.addEventListener('appinstalled', () => { const b = document.getElementById('pwa-install'); if (b) b.remove(); });
})();
