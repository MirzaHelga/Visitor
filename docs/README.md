# Aplikasi Buku Tamu Pabrik (Visitor + Skrining Kesehatan)

Web statis (HTML/CSS/JS, tanpa build step) yang terhubung ke Supabase.
Bisa langsung di-upload ke hosting statis apa pun (Netlify, Vercel, Cloudflare Pages, atau bahkan dibuka langsung dari file).

## Struktur Folder
```
visitor-app/
├── index.html              <- HALAMAN form tamu (entry point hosting)
├── pages/
│   └── admin.html          <- HALAMAN dashboard admin
├── assets/
│   ├── css/                <- form.css (desain form), admin.css (dashboard)
│   ├── js/                 <- config.js (WAJIB diisi), form.js, admin.js, builder.js (Form Builder)
│   └── images/             <- logo.png, background.png (foto pabrik), banner-savoria.png
├── database/
│   └── schema.sql          <- SQL setup Supabase
└── docs/
    ├── README.md           <- file ini
    └── design-reference/   <- mockup desain (referensi, tidak dipakai aplikasi)
```
- `assets/js/config.js` — **wajib diisi** URL & anon key Supabase.
- Ganti logo / background / banner: timpa file di `assets/images/` dengan nama yang sama.
- Lebar kartu form bisa diatur lewat variabel `--card-max` di `assets/css/form.css`.

## Form Builder (edit pertanyaan seperti Microsoft Forms)
Khusus **Superadmin**: menu **Form Builder** di `pages/admin.html`. Pertanyaan form tamu tidak lagi ditulis di kode, tapi disimpan di tabel `form_questions` dan langsung berlaku di form tamu berikutnya.
- **Dua bagian** bisa diatur: *Langkah 1 — Data Diri Tamu* dan *Langkah 2 — Skrining Kesehatan*. (Langkah 3 foto & GMP dan Langkah 4 konfirmasi tetap tetap.)
- **Aksi**: tambah pertanyaan, edit teks (Indonesia + English), ubah urutan (▲▼), wajib/opsional, sembunyikan (nonaktif), hapus.
- **Tipe jawaban**: teks singkat, teks panjang, nomor telepon, email, angka, tanggal, pilihan (dropdown), pilihan ganda (centang), Ya/Tidak. Pertanyaan "Yang Ditemui" memakai daftar karyawan.
- **Ya/Tidak** punya opsi *"Ya = Perlu Ditinjau"*. Status kesehatan tamu = Perlu Ditinjau kalau ada pertanyaan bertanda itu yang dijawab Ya.
- **Pertanyaan inti** (Nama, Perusahaan, Telepon, Tujuan, Yang Ditemui) tidak bisa dihapus, dinonaktifkan, atau dijadikan opsional, karena kolomnya wajib di database. Teksnya tetap bisa diedit.
- **Data lama aman**: tiap tamu menyimpan snapshot pertanyaan + jawabannya (`visitors.answers`), jadi mengubah/menghapus pertanyaan tidak merusak data yang sudah masuk. Pertanyaan tambahan muncul di detail tamu dan jadi kolom tambahan di export Excel.
- **Cadangan**: kalau tabel `form_questions` belum ada atau gagal dimuat, form tamu otomatis memakai daftar bawaan (`DEFAULT_QUESTIONS` di `assets/js/form.js`) supaya tidak pernah kosong.
- **Upgrade dari versi lama**: jalankan ulang `database/schema.sql` (bagian 8 membuat tabel + isi pertanyaan bawaan; bagian lain aman diulang).
- **Teks Halaman** (kartu di bagian bawah Form Builder): ubah judul & keterangan Langkah 1–3 dan daftar aturan GMP (satu aturan per baris), masing-masing dalam Indonesia dan English. Kolom Indonesia dikosongkan = pakai teks bawaan; English kosong = pakai teks Indonesia. Disimpan di tabel `form_settings` (bagian 8b `schema.sql`).
- Catatan: kewajiban isian dicek di sisi browser (sama seperti sebelumnya).

## Tampilan Responsive
UI dibuat adaptif untuk satu codebase yang sama:
- **Android / iPhone** (termasuk notch/safe-area) — layout penuh satu kolom, tombol besar untuk dipakai di kiosk pintu masuk.
- **Tablet & Windows/desktop** — form otomatis tampil sebagai kartu terpusat (tidak melebar penuh layar), dashboard admin pakai layout tabel penuh.
- Tabel di halaman admin bisa di-scroll ke samping di layar sempit agar semua kolom tetap kebaca.
- Tidak perlu instal apa pun — cukup dibuka lewat browser (Chrome/Safari/Edge) di device apa saja.

## Langkah Setup

### 1. Jalankan `schema.sql`
Buka **Supabase Dashboard > SQL Editor**, paste seluruh isi `database/schema.sql`, lalu **Run**.
Ini akan membuat:
- Tabel `visitors`
- Row Level Security: publik bisa **insert** (isi form), hanya admin yang login yang bisa **select/update/delete**
- Storage bucket `visitor-photos` (private) + policy serupa

### 2. Isi `assets/js/config.js`
Ambil dari **Project Settings > API**:
```js
const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```
Pakai **anon/public key**, JANGAN pakai `service_role` key (itu key rahasia backend).

### 3. Buat akun & atur role
Supabase tidak punya halaman registrasi publik di sini — dan memang sengaja begitu.
Buat akun login manual di **Authentication > Users > Add user** (isi email + password).

Setiap akun baru otomatis masuk sebagai **"Unrole"** (cuma bisa lihat halaman Daftar).
Role lain yang tersedia:

| Role | Akses |
|---|---|
| Unrole | Daftar |
| Employee | Konfirmasi Primary (hanya tamu yang host-nya dirinya sendiri), Dashboard, Daftar |
| GS | Konfirmasi Secondary (tamu siapa saja, dipakai kalau Primary tidak bisa), Dashboard, Daftar |
| Security | Konfirmasi Keluar dari area factory, Dashboard, Daftar |
| Superadmin | Semua akses + Form Builder (atur pertanyaan form tamu) + Mapping User (atur role & daftar karyawan) + Kelola Akun (buat akun, reset password, hapus akun) + aksi konfirmasi/batalkan konfirmasi langsung dari detail tamu |

**Bootstrap Superadmin pertama** — karena halaman Mapping User cuma bisa dibuka Superadmin,
akun Superadmin pertama harus di-set manual sekali lewat **SQL Editor**:
```sql
update public.profiles set role = 'superadmin' where email = 'admin@contoh.com';
```
Setelah itu, Superadmin bisa mengatur role akun lain dan menambah karyawan langsung dari
halaman **Mapping User** di `pages/admin.html`, serta membuat akun baru, reset password, dan menghapus akun dari halaman **Kelola Akun** — tidak perlu SQL Editor atau halaman Authentication Supabase lagi.
Kalau kamu upgrade dari versi lama, jalankan ulang `schema.sql` supaya fungsi `admin_create_user`, `admin_reset_password`, dan `admin_delete_user` ikut terpasang.

### 4. Konfirmasi via QR Code
Setiap tamu yang selesai daftar dapat kartu tamu dengan **QR code** berisi ID tamunya.
Employee, GS, dan Security masing-masing punya halaman **Konfirmasi** di `pages/admin.html` untuk
scan QR itu lewat kamera (atau ketik manual ID-nya kalau kamera tidak tersedia):
- **Konfirmasi Primary** (Employee) — hanya bisa konfirmasi tamu yang memilih dirinya sebagai host.
- **Konfirmasi Secondary** (GS) — backup kalau Primary tidak bisa, berlaku untuk tamu siapa saja.
- **Konfirmasi Keluar** (Security) — menandai tamu sudah keluar dari area factory.

Semua konfirmasi dicek di sisi database (bukan cuma di tampilan), jadi akun yang role-nya
tidak sesuai akan ditolak walau mencoba lewat API langsung.

### 4. Deploy
Upload seluruh isi folder `visitor-app` (struktur folder harus tetap utuh) ke hosting statis pilihanmu:
- **Netlify/Vercel**: drag & drop folder ini
- **Kiosk/tablet di pintu masuk pabrik**: buka `index.html` di browser, mode kiosk/fullscreen
- **Admin**: buka `pages/admin.html` di komputer/HP petugas (login diperlukan)

## ID Tamu Otomatis
Setiap tamu yang mendaftar otomatis dapat **ID unik berformat `36XXXXXX`** (mis. `36000001`, `36000002`, ...), dibuat oleh database (Postgres sequence) supaya tidak pernah bentrok walau banyak tamu mendaftar bersamaan. ID ini muncul di kartu tamu (layar sukses setelah submit) dan di kolom **ID** pada dashboard admin.
- Kalau kamu baru pertama kali setup, cukup jalankan `schema.sql` seperti biasa.
- Kalau tabel `visitors` **sudah ada** dari sebelumnya (belum ada kolom ID), jalankan ulang `schema.sql` — baris-baris lama akan otomatis diberi ID urut berdasarkan tanggal daftar (`created_at`).
- Format `36` di depan cuma prefix tetap; 6 digit di belakangnya yang naik otomatis. Mau ganti prefix (misalnya jadi `20` atau kode pabrikmu), tinggal ganti `'36'` di `schema.sql` (ada di 2 tempat: bagian backfill & bagian default kolom).

## Simpan Foto Tamu (bulk, ke ZIP)
Di dashboard admin, centang tamu yang fotonya mau disimpan (bisa banyak sekaligus, atau centang "select all" di header tabel), lalu klik **"Simpan Foto Terpilih"**.
- Semua foto yang dicentang dibungkus jadi satu file **.zip** — begitu diekstrak, isinya jadi satu folder berisi foto-foto tersebut.
- Nama tiap file foto otomatis: **`ID_Nama.jpg`** (mis. `36000001_Budi Santoso.jpg`).
- Nama file .zip (= nama folder setelah diekstrak) bisa kamu isi sendiri lewat kotak dialog yang muncul; kalau dikosongkan, dipakai nama default `foto-tamu-YYYY-MM-DD`.
- Tamu yang dicentang tapi tidak punya foto otomatis dilewati.

## Catatan
- Foto diambil lewat kamera browser (`getUserMedia`) — perlu HTTPS untuk bekerja (kecuali di `localhost`). Hosting seperti Netlify/Vercel otomatis HTTPS.
- Foto otomatis di-compress sebelum diupload: di-resize ke maks. 1280px pada sisi terpanjang, lalu kualitas JPEG diturunkan bertahap (mulai 0.85, minimal 0.4) sampai ukuran file ≤ 400KB. Nilai ini bisa diubah lewat `PHOTO_MAX_DIM` dan `PHOTO_TARGET_BYTES` di `assets/js/form.js`.
- Pertanyaan kesehatan mengacu pada praktik umum skrining tamu di industri pangan (demam, diare/muntah, infeksi kulit/luka terbuka, keluar cairan dari mata/telinga/hidung, penyakit kuning, kontak penyakit menular). Sesuaikan daftar pertanyaan lewat menu **Form Builder** di admin dengan SOP HSE/QA pabrik kamu — daftar ini bukan pengganti kebijakan resmi perusahaan.
- Jawaban "Ya" pada skrining kesehatan **tidak otomatis memblokir** pendaftaran — sistem hanya menandai status "Perlu Ditinjau" agar petugas keamanan/SHE yang memutuskan.
- Ingin tambah fitur (misalnya scan QR untuk check-out, notifikasi ke host, dsb.)? Tinggal bilang.

## Update v6
- Menu "Mapping User" → **Karyawan** (cari nama/nomor/departemen, filter departemen & status).
- Satu akun bisa punya **banyak role** (kolom `profiles.roles`). Jalankan ulang `database/schema.sql` — data role lama otomatis dimigrasi.
- Import karyawan: jalankan `database/seed-employees.sql` (257 karyawan) setelah schema.
- Form tamu: pilihan "Yang Ditemui" bisa dicari dengan mengetik.
- **Android/PWA**: `manifest.webmanifest`, `sw.js`, ikon 192/512. Host lewat HTTPS, buka di Chrome Android → "Pasang Aplikasi" / "Add to Home screen". Untuk file APK/Play Store, bungkus URL-nya dengan PWABuilder atau Bubblewrap (TWA).
