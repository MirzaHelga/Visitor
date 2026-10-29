const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

// ---------- SIDEBAR ----------
function openSidebar(){
  document.getElementById('sidebar').classList.add('show');
  document.getElementById('sidebar-overlay').classList.add('show');
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('show');
  document.getElementById('sidebar-overlay').classList.remove('show');
}

// ---------- LANGUAGE ----------
function lang(){ return document.documentElement.getAttribute('data-active-lang') || 'id'; }
function setLang(l){
  document.documentElement.setAttribute('data-active-lang', l);
  document.getElementById('lang-id').classList.toggle('active', l==='id');
  document.getElementById('lang-en').classList.toggle('active', l==='en');
  localStorage.setItem('visitor_lang', l);
  renderQuestions();
  applySettings();
  renderSummary();
}

// =====================================================================
// PERTANYAAN FORM — dimuat dari tabel `form_questions` (diatur lewat
// halaman Form Builder di admin). DEFAULT_QUESTIONS dipakai sebagai
// cadangan kalau tabel belum dibuat / gagal dimuat, jadi form tidak
// pernah kosong. Isinya sama dengan seed di database/schema.sql.
// =====================================================================
const DEFAULT_QUESTIONS = [
  { id:'d_full_name', section:'general', field_type:'text', label_id:'Nama Lengkap', label_en:'Full Name', required:true, legacy_key:'full_name' },
  { id:'d_company', section:'general', field_type:'text', label_id:'Perusahaan / Instansi Asal', label_en:'Company / Institution', required:true, legacy_key:'company' },
  { id:'d_phone', section:'general', field_type:'tel', label_id:'No. Telepon', label_en:'Phone Number', required:true, legacy_key:'phone' },
  { id:'d_email', section:'general', field_type:'email', label_id:'Email', label_en:'Email', required:false, legacy_key:'email' },
  { id:'d_purpose', section:'general', field_type:'textarea', label_id:'Tujuan Kunjungan', label_en:'Purpose of Visit', required:true, legacy_key:'purpose' },
  { id:'d_host', section:'general', field_type:'host', label_id:'Yang Ditemui / Bagian Dituju', label_en:'Person / Department to Visit', required:true, legacy_key:'host' },
  { id:'d_area', section:'general', field_type:'text', label_id:'Area Pabrik yang Dikunjungi', label_en:'Factory Area to Visit', placeholder:'cth. Produksi, Gudang, Kantor / e.g. Production, Warehouse, Office', required:false, legacy_key:'area_visited' },
  { id:'d_h1', section:'health', field_type:'yesno', label_id:'Demam atau suhu tubuh tinggi dalam 48 jam terakhir?', label_en:'Fever or high temperature in the last 48 hours?', required:true, flag_on_yes:true, legacy_key:'health_fever' },
  { id:'d_h2', section:'health', field_type:'yesno', label_id:'Diare dan/atau muntah dalam 48 jam terakhir?', label_en:'Diarrhea and/or vomiting in the last 48 hours?', required:true, flag_on_yes:true, legacy_key:'health_diarrhea_vomiting' },
  { id:'d_h3', section:'health', field_type:'yesno', label_id:'Batuk/pilek yang disertai demam?', label_en:'Cough/cold accompanied by fever?', required:true, flag_on_yes:true, legacy_key:'health_cough_cold_fever' },
  { id:'d_h4', section:'health', field_type:'yesno', label_id:'Infeksi kulit, bisul, atau luka terbuka yang tidak tertutup rapat?', label_en:'Skin infection, boils, or open wound not properly covered?', required:true, flag_on_yes:true, legacy_key:'health_skin_wound' },
  { id:'d_h5', section:'health', field_type:'yesno', label_id:'Keluar cairan atau nanah dari telinga, mata, atau hidung?', label_en:'Discharge or pus from ear, eye, or nose?', required:true, flag_on_yes:true, legacy_key:'health_discharge' },
  { id:'d_h6', section:'health', field_type:'yesno', label_id:'Sedang mengalami penyakit kuning (jaundice)?', label_en:'Currently experiencing jaundice?', required:true, flag_on_yes:true, legacy_key:'health_jaundice' },
  { id:'d_h7', section:'health', field_type:'yesno', label_id:'Kontak dengan orang yang menderita penyakit menular dalam 14 hari terakhir?', label_en:'Contact with someone with an infectious disease in the last 14 days?', required:true, flag_on_yes:true, legacy_key:'health_contact_infectious' },
];
// Hanya key ini yang boleh ikut ke kolom lama tabel visitors (daftar putih).
const LEGACY_TEXT_KEYS = ['full_name','company','phone','email','purpose','area_visited'];
const LEGACY_HEALTH_KEYS = ['health_fever','health_diarrhea_vomiting','health_cough_cold_fever','health_skin_wound','health_discharge','health_jaundice','health_contact_infectious'];

let QUESTIONS = DEFAULT_QUESTIONS.slice();
let EMPLOYEES = [];
const answers = {};   // id pertanyaan -> string | boolean | string[]

function qLabel(q){ return lang()==='id' ? q.label_id : (q.label_en || q.label_id); }
function sectionQs(section){ return QUESTIONS.filter(q => q.section === section); }

async function loadQuestions(){
  try {
    const { data, error } = await supabaseClient
      .from('form_questions').select('*').eq('active', true)
      .order('section').order('sort_order');
    if (error || !data || data.length === 0) return;   // pakai DEFAULT_QUESTIONS
    QUESTIONS = data;
  } catch (e) { console.warn('form_questions tidak bisa dimuat, pakai bawaan', e); }
  renderQuestions();
}

async function loadHostOptions(){
  const { data, error } = await supabaseClient
    .from('employees').select('id, full_name, department')
    .eq('active', true).order('full_name').limit(5000);
  EMPLOYEES = (!error && data) ? data : [];
  renderQuestions();
}

// ---------- RENDER ----------
function buildQuestionEl(q){
  const L = lang();
  if (q.field_type === 'yesno'){
    const card = document.createElement('div');
    card.className = 'hq';
    const qd = document.createElement('div'); qd.className = 'q'; qd.textContent = qLabel(q);
    const opts = document.createElement('div'); opts.className = 'opts';
    [[false, L==='id'?'Tidak':'No'], [true, L==='id'?'Ya':'Yes']].forEach(([val, txt]) => {
      const o = document.createElement('div');
      o.className = 'opt'; o.textContent = txt;
      if (answers[q.id] === val) o.classList.add(val ? 'selected-yes' : 'selected-no');
      o.onclick = () => {
        answers[q.id] = val;
        opts.querySelectorAll('.opt').forEach(x => x.classList.remove('selected-no','selected-yes'));
        o.classList.add(val ? 'selected-yes' : 'selected-no');
        updateHealthBanner();
      };
      opts.appendChild(o);
    });
    card.append(qd, opts);
    return card;
  }

  const f = document.createElement('div'); f.className = 'field';
  const lb = document.createElement('label'); lb.textContent = qLabel(q);
  if (q.required){ const r = document.createElement('span'); r.className = 'req'; r.textContent = ' *'; lb.appendChild(r); }
  f.appendChild(lb);

  const pick = L==='id' ? '-- Pilih --' : '-- Select --';
  let input;
  if (q.field_type === 'multichoice'){
    input = document.createElement('div'); input.className = 'choice-group';
    const cur = Array.isArray(answers[q.id]) ? answers[q.id] : [];
    (q.options || []).forEach(opt => {
      const row = document.createElement('label'); row.className = 'checkbox-row';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = cur.includes(opt);
      cb.onchange = () => {
        const set = new Set(Array.isArray(answers[q.id]) ? answers[q.id] : []);
        cb.checked ? set.add(opt) : set.delete(opt);
        answers[q.id] = (q.options || []).filter(o => set.has(o));
      };
      const sp = document.createElement('span'); sp.textContent = opt;
      row.append(cb, sp); input.appendChild(row);
    });
  } else if (q.field_type === 'host'){
    // Pilihan host yang bisa dicari: ketik nama / nomor / departemen, lalu pilih dari saran.
    const label = e => e.full_name + (e.department ? ' — ' + e.department : '');
    input = document.createElement('input');
    input.type = 'search';
    input.setAttribute('list', 'hostlist-' + q.id);
    input.autocomplete = 'off';
    input.placeholder = EMPLOYEES.length === 0
      ? (L==='id' ? 'Tidak ada data karyawan' : 'No employees found')
      : (L==='id' ? 'Ketik untuk mencari nama karyawan…' : 'Type to search employee name…');
    const dl = document.createElement('datalist'); dl.id = 'hostlist-' + q.id;
    EMPLOYEES.forEach(e => { const o = document.createElement('option'); o.value = label(e); dl.appendChild(o); });
    const cur = EMPLOYEES.find(e => e.id === answers[q.id]);
    input.value = cur ? label(cur) : '';
    const syncHost = () => {
      const m = EMPLOYEES.find(e => label(e) === input.value.trim());
      answers[q.id] = m ? m.id : '';
    };
    input.addEventListener('input', syncHost); input.addEventListener('change', syncHost);
    f.append(input, dl);
    return f;
  } else if (q.field_type === 'choice'){
    input = document.createElement('select');
    const first = document.createElement('option'); first.value = ''; first.textContent = pick; input.appendChild(first);
    (q.options || []).forEach(opt => { const o = document.createElement('option'); o.value = opt; o.textContent = opt; input.appendChild(o); });
    input.value = typeof answers[q.id] === 'string' ? answers[q.id] : '';
  } else {
    input = document.createElement(q.field_type === 'textarea' ? 'textarea' : 'input');
    if (q.field_type !== 'textarea'){
      input.type = ({ tel:'tel', email:'email', number:'number', date:'date' })[q.field_type] || 'text';
      if (q.field_type === 'tel') input.inputMode = 'tel';
      if (q.legacy_key === 'full_name') input.autocomplete = 'name';
    }
    if (q.placeholder) input.placeholder = q.placeholder;
    input.value = typeof answers[q.id] === 'string' ? answers[q.id] : '';
  }
  if (q.field_type !== 'multichoice'){
    const sync = () => { answers[q.id] = input.value; };
    input.addEventListener('input', sync); input.addEventListener('change', sync);
  }
  f.appendChild(input);
  return f;
}

function renderSection(section, containerId){
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = '';
  sectionQs(section).forEach(q => wrap.appendChild(buildQuestionEl(q)));
}
function renderQuestions(){
  renderSection('general', 'general-questions');
  renderSection('health', 'health-questions');
  updateHealthBanner();
}


// =====================================================================
// TEKS HALAMAN — judul/keterangan langkah + aturan GMP, dari tabel
// `form_settings` (diedit di Form Builder). DEFAULT_SETTINGS = cadangan.
// =====================================================================
const DEFAULT_SETTINGS = {
  "step1_title": {
    "id": "Data Diri Tamu",
    "en": "Visitor Information"
  },
  "step1_desc": {
    "id": "Isi data berikut dengan lengkap dan benar sebelum memasuki area pabrik.",
    "en": "Please fill in the following accurately before entering the factory area."
  },
  "step2_title": {
    "id": "Skrining Kesehatan",
    "en": "Health Screening"
  },
  "step2_desc": {
    "id": "Sesuai standar keamanan pangan, mohon jawab dengan jujur. Jawaban \"Ya\" belum tentu menolak kunjungan Anda, namun akan ditinjau oleh petugas.",
    "en": "In line with food safety standards, please answer honestly. A \"Yes\" answer does not automatically deny entry, but will be reviewed by staff."
  },
  "step3_title": {
    "id": "Foto & Kepatuhan GMP",
    "en": "Photo & GMP Compliance"
  },
  "step3_desc": {
    "id": "Ambil foto wajah untuk kartu tamu Anda.",
    "en": "Take a face photo for your visitor pass."
  },
  "gmp_rules": {
    "id": "Tidak memakai perhiasan berlebih (cincin/jam boleh, kalung & anting dilepas)\nKuku bersih dan pendek, tanpa cat kuku\nRambut tertutup penuh (hairnet) saat memasuki area produksi\nTidak memakai parfum menyengat\nBersedia mengikuti prosedur higiene & keselamatan yang berlaku di pabrik",
    "en": "No excessive jewelry (rings/watches allowed, remove necklaces & earrings)\nNails clean, short, and free of polish\nHair fully covered (hairnet) when entering the production area\nNo strong perfume/fragrance\nWilling to follow the factory's hygiene & safety procedures"
  }
};
let SETTINGS = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
const SETTING_TEXT_KEYS = ['step1_title','step1_desc','step2_title','step2_desc','step3_title','step3_desc'];

function setting(key){
  const s = SETTINGS[key] || {};
  return lang()==='id' ? (s.id || '') : (s.en || s.id || '');
}
function applySettings(){
  SETTING_TEXT_KEYS.forEach(k => {
    const el = document.getElementById('set-' + k);
    if (el) el.textContent = setting(k);
  });
  const ul = document.getElementById('set-gmp_rules');
  if (ul){
    ul.innerHTML = '';
    setting('gmp_rules').split('\n').map(t => t.trim()).filter(Boolean).forEach(t => {
      const li = document.createElement('li'); li.textContent = t; ul.appendChild(li);
    });
  }
}
async function loadSettings(){
  try {
    const { data, error } = await supabaseClient.from('form_settings').select('*');
    if (error || !data) return;
    data.forEach(r => {
      if (DEFAULT_SETTINGS[r.key] && typeof r.value_id === 'string' && r.value_id.trim() !== '')
        SETTINGS[r.key] = { id: r.value_id, en: r.value_en };
    });
  } catch (e) { console.warn('form_settings tidak bisa dimuat, pakai bawaan', e); }
  applySettings();
}

// ---------- HEALTH RESULT ----------
function flaggedQs(){ return sectionQs('health').filter(q => q.field_type === 'yesno' && q.flag_on_yes); }
function isHealthClear(){ return flaggedQs().every(q => answers[q.id] !== true); }

function updateHealthBanner(){
  const banner = document.getElementById('health-banner');
  const fq = flaggedQs();
  if (fq.length === 0 || !fq.every(q => typeof answers[q.id] === 'boolean')) { banner.className = 'health-banner'; return; }
  const L = lang();
  if (isHealthClear()){
    banner.className = 'health-banner ok show';
    banner.textContent = L==='id' ? 'Tidak ada gejala dilaporkan. Anda dapat melanjutkan.' : 'No symptoms reported. You may proceed.';
  } else {
    banner.className = 'health-banner warn show';
    banner.textContent = L==='id'
      ? 'Ada gejala yang dilaporkan. Kunjungan Anda akan ditinjau oleh petugas keamanan/SHE sebelum memasuki area produksi.'
      : 'Symptoms reported. Your visit will be reviewed by security/SHE staff before entering the production area.';
  }
}

// ---------- STEPS ----------
let currentStep = 1;
function goStep(n){
  if (n > currentStep && !validateStep(currentStep)) return;
  currentStep = n;
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-'+n).classList.add('active');
  document.querySelectorAll('.seg').forEach((s,i) => {
    s.classList.toggle('done', i+1 < n);
    s.classList.toggle('active', i+1 === n);
  });
  if (n === 4) renderSummary();
  window.scrollTo({top:0, behavior:'smooth'});
}

function escapeAttr(s){
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML.replace(/"/g, '&quot;');
}

function showErr(step, msgId, msgEn){
  const el = document.getElementById('err-'+step);
  el.textContent = lang()==='id' ? msgId : msgEn;
  el.classList.add('show');
}
function clearErr(step){ document.getElementById('err-'+step).classList.remove('show'); }

function isAnswered(q){
  const v = answers[q.id];
  if (q.field_type === 'yesno') return typeof v === 'boolean';
  if (q.field_type === 'multichoice') return Array.isArray(v) && v.length > 0;
  return typeof v === 'string' && v.trim() !== '';
}

function validateStep(step){
  clearErr(step);
  if (step === 1 || step === 2){
    const section = step === 1 ? 'general' : 'health';
    if (!sectionQs(section).filter(q => q.required).every(isAnswered)){
      if (step === 1) showErr(1, 'Mohon lengkapi semua kolom bertanda *', 'Please fill in all required fields marked *');
      else showErr(2, 'Mohon jawab semua pertanyaan kesehatan', 'Please answer all health questions');
      return false;
    }
    const badEmail = sectionQs(section).find(q => q.field_type === 'email' && answers[q.id] && !/^\S+@\S+\.\S+$/.test(answers[q.id].trim()));
    if (badEmail){
      showErr(step, 'Format email tidak valid', 'Invalid email format');
      return false;
    }
    return true;
  }
  if (step === 3){
    if (!capturedPhotoBlob){
      showErr(3, 'Mohon ambil foto terlebih dahulu', 'Please take a photo first');
      return false;
    }
    if (!document.getElementById('f-gmp').checked){
      showErr(3, 'Mohon centang persetujuan kepatuhan GMP', 'Please check the GMP compliance agreement');
      return false;
    }
    return true;
  }
  return true;
}

// ---------- CAMERA ----------
let mediaStream = null;
let capturedPhotoBlob = null;

async function startCamera(){
  const camBox = document.getElementById('cam-box');
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    camBox.innerHTML = '<video id="cam-video" autoplay playsinline></video>';
    document.getElementById('cam-video').srcObject = mediaStream;
    document.getElementById('btn-cam-start').style.display = 'none';
    document.getElementById('btn-cam-shot').style.display = 'block';
  } catch (e) {
    const lang = document.documentElement.getAttribute('data-active-lang');
    alert(lang==='id' ? 'Tidak dapat mengakses kamera. Periksa izin kamera pada browser.' : 'Could not access camera. Please check browser camera permissions.');
  }
}

// Kompresi foto otomatis: resize ke sisi terpanjang maks. PHOTO_MAX_DIM,
// lalu turunkan kualitas JPEG bertahap sampai ukuran file <= PHOTO_TARGET_BYTES.
const PHOTO_MAX_DIM = 1280;          // px, sisi terpanjang
const PHOTO_TARGET_BYTES = 400 * 1024; // 400KB
const PHOTO_MIN_QUALITY = 0.4;

function canvasToBlob(canvas, quality){
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}

async function compressPhoto(sourceCanvas){
  let width = sourceCanvas.width;
  let height = sourceCanvas.height;
  const longest = Math.max(width, height);
  if (longest > PHOTO_MAX_DIM){
    const scale = PHOTO_MAX_DIM / longest;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const resized = document.createElement('canvas');
  resized.width = width;
  resized.height = height;
  resized.getContext('2d').drawImage(sourceCanvas, 0, 0, width, height);

  let quality = 0.85;
  let blob = await canvasToBlob(resized, quality);
  while (blob.size > PHOTO_TARGET_BYTES && quality > PHOTO_MIN_QUALITY){
    quality = Math.max(PHOTO_MIN_QUALITY, quality - 0.1);
    blob = await canvasToBlob(resized, quality);
    if (quality === PHOTO_MIN_QUALITY) break;
  }
  return blob;
}

async function takeShot(){
  const video = document.getElementById('cam-video');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  const blob = await compressPhoto(canvas);
  capturedPhotoBlob = blob;
  const url = URL.createObjectURL(blob);
  document.getElementById('cam-box').innerHTML = `<img src="${url}">`;
  document.getElementById('btn-cam-shot').style.display = 'none';
  document.getElementById('btn-cam-retake').style.display = 'block';
  if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
}

function retakeShot(){
  capturedPhotoBlob = null;
  document.getElementById('btn-cam-retake').style.display = 'none';
  document.getElementById('btn-cam-start').style.display = 'block';
  const camBox = document.getElementById('cam-box');
  camBox.innerHTML = `<div class="placeholder" data-lang="id">Kamera belum aktif</div><div class="placeholder" data-lang="en">Camera not active</div>`;
}

// ---------- SUMMARY ----------
function hostName(id){
  const e = EMPLOYEES.find(x => x.id === id);
  return e ? e.full_name : '';
}
// Teks jawaban untuk ditampilkan / disimpan
function displayValue(q){
  const v = answers[q.id];
  if (q.field_type === 'yesno') return typeof v === 'boolean' ? (v ? (lang()==='id'?'Ya':'Yes') : (lang()==='id'?'Tidak':'No')) : '';
  if (q.field_type === 'multichoice') return Array.isArray(v) ? v.join(', ') : '';
  if (q.field_type === 'host') return hostName(v);
  return typeof v === 'string' ? v.trim() : '';
}

function renderSummary(){
  if (currentStep !== 4) return;
  const L = lang();
  document.getElementById('summary-general').innerHTML = sectionQs('general').map(q =>
    `<div class="summary-row"><span class="k">${escapeHtml(qLabel(q))}</span><span class="v">${escapeHtml(displayValue(q) || '—')}</span></div>`
  ).join('');

  const clear = isHealthClear();
  document.getElementById('summary-health').innerHTML =
    `<div class="summary-row"><span class="k">Status</span>
     <span class="v" style="color:${clear ? '#1e7a46' : '#c0152a'}">
     ${clear ? (L==='id'?'Tidak ada gejala':'No symptoms') : (L==='id'?'Perlu ditinjau':'Needs review')}
     </span></div>`;

  const photoImg = document.getElementById('summary-photo');
  if (capturedPhotoBlob){
    photoImg.src = URL.createObjectURL(capturedPhotoBlob);
    photoImg.style.display = 'block';
  }
}

function escapeHtml(s){
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ---------- SUBMIT ----------
function buildPayload(photoUrl){
  const p = {
    full_name:null, company:null, phone:null, email:null, purpose:null, area_visited:null,
    host_name:'', host_employee_id:null,
    health_clear: isHealthClear(),
    gmp_compliance_agreed: document.getElementById('f-gmp').checked,
    declaration_agreed: true,
    photo_url: photoUrl,
  };
  LEGACY_HEALTH_KEYS.forEach(k => { p[k] = false; });

  const snapshot = [];
  QUESTIONS.forEach(q => {
    const v = answers[q.id];
    const isYN = q.field_type === 'yesno';
    if (q.legacy_key === 'host'){
      p.host_employee_id = v || null;
      p.host_name = hostName(v);
    } else if (LEGACY_HEALTH_KEYS.includes(q.legacy_key) && isYN){
      p[q.legacy_key] = v === true;
    } else if (LEGACY_TEXT_KEYS.includes(q.legacy_key)){
      p[q.legacy_key] = (typeof v === 'string' && v.trim()) ? v.trim() : null;
    }
    // Snapshot jawaban beserta label saat ini (dipakai dashboard admin & export)
    const text = q.field_type === 'yesno' ? null : displayValue(q);
    snapshot.push({
      id: q.id, section: q.section, legacy_key: q.legacy_key || null, type: q.field_type,
      label: q.label_id, label_en: q.label_en || null,
      value: isYN ? (typeof v === 'boolean' ? v : null) : (text || null),
      flag: isYN ? !!q.flag_on_yes : false,
    });
  });
  p.answers = snapshot;
  return p;
}

async function submitVisitor(){
  clearErr(4);
  const L = lang();
  if (!document.getElementById('f-declare').checked){
    showErr(4, 'Mohon centang pernyataan persetujuan data', 'Please check the data declaration');
    return;
  }
  const btn = document.getElementById('btn-submit');
  btn.disabled = true;
  btn.textContent = L==='id' ? 'Mengirim...' : 'Submitting...';

  try {
    let photoUrl = null;
    if (capturedPhotoBlob){
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2,8)}.jpg`;
      const { data: uploadData, error: uploadErr } = await supabaseClient
        .storage.from('visitor-photos')
        .upload(fileName, capturedPhotoBlob, { contentType: 'image/jpeg' });
      if (uploadErr) throw uploadErr;
      photoUrl = uploadData.path;
    }

    const payload = buildPayload(photoUrl);
    const { data: inserted, error } = await supabaseClient
      .rpc('submit_visitor', { payload })
      .single();
    if (error) throw error;

    showSuccess({ ...payload, ...inserted });
  } catch (e) {
    console.error(e);
    showErr(4,
      'Gagal mengirim data: ' + (e.message || 'kesalahan tidak diketahui'),
      'Failed to submit: ' + (e.message || 'unknown error'));
    btn.disabled = false;
    btn.textContent = L==='id' ? 'Kirim & Daftar' : 'Submit & Register';
  }
}

function showSuccess(data){
  const lang = document.documentElement.getAttribute('data-active-lang');
  document.getElementById('form-flow').style.display = 'none';
  document.getElementById('success-screen').style.display = 'block';
  document.getElementById('pass-name').textContent = data.full_name;
  document.getElementById('pass-id').textContent = data.visitor_id || '—';
  const qrBox = document.getElementById('pass-qr');
  qrBox.innerHTML = '';
  if (data.visitor_id){
    new QRCode(qrBox, { text: data.visitor_id, width: 150, height: 150, correctLevel: QRCode.CorrectLevel.M });
  }
  document.getElementById('pass-company').textContent = data.company;
  document.getElementById('pass-host').textContent = data.host_name;
  document.getElementById('pass-time').textContent = new Date(data.created_at).toLocaleString(lang==='id'?'id-ID':'en-US');
  document.getElementById('pass-health').textContent = data.health_clear
    ? (lang==='id' ? 'Baik' : 'Clear')
    : (lang==='id' ? 'Perlu Ditinjau' : 'Needs Review');
}

function resetForm(){
  Object.keys(answers).forEach(k => delete answers[k]);
  document.getElementById('f-gmp').checked = false;
  document.getElementById('f-declare').checked = false;
  capturedPhotoBlob = null;
  retakeShot();
  renderQuestions();
  document.getElementById('form-flow').style.display = 'block';
  document.getElementById('success-screen').style.display = 'none';
  const b = document.getElementById('btn-submit');
  b.disabled = false;
  b.innerHTML = '<span data-lang="id">Kirim &amp; Daftar</span><span data-lang="en">Submit &amp; Register</span>';
  goStep(1);
}

// ---------- INIT ----------
setLang(localStorage.getItem('visitor_lang') || 'id');
goStep(1);
loadSettings();
loadQuestions();
loadHostOptions();
