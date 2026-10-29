const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let allVisitors = [];
let selectedIds = new Set();
let currentRoles = [];       // subset dari ['employee','gs','security','superadmin']; [] = Unrole
let currentRole = null;      // 'unrole' | 'superadmin' | role utama (dipakai cek cepat di UI)
let currentProfile = null;   // { id, roles, employee_id }
const ALL_ROLES = ['employee','gs','security','superadmin'];
let currentConfirmMode = null; // 'primary' | 'secondary' | 'exit'
let allEmployeesCache = [];

// ---------- SIDEBAR ----------
function openSidebar(){
  document.getElementById('sidebar').classList.add('show');
  document.getElementById('sidebar-overlay').classList.add('show');
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('show');
  document.getElementById('sidebar-overlay').classList.remove('show');
}

// ---------- AUTH ----------
async function checkSession(){
  const { data } = await supabaseClient.auth.getSession();
  if (data.session){
    showDashboard(data.session.user);
  }
}
setDashToday();
checkSession();

async function doLogin(){
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-err');
  errEl.classList.remove('show');
  const btn = document.getElementById('login-btn');
  btn.disabled = true; btn.textContent = 'Memproses...';

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
  btn.disabled = false; btn.textContent = 'Masuk';

  if (error){
    errEl.textContent = 'Login gagal: ' + error.message;
    errEl.classList.add('show');
    return;
  }
  showDashboard(data.user);
}

async function doLogout(){
  await supabaseClient.auth.signOut();
  stopScanner();
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('sidebar-nav-dynamic').style.display = 'none';
}

function hasRole(r){ return currentRoles.includes(r); }

function roleLabel(r){
  return { unrole:'Unrole', employee:'Employee', gs:'GS', security:'Security', superadmin:'Superadmin' }[r] || r;
}

async function showDashboard(user){
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('user-email').textContent = user.email;

  const { data: profile, error: profErr } = await supabaseClient
    .from('profiles')
    .select('id, roles, employee_id')
    .eq('id', user.id)
    .maybeSingle();

  if (profErr){
    alert('Gagal membaca role akun: ' + profErr.message +
      '\n\nKemungkinan database belum diperbarui. Jalankan database/schema.sql versi terbaru di Supabase SQL Editor, lalu muat ulang halaman.');
  }
  currentProfile = profile || { id: user.id, roles: [], employee_id: null };
  currentRoles = (currentProfile.roles || []).filter(r => ALL_ROLES.includes(r));
  currentRole = currentRoles.length ? (hasRole('superadmin') ? 'superadmin' : currentRoles[0]) : 'unrole';

  const pill = document.getElementById('user-role-pill');
  pill.innerHTML = currentRoles.length
    ? currentRoles.map(r => `<span class="role-pill">${roleLabel(r)}</span>`).join(' ')
    : `<span class="role-pill unrole">${roleLabel('unrole')}</span>`;
  document.getElementById('unrole-notice').style.display = currentRole === 'unrole' ? 'block' : 'none';

  document.getElementById('sidebar-nav-dynamic').style.display = 'flex';
  applyRoleNav(currentRoles);
  applyRoleTablePerms();

  if (currentRole === 'unrole') showView('daftar');
  else if (hasRole('superadmin')) showView('dashboard');
  else if (hasRole('employee')) showView('confirm', 'primary');
  else if (hasRole('gs')) showView('confirm', 'secondary');
  else showView('confirm', 'exit');

  loadVisitors();
}

function applyRoleNav(roles){
  const mine = roles.length ? roles : ['unrole'];
  document.querySelectorAll('#sidebar-nav-dynamic a[data-roles]').forEach(a => {
    const allowed = a.dataset.roles.split(',');
    a.style.display = mine.some(r => allowed.includes(r)) ? 'flex' : 'none';
  });
}

function applyRoleTablePerms(){
  const isSuper = hasRole('superadmin');
  document.getElementById('select-all').closest('th').style.display = isSuper ? '' : 'none';
  document.getElementById('download-photos-btn').style.display = isSuper ? '' : 'none';
  document.getElementById('delete-selected-btn').style.display = isSuper ? '' : 'none';
}

// ---------- VIEW ROUTING ----------
function showView(name, mode){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
  const navSel = name === 'confirm'
    ? `a[data-view="confirm"][data-mode="${mode}"]`
    : `a[data-view="${name}"]`;
  const navEl = document.querySelector(navSel);
  if (navEl) navEl.classList.add('active');
  closeSidebar();

  if (name !== 'confirm') stopScanner();

  if (name === 'confirm'){ currentConfirmMode = mode; setupConfirmView(mode); }
  if (name === 'dashboard') renderStats();
  if (name === 'daftar') applyFilter();
  if (name === 'mapping') loadMappingData();
  if (name === 'builder') loadBuilder();
  if (name === 'akun') loadAkunData();
}

// ---------- DATA: VISITORS ----------
async function loadVisitors(){
  const { data, error } = await supabaseClient
    .from('visitors')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error){
    alert('Gagal memuat data: ' + error.message);
    return;
  }
  allVisitors = data;
  selectedIds.clear();
  updateSelectedUI();

  // resolve signed URLs for photos
  for (const v of allVisitors){
    if (v.photo_url){
      const { data: signed } = await supabaseClient.storage
        .from('visitor-photos')
        .createSignedUrl(v.photo_url, 3600);
      v._photo_signed_url = signed ? signed.signedUrl : null;
    }
  }

  renderStats();
  applyFilter();
}

function renderStats(){
  const t = document.getElementById('stat-total');
  if (!t) return;
  document.getElementById('stat-total').textContent = allVisitors.length;
  const today = new Date().toDateString();
  document.getElementById('stat-today').textContent =
    allVisitors.filter(v => new Date(v.created_at).toDateString() === today).length;
  document.getElementById('stat-review').textContent =
    allVisitors.filter(v => !v.health_clear).length;
  document.getElementById('stat-noprimary').textContent =
    allVisitors.filter(v => !v.confirmed_primary_at && !v.confirmed_secondary_at).length;
  document.getElementById('stat-noexit').textContent =
    allVisitors.filter(v => !v.check_out_at).length;
  renderDashboardPanels();
}

function toDateInputValue(d){
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function setDashToday(){
  const v = toDateInputValue(new Date());
  document.getElementById('dash-from').value = v;
  document.getElementById('dash-to').value = v;
  renderDashboardPanels();
}

function getDashRange(){
  const f = document.getElementById('dash-from').value;
  const t = document.getElementById('dash-to').value;
  const start = f ? new Date(f + 'T00:00:00') : new Date(0);
  const end = t ? new Date(t + 'T23:59:59.999') : new Date(8640000000000000);
  return { start, end };
}

function fmtShortDateTime(d){
  return new Date(d).toLocaleString('id-ID', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
}

function fmtDuration(ms){
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h > 0 ? `${h}j ${r}m` : `${r}m`;
}

function dashRow(v, timeHtml){
  return `
    <tr onclick="openModal('${v.id}')">
      <td>${timeHtml}</td>
      <td>${escapeHtml(v.full_name)}<span class="dash-sub">${escapeHtml(v.company)}</span></td>
      <td>${escapeHtml(v.purpose)}</td>
      <td>${escapeHtml(v.host_name)}</td>
    </tr>`;
}

function renderDashboardPanels(){
  const inBody = document.getElementById('dash-in-body');
  if (!inBody) return;
  const outBody = document.getElementById('dash-out-body');
  const { start, end } = getDashRange();

  const ins = allVisitors
    .filter(v => { const d = new Date(v.created_at); return d >= start && d <= end; })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const outs = allVisitors
    .filter(v => { if (!v.check_out_at) return false; const d = new Date(v.check_out_at); return d >= start && d <= end; })
    .sort((a, b) => new Date(b.check_out_at) - new Date(a.check_out_at));

  document.getElementById('dash-in-count').textContent = ins.length;
  document.getElementById('dash-out-count').textContent = outs.length;

  inBody.innerHTML = ins.length
    ? ins.map(v => dashRow(v, fmtShortDateTime(v.created_at))).join('')
    : '<tr><td colspan="4" class="dash-empty">Tidak ada orang masuk pada periode ini.</td></tr>';

  outBody.innerHTML = outs.length
    ? outs.map(v => dashRow(
        v,
        `${fmtShortDateTime(v.check_out_at)}<span class="dash-sub">di dalam ${fmtDuration(new Date(v.check_out_at) - new Date(v.created_at))}</span>`
      )).join('')
    : '<tr><td colspan="4" class="dash-empty">Tidak ada orang keluar pada periode ini.</td></tr>';
}

function applyFilter(){
  renderTable(getFilteredRows());
}

function visitStatusBadge(v){
  if (v.check_out_at) return '<span class="badge ok">Sudah Keluar</span>';
  if (v.confirmed_primary_at) return '<span class="badge ok">Primary OK</span>';
  if (v.confirmed_secondary_at) return '<span class="badge ok">Secondary OK</span>';
  return '<span class="badge warn">Menunggu Konfirmasi</span>';
}

function renderTable(rows){
  const tbody = document.getElementById('table-body');
  const emptyMsg = document.getElementById('empty-msg');
  const isSuper = hasRole('superadmin');
  if (rows.length === 0){
    tbody.innerHTML = '';
    emptyMsg.style.display = 'block';
    return;
  }
  emptyMsg.style.display = 'none';
  tbody.innerHTML = rows.map(v => `
    <tr>
      <td class="chk-col" style="${isSuper ? '' : 'display:none;'}"><input type="checkbox" ${selectedIds.has(v.id) ? 'checked' : ''} onchange="toggleRowSelect('${v.id}', this)"></td>
      <td>${v._photo_signed_url ? `<img class="thumb" src="${v._photo_signed_url}" onclick="openModal('${v.id}')">` : '—'}</td>
      <td style="font-family:'Space Mono',monospace;font-size:12.5px;">${escapeHtml(v.visitor_id || '—')}</td>
      <td>${escapeHtml(v.full_name)}</td>
      <td>${escapeHtml(v.company)}</td>
      <td>${escapeHtml(v.purpose)}<br><span style="color:#8a8578;font-size:12px;">→ ${escapeHtml(v.host_name)}</span></td>
      <td>${new Date(v.created_at).toLocaleString('id-ID')}</td>
      <td><span class="badge ${v.health_clear ? 'ok' : 'warn'}">${v.health_clear ? 'Baik' : 'Ditinjau'}</span></td>
      <td>${visitStatusBadge(v)}</td>
      <td>${isSuper ? `<button class="btn-danger-sm" onclick="deleteVisitor('${v.id}')">Hapus</button>` : `<button class="btn-outline" onclick="openModal('${v.id}')" style="padding:6px 10px;font-size:12px;">Detail</button>`}</td>
    </tr>
  `).join('');
}

// ---------- SELECTION ----------
function toggleSelectAll(cb){
  const rows = getFilteredRows();
  if (cb.checked) rows.forEach(v => selectedIds.add(v.id));
  else rows.forEach(v => selectedIds.delete(v.id));
  updateSelectedUI();
  applyFilter();
}
function toggleRowSelect(id, cb){
  if (cb.checked) selectedIds.add(id); else selectedIds.delete(id);
  updateSelectedUI();
}
function updateSelectedUI(){
  document.getElementById('selected-count').textContent = selectedIds.size;
  document.getElementById('selected-count-photo').textContent = selectedIds.size;
  document.getElementById('delete-selected-btn').disabled = selectedIds.size === 0;
  document.getElementById('download-photos-btn').disabled = selectedIds.size === 0;
  const selectAll = document.getElementById('select-all');
  if (selectAll) selectAll.checked = false;
}
function getFilteredRows(){
  const q = document.getElementById('search').value.trim().toLowerCase();
  const healthFilter = document.getElementById('filter-health').value;
  return allVisitors.filter(v => {
    const matchesText = !q || [v.full_name, v.company, v.purpose, v.host_name]
      .some(f => (f||'').toLowerCase().includes(q));
    const matchesHealth = healthFilter === 'all'
      || (healthFilter === 'clear' && v.health_clear)
      || (healthFilter === 'review' && !v.health_clear);
    return matchesText && matchesHealth;
  });
}

// ---------- DELETE (superadmin only — enforced by RLS too) ----------
async function deleteVisitorIds(ids){
  if (ids.length === 0) return;
  const photoPaths = allVisitors
    .filter(v => ids.includes(v.id) && v.photo_url)
    .map(v => v.photo_url);
  if (photoPaths.length){
    await supabaseClient.storage.from('visitor-photos').remove(photoPaths);
  }
  const { error } = await supabaseClient.from('visitors').delete().in('id', ids);
  if (error){
    alert('Gagal menghapus data: ' + error.message);
    return;
  }
  allVisitors = allVisitors.filter(v => !ids.includes(v.id));
  ids.forEach(id => selectedIds.delete(id));
  updateSelectedUI();
  renderStats();
  applyFilter();
}

async function deleteVisitor(id){
  const v = allVisitors.find(x => x.id === id);
  if (!v) return;
  if (!confirm(`Hapus data tamu "${v.full_name}"? Tindakan ini tidak bisa dibatalkan.`)) return;
  await deleteVisitorIds([id]);
}

async function deleteSelected(){
  if (selectedIds.size === 0) return;
  if (!confirm(`Hapus ${selectedIds.size} data tamu terpilih? Tindakan ini tidak bisa dibatalkan.`)) return;
  await deleteVisitorIds(Array.from(selectedIds));
}

function escapeHtml(s){
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

// ---------- MODAL ----------
function openModal(id){
  const v = allVisitors.find(x => x.id === id);
  if (!v) return;
  const healthLabels = {
    health_fever:'Demam', health_diarrhea_vomiting:'Diare/Muntah', health_cough_cold_fever:'Batuk/Pilek+Demam',
    health_skin_wound:'Infeksi Kulit/Luka', health_discharge:'Cairan Mata/Telinga/Hidung',
    health_jaundice:'Penyakit Kuning', health_contact_infectious:'Kontak Penyakit Menular'
  };
  const healthRows = Object.keys(healthLabels).map(k =>
    `<div class="row"><span class="k">${healthLabels[k]}</span><span class="v" style="color:${v[k]?'#c0152a':'#1e7a46'}">${v[k]?'Ya':'Tidak'}</span></div>`
  ).join('');

  // Jawaban dari form (Form Builder). Data lama (tanpa snapshot) tetap pakai kolom health_*.
  const ans = Array.isArray(v.answers) ? v.answers : [];
  let answersHtml = healthRows;
  if (ans.length > 0){
    const extra = ans.filter(a => !a.legacy_key || String(a.legacy_key).startsWith('health_'));
    answersHtml = extra.map(a => {
      const isYN = typeof a.value === 'boolean';
      const color = isYN ? (a.value ? (a.flag ? '#c0152a' : '#111') : '#1e7a46') : '';
      const txt = isYN ? (a.value ? 'Ya' : 'Tidak') : (a.value || '—');
      return `<div class="row"><span class="k">${escapeHtml(a.label || '')}</span><span class="v"${color ? ` style="color:${color}"` : ''}>${escapeHtml(String(txt))}</span></div>`;
    }).join('');
  }

  const superActions = hasRole('superadmin') ? `
    <div class="super-label">Aksi Superadmin</div>
    <div class="super-actions">
      ${v.confirmed_primary_at
        ? `<button class="btn-outline" onclick="superReset('${v.id}','primary')">Batalkan Primary</button>`
        : `<button class="btn-outline" onclick="superConfirm('${v.id}','primary')">Konfirmasi Primary</button>`}
      ${v.confirmed_secondary_at
        ? `<button class="btn-outline" onclick="superReset('${v.id}','secondary')">Batalkan Secondary</button>`
        : `<button class="btn-outline" onclick="superConfirm('${v.id}','secondary')">Konfirmasi Secondary</button>`}
      ${v.check_out_at
        ? `<button class="btn-outline" onclick="superReset('${v.id}','exit')">Batalkan Keluar</button>`
        : `<button class="btn-outline" onclick="superConfirm('${v.id}','exit')">Konfirmasi Keluar</button>`}
    </div>` : '';

  document.getElementById('modal-content').innerHTML = `
    ${v._photo_signed_url ? `<img src="${v._photo_signed_url}">` : ''}
    <div class="row"><span class="k">ID Tamu</span><span class="v" style="font-family:'Space Mono',monospace;">${escapeHtml(v.visitor_id || '—')}</span></div>
    <div class="row"><span class="k">Nama</span><span class="v">${escapeHtml(v.full_name)}</span></div>
    <div class="row"><span class="k">Perusahaan</span><span class="v">${escapeHtml(v.company)}</span></div>
    <div class="row"><span class="k">Telepon</span><span class="v">${escapeHtml(v.phone)}</span></div>
    <div class="row"><span class="k">Email</span><span class="v">${escapeHtml(v.email || '—')}</span></div>
    <div class="row"><span class="k">Tujuan</span><span class="v">${escapeHtml(v.purpose)}</span></div>
    <div class="row"><span class="k">Ditemui</span><span class="v">${escapeHtml(v.host_name)}</span></div>
    <div class="row"><span class="k">Area</span><span class="v">${escapeHtml(v.area_visited || '—')}</span></div>
    <div class="row"><span class="k">Waktu Masuk</span><span class="v">${new Date(v.created_at).toLocaleString('id-ID')}</span></div>
    <div class="row"><span class="k">GMP Disetujui</span><span class="v">${v.gmp_compliance_agreed ? 'Ya' : 'Tidak'}</span></div>
    <div class="row"><span class="k">Konfirmasi Primary</span><span class="v">${v.confirmed_primary_at ? new Date(v.confirmed_primary_at).toLocaleString('id-ID') : '—'}</span></div>
    <div class="row"><span class="k">Konfirmasi Secondary</span><span class="v">${v.confirmed_secondary_at ? new Date(v.confirmed_secondary_at).toLocaleString('id-ID') : '—'}</span></div>
    <div class="row"><span class="k">Konfirmasi Keluar</span><span class="v">${v.check_out_at ? new Date(v.check_out_at).toLocaleString('id-ID') : '—'}</span></div>
    ${answersHtml}
    ${superActions}
    <button class="modal-close" onclick="closeModal()">Tutup</button>
    ${hasRole('superadmin') ? `<button class="modal-danger" onclick="closeModal(); deleteVisitor('${v.id}')">Hapus Data Ini</button>` : ''}
  `;
  document.getElementById('modal-bg').classList.add('show');
}
function closeModal(){ document.getElementById('modal-bg').classList.remove('show'); }

async function superConfirm(id, kind){
  const v = allVisitors.find(x => x.id === id);
  if (!v) return;
  const fnMap = { primary: 'confirm_primary', secondary: 'confirm_secondary', exit: 'confirm_exit' };
  const { error } = await supabaseClient.rpc(fnMap[kind], { p_visitor_code: v.visitor_id });
  if (error){ alert('Gagal: ' + error.message); return; }
  closeModal();
  await loadVisitors();
}

async function superReset(id, kind){
  const v = allVisitors.find(x => x.id === id);
  if (!v) return;
  const labels = { primary: 'Konfirmasi Primary', secondary: 'Konfirmasi Secondary', exit: 'Konfirmasi Keluar' };
  if (!confirm(`Batalkan ${labels[kind]} untuk "${v.full_name}"?`)) return;
  const patches = {
    primary: { confirmed_primary_at: null, confirmed_primary_by: null },
    secondary: { confirmed_secondary_at: null, confirmed_secondary_by: null },
    exit: { check_out_at: null, exit_confirmed_by: null }
  };
  const { error } = await supabaseClient.from('visitors').update(patches[kind]).eq('id', id);
  if (error){ alert('Gagal: ' + error.message); return; }
  closeModal();
  await loadVisitors();
}

// ---------- SIMPAN FOTO (ZIP) ----------
function sanitizeFileName(s){
  return (s || 'tanpa-nama')
    .normalize('NFKD')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function downloadSelectedPhotos(){
  if (selectedIds.size === 0) return;

  const selected = allVisitors.filter(v => selectedIds.has(v.id));
  const withPhoto = selected.filter(v => v.photo_url);

  if (withPhoto.length === 0){
    alert('Tidak ada foto pada data yang dipilih.');
    return;
  }

  const defaultName = `foto-tamu-${new Date().toISOString().slice(0,10)}`;
  const folderName = prompt('Nama folder/file ZIP:', defaultName);
  if (folderName === null) return;
  const zipName = sanitizeFileName(folderName) || defaultName;

  const btn = document.getElementById('download-photos-btn');
  const originalLabel = btn.innerHTML;
  btn.disabled = true;

  try {
    const zip = new JSZip();
    const usedNames = new Set();
    let done = 0;

    for (const v of withPhoto){
      btn.textContent = `Menyiapkan foto... (${++done}/${withPhoto.length})`;

      let url = v._photo_signed_url;
      if (!url){
        const { data: signed } = await supabaseClient.storage
          .from('visitor-photos')
          .createSignedUrl(v.photo_url, 3600);
        url = signed ? signed.signedUrl : null;
      }
      if (!url) continue;

      const res = await fetch(url);
      if (!res.ok) continue;
      const blob = await res.blob();

      let baseName = `${v.visitor_id || v.id.slice(0,8)}_${sanitizeFileName(v.full_name)}`;
      let fileName = `${baseName}.jpg`;
      let n = 2;
      while (usedNames.has(fileName)){
        fileName = `${baseName} (${n}).jpg`;
        n++;
      }
      usedNames.add(fileName);

      zip.file(fileName, blob);
    }

    if (Object.keys(zip.files).length === 0){
      alert('Gagal mengambil foto — coba klik "Muat Ulang" lalu coba lagi.');
      return;
    }

    btn.textContent = 'Membuat ZIP...';
    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `${zipName}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  } catch (e){
    console.error(e);
    alert('Gagal menyimpan foto: ' + (e.message || 'kesalahan tidak diketahui'));
  } finally {
    btn.disabled = selectedIds.size === 0;
    btn.innerHTML = originalLabel;
  }
}

// ---------- EXPORT ----------
function exportExcel(){
  const rows = getFilteredRows();
  if (rows.length === 0){ alert('Tidak ada data untuk diexport.'); return; }

  const healthLabels = {
    health_fever:'Demam', health_diarrhea_vomiting:'Diare/Muntah', health_cough_cold_fever:'Batuk/Pilek+Demam',
    health_skin_wound:'Infeksi Kulit/Luka', health_discharge:'Cairan Mata/Telinga/Hidung',
    health_jaundice:'Penyakit Kuning', health_contact_infectious:'Kontak Penyakit Menular'
  };

  // Pertanyaan tambahan buatan admin (Form Builder) -> kolom tambahan
  const ansOf = v => Array.isArray(v.answers) ? v.answers : [];
  const customLabels = [...new Set(rows.flatMap(v => ansOf(v).filter(a => !a.legacy_key).map(a => a.label)))];
  const hasLegacyAnswer = (v,k) => ansOf(v).length === 0 || ansOf(v).some(a => a.legacy_key === k);
  const customAnswer = (v,l) => {
    const a = ansOf(v).find(x => !x.legacy_key && x.label === l);
    if (!a || a.value === null || a.value === undefined) return '';
    return typeof a.value === 'boolean' ? (a.value ? 'Ya' : 'Tidak') : a.value;
  };

  const data = rows.map(v => ({
    'ID Tamu': v.visitor_id || '',
    'Waktu Masuk': new Date(v.created_at).toLocaleString('id-ID'),
    'Nama': v.full_name,
    'Perusahaan': v.company,
    'Telepon': v.phone,
    'Email': v.email || '',
    'Tujuan': v.purpose,
    'Ditemui': v.host_name,
    'Area Dikunjungi': v.area_visited || '',
    ...Object.fromEntries(Object.entries(healthLabels).map(([k,label]) => [label, hasLegacyAnswer(v,k) ? (v[k] ? 'Ya' : 'Tidak') : ''])),
    ...Object.fromEntries(customLabels.map(l => [l, customAnswer(v,l)])),
    'Status Kesehatan': v.health_clear ? 'Baik' : 'Perlu Ditinjau',
    'GMP Disetujui': v.gmp_compliance_agreed ? 'Ya' : 'Tidak',
    'Konfirmasi Primary': v.confirmed_primary_at ? new Date(v.confirmed_primary_at).toLocaleString('id-ID') : '',
    'Konfirmasi Secondary': v.confirmed_secondary_at ? new Date(v.confirmed_secondary_at).toLocaleString('id-ID') : '',
    'Konfirmasi Keluar': v.check_out_at ? new Date(v.check_out_at).toLocaleString('id-ID') : '',
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = Object.keys(data[0]).map(k => ({ wch: Math.max(k.length, 14) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Buku Tamu');
  XLSX.writeFile(wb, `buku-tamu-${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ---------- KONFIRMASI VIA QR ----------
let scanStream = null;
let scanRAF = null;
let scanning = false;

function setupConfirmView(mode){
  stopScanner();
  const titles = { primary: 'Konfirmasi Primary', secondary: 'Konfirmasi Secondary', exit: 'Konfirmasi Keluar dari Area Factory' };
  document.getElementById('confirm-title').textContent = titles[mode] || 'Konfirmasi';
  document.getElementById('confirm-result').innerHTML = '';
  document.getElementById('manual-code').value = '';
  document.getElementById('scan-start-btn').textContent = 'Mulai Scan';
  document.getElementById('scan-hint').style.display = 'flex';
}

async function toggleScanner(){
  if (scanning){
    stopScanner();
    document.getElementById('scan-start-btn').textContent = 'Mulai Scan';
    document.getElementById('scan-hint').style.display = 'flex';
    return;
  }
  const video = document.getElementById('scan-video');
  const canvas = document.getElementById('scan-canvas');
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = scanStream;
    await video.play();
  } catch (e){
    alert('Tidak dapat mengakses kamera: ' + (e.message || 'izin ditolak. Gunakan input manual di bawah.'));
    return;
  }
  scanning = true;
  document.getElementById('scan-start-btn').textContent = 'Hentikan Scan';
  document.getElementById('scan-hint').style.display = 'none';
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  function tick(){
    if (!scanning) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA){
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code && code.data){
        const decoded = code.data.trim();
        stopScanner();
        document.getElementById('scan-start-btn').textContent = 'Mulai Scan';
        document.getElementById('scan-hint').style.display = 'flex';
        runConfirm(decoded);
        return;
      }
    }
    scanRAF = requestAnimationFrame(tick);
  }
  scanRAF = requestAnimationFrame(tick);
}

function stopScanner(){
  scanning = false;
  if (scanRAF) cancelAnimationFrame(scanRAF);
  scanRAF = null;
  if (scanStream){
    scanStream.getTracks().forEach(t => t.stop());
    scanStream = null;
  }
}

function confirmManual(){
  const code = document.getElementById('manual-code').value.trim();
  if (!code) return;
  runConfirm(code);
}

async function runConfirm(code){
  const fnMap = { primary: 'confirm_primary', secondary: 'confirm_secondary', exit: 'confirm_exit' };
  const fn = fnMap[currentConfirmMode];
  if (!fn) return;
  const box = document.getElementById('confirm-result');
  box.innerHTML = '<div class="confirm-loading">Memproses...</div>';
  const { data, error } = await supabaseClient.rpc(fn, { p_visitor_code: code });
  if (error){
    box.innerHTML = `<div class="confirm-card err">${escapeHtml(error.message)}</div>`;
    return;
  }
  const r = data;
  box.innerHTML = `
    <div class="confirm-card ${r.already ? 'warn' : 'ok'}">
      <div class="cc-name">${escapeHtml(r.full_name)}</div>
      <div class="cc-sub">${escapeHtml(r.company)} — ID ${escapeHtml(r.visitor_id)} — Host: ${escapeHtml(r.host_name || '—')}</div>
      <div class="cc-status">${r.already ? 'SUDAH DIKONFIRMASI SEBELUMNYA' : 'BERHASIL DIKONFIRMASI'} • ${new Date(r.confirmed_at).toLocaleString('id-ID')}</div>
    </div>`;
  document.getElementById('manual-code').value = '';
  loadVisitors();
}

// ---------- KARYAWAN & MAPPING AKUN (superadmin) ----------
let mappingProfiles = [];

async function loadMappingData(){
  const [{ data: emps, error: e1 }, { data: profs, error: e2 }] = await Promise.all([
    supabaseClient.from('employees').select('*').order('full_name').limit(5000),
    supabaseClient.from('profiles').select('*').order('email')
  ]);
  if (e1 || e2){
    alert('Gagal memuat data karyawan: ' + ((e1 || e2).message));
    return;
  }
  allEmployeesCache = emps || [];
  mappingProfiles = profs || [];
  fillDeptFilter();
  renderEmployeesTable();
  renderProfilesTable();
}

function fillDeptFilter(){
  const sel = document.getElementById('emp-filter-dept');
  const cur = sel.value;
  const depts = [...new Set(allEmployeesCache.map(e => e.department).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">Semua Departemen</option>' +
    depts.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  sel.value = depts.includes(cur) ? cur : '';
}

function renderEmployeesTable(){
  const tbody = document.getElementById('mapping-employees-body');
  const q = (document.getElementById('emp-search').value || '').trim().toLowerCase();
  const dept = document.getElementById('emp-filter-dept').value;
  const st = document.getElementById('emp-filter-status').value;
  const list = allEmployeesCache.filter(e =>
    (!q || [e.full_name, e.employee_no, e.department].some(x => (x || '').toLowerCase().includes(q))) &&
    (!dept || e.department === dept) &&
    (!st || (st === 'active') === !!e.active)
  );
  document.getElementById('emp-count').textContent =
    `${list.length} dari ${allEmployeesCache.length} karyawan`;
  if (list.length === 0){
    tbody.innerHTML = '<tr><td colspan="4" style="color:#8a8578;">Tidak ada karyawan yang cocok.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(e => `
    <tr>
      <td>${escapeHtml(e.employee_no || '—')}</td>
      <td>${escapeHtml(e.full_name)}</td>
      <td>${escapeHtml(e.department || '—')}</td>
      <td><input type="checkbox" ${e.active ? 'checked' : ''} onchange="toggleEmployeeActive('${e.id}', this.checked)"></td>
    </tr>
  `).join('');
}

async function addEmployee(){
  const nameEl = document.getElementById('new-emp-name');
  const deptEl = document.getElementById('new-emp-dept');
  const noEl = document.getElementById('new-emp-no');
  const name = nameEl.value.trim();
  const dept = deptEl.value.trim();
  const no = noEl.value.trim();
  if (!name){ alert('Nama karyawan wajib diisi.'); return; }
  const { error } = await supabaseClient.from('employees')
    .insert({ full_name: name, department: dept || null, employee_no: no || null });
  if (error){ alert('Gagal menambah karyawan: ' + error.message); return; }
  nameEl.value = ''; deptEl.value = ''; noEl.value = '';
  loadMappingData();
}

async function toggleEmployeeActive(id, active){
  const { error } = await supabaseClient.from('employees').update({ active }).eq('id', id);
  if (error){ alert('Gagal mengubah status: ' + error.message); loadMappingData(); return; }
  const e = allEmployeesCache.find(x => x.id === id);
  if (e) e.active = active;
}

// ---- Picker karyawan yang bisa dicari (input + datalist) ----
function empLabel(e){
  return (e.employee_no ? e.employee_no + ' · ' : '') + e.full_name + (e.department ? ' — ' + e.department : '');
}
function empDatalistHtml(id, onlyActive){
  return `<datalist id="${id}">` +
    allEmployeesCache.filter(e => !onlyActive || e.active)
      .map(e => `<option value="${escapeHtml(empLabel(e))}"></option>`).join('') + '</datalist>';
}
function empIdFromLabel(label){
  const e = allEmployeesCache.find(x => empLabel(x) === (label || '').trim());
  return e ? e.id : null;
}
function empLabelFromId(id){
  const e = allEmployeesCache.find(x => x.id === id);
  return e ? empLabel(e) : '';
}

// ---- Checkbox multi role ----
function roleChecksHtml(prefix, selected, onchange){
  return ALL_ROLES.map(r => `
    <label class="role-check">
      <input type="checkbox" value="${r}" data-group="${prefix}" ${selected.includes(r) ? 'checked' : ''} onchange="${onchange}">
      <span>${roleLabel(r)}</span>
    </label>`).join('');
}
function checkedRoles(prefix){
  return [...document.querySelectorAll(`input[data-group="${prefix}"]:checked`)].map(i => i.value);
}

function renderProfilesTable(){
  const tbody = document.getElementById('mapping-profiles-body');
  const q = (document.getElementById('prof-search').value || '').trim().toLowerCase();
  const profs = mappingProfiles.filter(p => !q || (p.email || '').toLowerCase().includes(q));
  if (profs.length === 0){
    tbody.innerHTML = '<tr><td colspan="4" style="color:#8a8578;">Belum ada akun.</td></tr>';
    return;
  }
  tbody.innerHTML = profs.map(p => {
    const roles = p.roles || [];
    return `
    <tr>
      <td>${escapeHtml(p.email || '—')}</td>
      <td><div class="role-checks">${roleChecksHtml('role-' + p.id, roles, `onMappingRoleChange('${p.id}')`)}</div></td>
      <td>
        <input type="text" id="emp-${p.id}" list="emp-list-all" placeholder="Cari nama / nomor karyawan…"
               value="${escapeHtml(empLabelFromId(p.employee_id))}" style="${roles.includes('employee') ? '' : 'display:none;'}">
      </td>
      <td><button class="btn-outline" onclick="saveProfile('${p.id}')">Simpan</button></td>
    </tr>`;
  }).join('') + empDatalistHtml('emp-list-all', false);
}

function onMappingRoleChange(id){
  const has = checkedRoles('role-' + id).includes('employee');
  document.getElementById('emp-' + id).style.display = has ? '' : 'none';
}

async function saveProfile(id){
  const roles = checkedRoles('role-' + id);
  let empId = null;
  if (roles.includes('employee')){
    const label = document.getElementById('emp-' + id).value;
    empId = empIdFromLabel(label);
    if (!empId){ alert('Role Employee perlu karyawan terkait. Pilih dari daftar saran.'); return; }
  }
  const { error } = await supabaseClient.from('profiles').update({ roles, employee_id: empId }).eq('id', id);
  if (error){ alert('Gagal menyimpan: ' + error.message); return; }
  alert('Tersimpan.');
  if (id === currentProfile?.id) location.reload();
}

// ---------- KELOLA AKUN (superadmin) ----------
let akunProfiles = [];

async function loadAkunData(){
  const [{ data: emps, error: e1 }, { data: profs, error: e2 }] = await Promise.all([
    supabaseClient.from('employees').select('*').order('full_name').limit(5000),
    supabaseClient.from('profiles').select('*').order('email')
  ]);
  if (e1 || e2){
    alert('Gagal memuat data akun: ' + ((e1 || e2).message));
    return;
  }
  allEmployeesCache = emps || [];
  akunProfiles = profs || [];
  document.getElementById('akun-roles').innerHTML = roleChecksHtml('akun-new', [], 'onAkunRoleChange()');
  document.getElementById('akun-emp-list').innerHTML = empDatalistHtml('akun-emp-dl', true);
  onAkunRoleChange();
  renderAkunTable();
}

function onAkunRoleChange(){
  document.getElementById('akun-emp').style.display = checkedRoles('akun-new').includes('employee') ? '' : 'none';
}

function renderAkunTable(){
  const tbody = document.getElementById('akun-body');
  if (akunProfiles.length === 0){
    tbody.innerHTML = '<tr><td colspan="5" style="color:#8a8578;">Belum ada akun.</td></tr>';
    return;
  }
  const myId = currentProfile && currentProfile.id;
  tbody.innerHTML = akunProfiles.map(p => {
    const emp = allEmployeesCache.find(e => e.id === p.employee_id);
    const isMe = p.id === myId;
    const roles = p.roles || [];
    return `
      <tr>
        <td>${escapeHtml(p.email || '—')}${isMe ? '<span class="you-pill">Anda</span>' : ''}</td>
        <td>${roles.length ? roles.map(r => `<span class="role-pill">${roleLabel(r)}</span>`).join(' ') : roleLabel('unrole')}</td>
        <td>${emp ? escapeHtml(emp.full_name) : '—'}</td>
        <td>${p.created_at ? new Date(p.created_at).toLocaleDateString('id-ID') : '—'}</td>
        <td>
          <div class="akun-actions">
            <button class="btn-outline" style="padding:6px 10px;font-size:12px;" onclick="openEditAkun('${p.id}')">Edit</button>
            <button class="btn-outline" style="padding:6px 10px;font-size:12px;" onclick="resetAkunPassword('${p.id}')">Reset Password</button>
            <button class="btn-danger-sm" ${isMe ? 'disabled style="opacity:.45;cursor:not-allowed;"' : ''} onclick="deleteAkun('${p.id}')">Hapus</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

async function createAkun(){
  const email = document.getElementById('akun-email').value.trim();
  const pass = document.getElementById('akun-pass').value;
  const roles = checkedRoles('akun-new');
  let empId = null;
  if (!email){ alert('Email wajib diisi.'); return; }
  if (pass.length < 8){ alert('Password minimal 8 karakter.'); return; }
  if (roles.includes('employee')){
    empId = empIdFromLabel(document.getElementById('akun-emp').value);
    if (!empId){ alert('Pilih karyawan terkait dari daftar saran untuk role Employee.'); return; }
  }

  const btn = document.getElementById('akun-create-btn');
  btn.disabled = true;
  const { error } = await supabaseClient.rpc('admin_create_user', {
    p_email: email, p_password: pass, p_roles: roles, p_employee_id: empId
  });
  btn.disabled = false;
  if (error){ alert('Gagal membuat akun: ' + error.message); return; }

  document.getElementById('akun-email').value = '';
  document.getElementById('akun-pass').value = '';
  document.getElementById('akun-emp').value = '';
  await loadAkunData();
  alert('Akun berhasil dibuat.');
}

function openEditAkun(id){
  const p = akunProfiles.find(x => x.id === id);
  if (!p) return;
  const roles = p.roles || [];
  document.getElementById('modal-content').innerHTML = `
    <h3 style="margin-top:0;">Edit Akun</h3>
    <div class="field"><label>Email</label>
      <input type="email" id="edit-akun-email" value="${escapeHtml(p.email || '')}" autocomplete="off"></div>
    <div class="field"><label>Role (boleh lebih dari satu)</label>
      <div class="role-checks">${roleChecksHtml('edit-akun', roles, 'onEditAkunRoleChange()')}</div></div>
    <div class="field" id="edit-akun-emp-wrap" style="${roles.includes('employee') ? '' : 'display:none;'}">
      <label>Karyawan Terkait</label>
      <input type="text" id="edit-akun-emp" list="edit-akun-dl" autocomplete="off"
             placeholder="Cari nama / nomor karyawan…" value="${escapeHtml(empLabelFromId(p.employee_id))}">
      ${empDatalistHtml('edit-akun-dl', false)}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;">
      <button class="btn-primary" id="edit-akun-save" style="width:auto;padding:0 22px;" onclick="saveEditAkun('${p.id}')">Simpan</button>
      <button class="btn-outline" onclick="closeModal()">Batal</button>
    </div>`;
  document.getElementById('modal-bg').classList.add('show');
}

function onEditAkunRoleChange(){
  document.getElementById('edit-akun-emp-wrap').style.display =
    checkedRoles('edit-akun').includes('employee') ? '' : 'none';
}

async function saveEditAkun(id){
  const email = document.getElementById('edit-akun-email').value.trim();
  const roles = checkedRoles('edit-akun');
  let empId = null;
  if (!email){ alert('Email wajib diisi.'); return; }
  if (roles.includes('employee')){
    empId = empIdFromLabel(document.getElementById('edit-akun-emp').value);
    if (!empId){ alert('Pilih karyawan terkait dari daftar saran untuk role Employee.'); return; }
  }
  const btn = document.getElementById('edit-akun-save');
  btn.disabled = true;
  const { error } = await supabaseClient.rpc('admin_update_user', {
    p_user_id: id, p_email: email, p_roles: roles, p_employee_id: empId
  });
  btn.disabled = false;
  if (error){ alert('Gagal menyimpan akun: ' + error.message); return; }
  closeModal();
  if (id === currentProfile?.id){ alert('Akun Anda diperbarui. Halaman akan dimuat ulang.'); location.reload(); return; }
  await loadAkunData();
}

async function resetAkunPassword(id){
  const p = akunProfiles.find(x => x.id === id);
  if (!p) return;
  const pass = prompt(`Password baru untuk ${p.email} (min. 8 karakter):`);
  if (pass === null) return;
  if (pass.length < 8){ alert('Password minimal 8 karakter.'); return; }
  const { error } = await supabaseClient.rpc('admin_reset_password', { p_user_id: id, p_password: pass });
  if (error){ alert('Gagal reset password: ' + error.message); return; }
  alert('Password berhasil direset.');
}

async function deleteAkun(id){
  const p = akunProfiles.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Hapus akun ${p.email}? Tindakan ini tidak bisa dibatalkan.`)) return;
  const { error } = await supabaseClient.rpc('admin_delete_user', { p_user_id: id });
  if (error){ alert('Gagal menghapus akun: ' + error.message); return; }
  await loadAkunData();
}
