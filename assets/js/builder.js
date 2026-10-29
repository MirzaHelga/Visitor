// =====================================================================
// FORM BUILDER (khusus Superadmin) — atur pertanyaan form tamu
// Data: tabel public.form_questions (lihat database/schema.sql bagian 8)
// Memakai variabel global dari admin.js: supabaseClient, escapeHtml
// =====================================================================
let builderQuestions = [];
let builderSettings = {};
let bsError = null;
let bqEditingId = null;     // null = tambah baru
let bqEditingSection = 'general';

const BQ_SECTIONS = {
  general: 'Langkah 1 — Data Diri Tamu',
  health:  'Langkah 2 — Skrining Kesehatan'
};
const BQ_TYPES = {
  text:'Teks singkat', textarea:'Teks panjang', tel:'Nomor telepon', email:'Email',
  number:'Angka', date:'Tanggal', choice:'Pilihan (dropdown)',
  multichoice:'Pilihan ganda (centang)', yesno:'Ya / Tidak',
  host:'Daftar karyawan (host)'
};
const BQ_NEW_TYPES = Object.keys(BQ_TYPES).filter(t => t !== 'host');  // host hanya untuk pertanyaan inti
const BQ_TEXT_LIKE = ['text','textarea','tel','email','number'];

async function loadBuilder(){
  const { data, error } = await supabaseClient
    .from('form_questions').select('*').order('section').order('sort_order');
  const box = document.getElementById('builder-body');
  if (error){
    box.innerHTML = `<div class="err show" style="display:block;">Gagal memuat pertanyaan: ${escapeHtml(error.message)}<br>
      Pastikan <b>database/schema.sql</b> sudah dijalankan ulang di Supabase SQL Editor (bagian 8 — Form Builder).</div>`;
    return;
  }
  builderQuestions = data || [];
  const sres = await supabaseClient.from('form_settings').select('*');
  bsError = sres.error || null;
  builderSettings = {};
  (sres.data || []).forEach(r => { builderSettings[r.key] = r; });
  renderBuilder();
}

function bqSection(section){
  return builderQuestions.filter(q => q.section === section).sort((a,b) => a.sort_order - b.sort_order);
}

function renderBuilder(){
  const box = document.getElementById('builder-body');
  box.innerHTML = Object.keys(BQ_SECTIONS).map(section => {
    const list = bqSection(section);
    const items = list.length === 0
      ? '<div class="bq-empty">Belum ada pertanyaan.</div>'
      : list.map((q, i) => {
          const tags = [
            `<span class="badge">${escapeHtml(BQ_TYPES[q.field_type] || q.field_type)}</span>`,
            q.required ? '<span class="badge warn">Wajib</span>' : '<span class="badge">Opsional</span>',
            q.is_core ? '<span class="badge ok">Inti</span>' : '',
            !q.active ? '<span class="badge warn">Nonaktif</span>' : '',
            (q.field_type === 'yesno' && q.flag_on_yes) ? '<span class="badge warn">Ya = ditinjau</span>' : ''
          ].join(' ');
          return `
          <div class="bq ${q.active ? '' : 'off'}">
            <div class="bq-no">${i + 1}</div>
            <div class="bq-main">
              <div class="bq-label">${escapeHtml(q.label_id)}</div>
              ${q.label_en ? `<div class="bq-sub">${escapeHtml(q.label_en)}</div>` : ''}
              <div class="bq-tags">${tags}</div>
            </div>
            <div class="bq-actions">
              <button class="btn-outline" title="Naik" ${i === 0 ? 'disabled' : ''} onclick="bqMove('${q.id}',-1)">▲</button>
              <button class="btn-outline" title="Turun" ${i === list.length - 1 ? 'disabled' : ''} onclick="bqMove('${q.id}',1)">▼</button>
              <button class="btn-outline" onclick="bqOpenEditor('${q.id}')">Edit</button>
              ${q.is_core ? '' : `<button class="btn-outline bq-del" onclick="bqDelete('${q.id}')">Hapus</button>`}
            </div>
          </div>`;
        }).join('');
    return `
      <div class="mapping-section">
        <h2>${BQ_SECTIONS[section]}</h2>
        <div class="bq-list">${items}</div>
        <button class="btn-outline" style="margin-top:10px;" onclick="bqOpenEditor(null,'${section}')">+ Tambah Pertanyaan</button>
      </div>`;
  }).join('') + '<div class="mapping-section" id="bs-card"></div>';
  renderSettingsCard();
}

// ---------- URUTAN ----------
async function bqMove(id, dir){
  const q = builderQuestions.find(x => x.id === id);
  if (!q) return;
  const list = bqSection(q.section);
  const i = list.findIndex(x => x.id === id);
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  // nomori ulang berurutan (10, 20, 30, ...) lalu simpan yang berubah
  const jobs = [];
  list.forEach((item, idx) => {
    const so = (idx + 1) * 10;
    if (item.sort_order !== so){
      item.sort_order = so;
      jobs.push(supabaseClient.from('form_questions').update({ sort_order: so }).eq('id', item.id));
    }
  });
  renderBuilder();
  const results = await Promise.all(jobs);
  const err = results.find(r => r.error);
  if (err){ alert('Gagal mengubah urutan: ' + err.error.message); loadBuilder(); }
}

// ---------- HAPUS ----------
async function bqDelete(id){
  const q = builderQuestions.find(x => x.id === id);
  if (!q || q.is_core) return;
  if (!confirm(`Hapus pertanyaan "${q.label_id}"?\n\nData tamu yang sudah masuk tidak ikut terhapus (jawaban lama tetap tersimpan). Kalau hanya ingin menyembunyikan sementara, pakai Edit > nonaktifkan.`)) return;
  const { error } = await supabaseClient.from('form_questions').delete().eq('id', id);
  if (error){ alert('Gagal menghapus: ' + error.message); return; }
  loadBuilder();
}

// ---------- EDITOR (modal) ----------
function bqOpenEditor(id, section){
  const q = id ? builderQuestions.find(x => x.id === id) : null;
  bqEditingId = q ? q.id : null;
  bqEditingSection = q ? q.section : (section || 'general');
  const isCore = !!(q && q.is_core);
  const types = isCore ? Object.keys(BQ_TYPES) : BQ_NEW_TYPES;

  document.getElementById('bq-modal').innerHTML = `
    <h2 style="margin:0 0 4px;font-size:17px;">${q ? 'Edit Pertanyaan' : 'Tambah Pertanyaan'}</h2>
    <p style="font-size:12px;color:#5c6b66;margin:0 0 14px;">${BQ_SECTIONS[bqEditingSection]}${isCore ? ' · pertanyaan inti (tipe, wajib &amp; aktif dikunci)' : ''}</p>
    <div class="err" id="bq-err"></div>
    <div class="field"><label>Pertanyaan (Indonesia) *</label><input type="text" id="bq-label-id"></div>
    <div class="field"><label>Pertanyaan (English) <span style="font-weight:400;color:#8a8578;">— opsional, kosong = pakai Indonesia</span></label><input type="text" id="bq-label-en"></div>
    <div class="field"><label>Tipe jawaban</label>
      <select id="bq-type" style="width:100%;" onchange="bqTypeChanged()" ${isCore ? 'disabled' : ''}>
        ${types.map(t => `<option value="${t}">${BQ_TYPES[t]}</option>`).join('')}
      </select></div>
    <div class="field" id="bq-options-wrap"><label>Pilihan jawaban * <span style="font-weight:400;color:#8a8578;">— satu per baris, minimal 2</span></label>
      <textarea id="bq-options" rows="4" style="width:100%;border:1.5px solid var(--line);border-radius:9px;padding:10px 12px;font-family:inherit;font-size:14px;"></textarea></div>
    <div class="field" id="bq-ph-wrap"><label>Contoh isian (placeholder)</label><input type="text" id="bq-placeholder"></div>
    <label class="bq-check"><input type="checkbox" id="bq-required" ${isCore ? 'disabled' : ''}> Wajib diisi</label>
    <label class="bq-check" id="bq-flag-wrap"><input type="checkbox" id="bq-flag"> Jawaban "Ya" membuat status tamu menjadi <b>Perlu Ditinjau</b></label>
    <label class="bq-check"><input type="checkbox" id="bq-active" ${isCore ? 'disabled' : ''}> Tampilkan di form tamu</label>
    <button class="btn-primary" style="margin-top:16px;" id="bq-save" onclick="bqSave()">Simpan</button>
    <button class="modal-close" onclick="bqCloseEditor()">Batal</button>`;

  // isi nilai lewat DOM (bukan lewat atribut HTML) supaya aman dari karakter khusus
  document.getElementById('bq-label-id').value = q ? q.label_id : '';
  document.getElementById('bq-label-en').value = q ? (q.label_en || '') : '';
  document.getElementById('bq-type').value = q ? q.field_type : (bqEditingSection === 'health' ? 'yesno' : 'text');
  document.getElementById('bq-options').value = q && Array.isArray(q.options) ? q.options.join('\n') : '';
  document.getElementById('bq-placeholder').value = q ? (q.placeholder || '') : '';
  document.getElementById('bq-required').checked = q ? !!q.required : (bqEditingSection === 'health');
  document.getElementById('bq-flag').checked = q ? !!q.flag_on_yes : (bqEditingSection === 'health');
  document.getElementById('bq-active').checked = q ? !!q.active : true;
  bqTypeChanged();
  document.getElementById('bq-modal-bg').classList.add('show');
}

function bqTypeChanged(){
  const t = document.getElementById('bq-type').value;
  document.getElementById('bq-options-wrap').style.display = (t === 'choice' || t === 'multichoice') ? '' : 'none';
  document.getElementById('bq-ph-wrap').style.display = BQ_TEXT_LIKE.includes(t) ? '' : 'none';
  document.getElementById('bq-flag-wrap').style.display = t === 'yesno' ? '' : 'none';
}

function bqCloseEditor(){ document.getElementById('bq-modal-bg').classList.remove('show'); }

function bqShowErr(msg){
  const el = document.getElementById('bq-err');
  el.textContent = msg; el.classList.add('show');
}

async function bqSave(){
  const labelId = document.getElementById('bq-label-id').value.trim();
  if (!labelId){ bqShowErr('Teks pertanyaan (Indonesia) wajib diisi.'); return; }
  const type = document.getElementById('bq-type').value;
  let options = null;
  if (type === 'choice' || type === 'multichoice'){
    options = [...new Set(document.getElementById('bq-options').value.split('\n').map(s => s.trim()).filter(Boolean))];
    if (options.length < 2){ bqShowErr('Pilihan jawaban minimal 2 (satu per baris, tidak boleh sama).'); return; }
  }
  const fields = {
    label_id: labelId,
    label_en: document.getElementById('bq-label-en').value.trim() || null,
    placeholder: BQ_TEXT_LIKE.includes(type) ? (document.getElementById('bq-placeholder').value.trim() || null) : null,
    options,
    flag_on_yes: type === 'yesno' && document.getElementById('bq-flag').checked,
  };
  const btn = document.getElementById('bq-save');
  btn.disabled = true;

  let error;
  if (bqEditingId){
    const q = builderQuestions.find(x => x.id === bqEditingId);
    if (!q.is_core){
      fields.field_type = type;
      fields.required = document.getElementById('bq-required').checked;
      fields.active = document.getElementById('bq-active').checked;
    }
    ({ error } = await supabaseClient.from('form_questions').update(fields).eq('id', bqEditingId));
  } else {
    const list = bqSection(bqEditingSection);
    const next = list.length ? Math.max(...list.map(x => x.sort_order)) + 10 : 10;
    ({ error } = await supabaseClient.from('form_questions').insert({
      ...fields, section: bqEditingSection, field_type: type, sort_order: next,
      required: document.getElementById('bq-required').checked,
      active: document.getElementById('bq-active').checked,
      is_core: false, legacy_key: null
    }));
  }
  btn.disabled = false;
  if (error){ bqShowErr('Gagal menyimpan: ' + error.message); return; }
  bqCloseEditor();
  loadBuilder();
}

// =====================================================================
// TEKS HALAMAN — judul/keterangan langkah & aturan GMP (tabel form_settings)
// =====================================================================
const BS_FIELDS = [
  ['step1_title', 'Judul Langkah 1', 1],
  ['step1_desc',  'Keterangan Langkah 1', 2],
  ['step2_title', 'Judul Langkah 2', 1],
  ['step2_desc',  'Keterangan Langkah 2', 3],
  ['step3_title', 'Judul Langkah 3 (Foto & GMP)', 1],
  ['step3_desc',  'Keterangan Langkah 3', 2],
  ['gmp_rules',   'Aturan GMP — satu aturan per baris', 6],
];

function renderSettingsCard(){
  const card = document.getElementById('bs-card');
  if (!card) return;
  card.innerHTML = '';
  const h2 = document.createElement('h2'); h2.textContent = 'Teks Halaman';
  card.appendChild(h2);
  if (bsError){
    const e = document.createElement('div'); e.className = 'err show'; e.style.display = 'block';
    e.textContent = 'Tabel form_settings belum ada / gagal dimuat (' + bsError.message + '). Jalankan ulang database/schema.sql (bagian 8b).';
    card.appendChild(e);
    return;
  }
  const hint = document.createElement('p');
  hint.style.cssText = 'font-size:12.5px;color:#5c6b66;margin-top:-8px;';
  hint.textContent = 'Judul, keterangan, dan daftar aturan GMP di form tamu. Kosongkan kolom Indonesia untuk memakai teks bawaan; kolom English kosong = pakai teks Indonesia.';
  card.appendChild(hint);

  BS_FIELDS.forEach(([key, label, rows]) => {
    const row = builderSettings[key] || {};
    const f = document.createElement('div'); f.className = 'field';
    const lb = document.createElement('label'); lb.textContent = label; f.appendChild(lb);
    const grid = document.createElement('div'); grid.className = 'bs-grid';
    [['id', 'Indonesia', row.value_id], ['en', 'English', row.value_en]].forEach(([lng, ph, val]) => {
      const el = document.createElement(rows > 1 ? 'textarea' : 'input');
      if (rows > 1) el.rows = rows; else el.type = 'text';
      el.className = 'bs-input'; el.dataset.key = key; el.dataset.lng = lng;
      el.placeholder = ph; el.value = val || '';
      grid.appendChild(el);
    });
    f.appendChild(grid); card.appendChild(f);
  });
  const btn = document.createElement('button');
  btn.className = 'btn-primary'; btn.style.maxWidth = '260px'; btn.id = 'bs-save';
  btn.textContent = 'Simpan Teks Halaman'; btn.onclick = bsSave;
  card.appendChild(btn);
  const msg = document.createElement('span'); msg.id = 'bs-msg'; msg.style.cssText = 'margin-left:12px;font-size:13px;font-weight:700;';
  card.appendChild(msg);
}

async function bsSave(){
  const rows = BS_FIELDS.map(([key]) => {
    const get = lng => document.querySelector(`.bs-input[data-key="${key}"][data-lng="${lng}"]`).value.trim();
    return { key, value_id: get('id'), value_en: get('en') || null, updated_at: new Date().toISOString() };
  });
  const btn = document.getElementById('bs-save'); const msg = document.getElementById('bs-msg');
  btn.disabled = true; msg.textContent = '';
  const { error } = await supabaseClient.from('form_settings').upsert(rows, { onConflict: 'key' });
  btn.disabled = false;
  msg.style.color = error ? 'var(--red)' : 'var(--ok)';
  msg.textContent = error ? 'Gagal menyimpan: ' + error.message : 'Tersimpan ✓';
  if (!error) rows.forEach(r => { builderSettings[r.key] = r; });
}
