# 🛠️ ELS Spareparts - Portal Pemesanan & Cetak Stiker S/N Barcode

Aplikasi sistem manajemen inventaris, pemesanan masuk dari cabang, pencetakan stiker label thermal serial number (S/N) dinamis dengan barcode 1D (Code 39), dan ekspor laporan keuangan terintegrasi. Dibangun menggunakan **React**, **Vite**, dan **Supabase**.

---

## ✨ Fitur Unggulan (Core Features)

### 1. 🏷️ Cetak Stiker Label S/N & Barcode Dinamis
*   **Barcode Generator Code 39:** Merender barcode 1D Code 39 secara lokal via SVG tanpa dependensi API eksternal.
*   **Pengaturan Cetak Fleksibel:** Pengaturan lebar/tinggi stiker (mm), jumlah kolom cetak per baris (1, 2, atau 3 kolom stiker berjajar), ukuran font (pt), serta toggle info produk.
*   **Pratinjau Layout Realistis:** Live preview interaktif yang menyimulasikan tata letak kertas stiker thermal dengan garis potong putus-putus (*dashed border*).
*   **Cetak Bersih (React Portals):** Menggunakan portal React untuk merender stiker cetak langsung di dasar `document.body` di luar kontainer root, menjamin printer thermal mencetak stiker secara rapi tanpa sisa halaman putih kosong.

### 2. 🔢 Generator S/N Otomatis & Anti-Duplikasi
*   **Pencegahan Duplikasi:** Sistem mendeteksi seluruh S/N aktif dalam katalog dan pesanan terkirim untuk menentukan urutan sequence nomor berikutnya secara otomatis.
*   **Kode Prefix Cerdas:** Kode S/N dibuat otomatis berdasarkan kategori suku cadang (misal: Baterai -> `BAT`, Adaptor -> `ADP`, Keyboard -> `KBD`, Touchpad -> `TPD`), kode brand (misal: ASUS -> `AS`, LENOVO -> `LE`), dan tanggal masuk (`YYMMDD`).

### 3. 📦 Manajemen Pesanan Masuk & Perlindungan Stok (Stock Protection)
*   **Alur Pengajuan Cabang:** Cabang mengajukan pesanan spareparts (katalog pusat / custom request) dengan batas waktu pengiriman dan catatan khusus.
*   **Persetujuan Per Barang:** Admin pusat dapat menambah/mengurangi jumlah persetujuan unit per barang secara spesifik sebelum order diproses.
*   **Restorasi Stok Otomatis:** Apabila pesanan dibatalkan (`cancelled`) atau dihapus permanen oleh admin pusat, sistem secara otomatis mengembalikan jumlah stok barang yang dipesan ke dalam inventaris katalog pusat agar tidak terjadi kebocoran stok.

### 4. 📊 Ekspor Laporan Excel (.xlsx) Lengkap
*   **Katalog Sparepart:** Ekspor seluruh daftar inventaris suku cadang pusat dengan kolom khusus rincian daftar S/N yang aktif dalam stok.
*   **Rekap Pesanan Cabang:** Melakukan perataan (*flattening*) transaksi pesanan dari seluruh cabang menjadi baris data Excel terstruktur (dilengkapi info harga, urgensi, subtotal, dan S/N terkirim) untuk kemudahan analisis finansial.
*   **Auto-Fit Lebar Kolom:** Lebar kolom file Excel (.xlsx) otomatis menyesuaikan dengan panjang teks terpanjang dari data agar tidak ada informasi yang terpotong.

### 5. 🗂️ Kategori Kustom & Normalisasi Database
*   **Opsi Tulis Kategori Baru:** Admin dapat menginput nama kategori baru secara manual yang akan didaftarkan ke produk baru dan otomatis terintegrasi ke dalam tombol filter dinamis Katalog.
*   **Migrasi Otomatis (Database Sync):** Sistem melakukan migrasi otomatis untuk memperbaiki data kategori lama Supabase ketika aplikasi pertama kali dimuat.

### 6. ⚡ Optimasi Visual (Perceptual Speed) & Dark Mode
*   **YouTube-style Progress Bar:** Progress bar gradasi berwarna menyala di bagian paling atas layar setiap kali aplikasi melakukan transaksi data ke database.
*   **Shimmering Skeleton Loader:** Menggambar kerangka kosong (*skeletal placeholders*) yang bersinar dengan efek shimmer CSS saat menunggu data Supabase tiba, menghilangkan efek halaman beku (*freeze*).
*   **Smooth Tab Transitions:** Animasi masuk tab meluncur halus dari bawah ke atas (*fade-in-up*) berdurasi 0.4 detik.
*   **Mode Gelap/Terang:** Sistem tema gelap yang ramah mata dengan penyimpanan persisten di localStorage.

---

## 🚀 Panduan Instalasi & Menjalankan Aplikasi

### 1. Prasyarat
Pastikan Anda sudah menginstal **Node.js** (versi 16 atau lebih baru) dan memiliki akun/proyek **Supabase** yang aktif.

### 2. Setup Environment Variables
Buat sebuah file bernama `.env.local` di direktori root proyek ini, dan isi dengan kredensial proyek Supabase Anda:
```env
VITE_SUPABASE_URL=https://your-supabase-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
*(Anda dapat menyalin contoh formatnya dari berkas `.env.example`)*

### 3. Instal Dependensi
Jalankan perintah berikut di terminal/PowerShell untuk menginstal seluruh modul node_modules yang dibutuhkan:
```bash
npm install
```

### 4. Jalankan Development Server
Untuk menjalankan aplikasi secara lokal dalam mode pengembangan, ketik:
```bash
npm run dev
```
Aplikasi akan aktif dan dapat diakses melalui browser di alamat `http://localhost:5173`.

### 5. Bangun Aplikasi (Production Build)
Untuk memaketkan aplikasi ke dalam berkas production siap dideploy di Vercel/Netlify:
```bash
npm run build
```

### 6. Jalankan Linter Pemeriksaan Kode
Untuk memastikan penulisan kode tetap bersih, rapi, dan sesuai standar tanpa error:
```bash
npm run lint
```

---

## 🔑 Akun Demo Default
Anda dapat menggunakan akun bawaan database berikut untuk menguji coba dasbor aplikasi:

*   **Superadmin (Admin Pusat):**
    *   Username: `admin`
    *   Password: `palamana`
*   **Akun Cabang (Cabang Purwokerto):**
    *   Username: `els.purwokerto`
    *   Password: `palamana`
