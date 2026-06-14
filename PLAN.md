# PLAN — Web UI: Hash Router & Mobile First

> Target: Web UI hanya berjalan di path `/#/` (Hash Router) dan sepenuhnya mobile-friendly.
> Scope: `client/src/*` — React + shadcn/ui + Tailwind.

---

## 1. Hash Router Governance (UI hanya di `/#/`)

### 1.1 Routing Contract
- **Semua navigasi internal** harus melalui React Router `NavLink` / `useNavigate`. Tidak ada `<a href="/...">` mentah yang memicu full page reload.
- **Browser address bar** selalu menunjukkan `/#/dashboard`, `/#/playground`, `/#/activity`. Hash fragment tidak pernah dikirim ke server — server cukup serve `index.html` untuk semua non-API path.

### 1.2 Server SPA Fallback (sudah ada, tetap dijaga)
- Server: kalau path tidak diawali `/v2/` atau `/api/`, fallback ke `client/dist/index.html` tanpa redirect.
- Tidak perlu route handler untuk `/dashboard`, `/playground`, `/activity` di server.

### 1.3 Audit & Hardening Task
1. **Audit link internal** di seluruh `client/src` — pastikan tidak ada `<a href="/...">` atau `window.location.href = ...`.
2. **Redirect safety** — `App.tsx` sudah pakai `<Route path="/" element={<Navigate to="/dashboard" replace />} />`. Pastikan tidak ada path lain yang tidak di-cover oleh `<Routes>`.
3. **Deep link support** — buka `/#/activity` langsung dari address bar harus tetap render Activity page (hash router menangani ini otomatis, tapi perlu di-verify).
4. **External link policy** — kalau ada link ke docs/repo, pakai `<a target="_blank" rel="noopener noreferrer">` dan bukan React Router.

---

## 2. Mobile First Refinement

### 2.1 Layout Foundation (sudah bagus, tetap dijaga)
- Sidebar: collapsible di mobile dengan toggle hamburger + overlay. `md:` breakpoint untuk desktop static sidebar.
- Main content: `flex-1` dengan padding yang cukup. Di mobile jangan terlalu mepet ke tepi.

### 2.2 Touch Targets & Accessibility
- **Minimum tap target: 44×44px** (WCAG 2.1).
- **Button, nav item, badge, pagination button** — semua harus punya padding/height yang memenuhi 44px minimal.
- **Input font-size: 16px** — mencegah iOS auto-zoom saat focus. Jangan pakai `text-sm` (14px) di input fields.

### 2.3 Dashboard Page (`pages/Dashboard.tsx`)
1. **Stat cards** — sudah `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, cukup. Pastikan card content tidak overflow.
2. **Charts** — sudah pakai `ResponsiveContainer width="100%"`. Pastikan chart height di mobile tidak terlalu besar (maks 250px di mobile vs 300px desktop).
3. **Recent Requests table** — wrap `<Table>` di dalam `<div className="overflow-x-auto">` supaya tidak overflow horizontal di mobile.
4. **Controls (Range/Granularity)** — `flex flex-wrap items-center gap-4` sudah responsif. Pastikan `<Select>` tidak terlalu lebar di mobile (max-width atau full-width sesuai konteks).

### 2.4 API Playground Page (`pages/ApiPlayground.tsx`)
1. **Tabs** — `TabsList` di mobile harus bisa scroll horizontal kalau label terlalu panjang. Tambahkan `className="overflow-x-auto"` pada `TabsList` wrapper.
2. **Sub-tab (Search / Scrape)** — pakai `flex-wrap` atau scroll supaya tidak overflow.
3. **Form fields** — semua `<Input>` pakai `text-base` (16px) di mobile. Gunakan `w-full` untuk input agar memenuhi lebar layar.
4. **Checkbox formats** — `flex-wrap` supaya pilihan format (markdown/html/rawHtml) turun ke baris baru di layar sempit.
5. **Response area** — `min-h-[400px]` terlalu besar di mobile. Ubah menjadi:
   - Mobile: `min-h-[200px]` atau `h-[50vh]`
   - Desktop: tetap `min-h-[400px]`
   - Gunakan `md:min-h-[400px] min-h-[200px]`.
6. **Crawl4AI status badges** — jangan terlalu banyak elemen sebaris di mobile; pakai `flex-wrap`.

### 2.5 Request Activity Page (`pages/RequestActivity.tsx`)
1. **Search bar** — sudah ada icon + input. Pastikan input full-width di mobile.
2. **Filters** — `flex flex-wrap items-end gap-4` bisa menghasilkan terlalu banyak baris di mobile. Pertimbangkan:
   - Collapsible filter panel di mobile (toggle "Filters" button)
   - Atau minimal turunkan gap dan pastikan setiap filter element full-width di mobile (`w-full sm:w-auto`).
3. **Table** — wrap `<Table>` di `<div className="overflow-x-auto">`. Di mobile, tabel 5 kolom akan overflow — horizontal scroll adalah solusi paling praktis.
4. **Pagination** — tombol Prev/Next harus cukup besar (min 44px tinggi). Info page + total tetap tampil di tengah atau atas.
5. **Dialog detail** — `max-w-3xl` mungkin terlalu lebar di mobile. Ubah ke:
   - `max-w-3xl md:max-w-3xl max-w-[95vw]` atau gunakan `w-[95vw] md:w-auto md:max-w-3xl`.
   - Pastikan `DialogContent` tidak melebihi viewport lebar.
   - Pre blocks (request/response body) sudah pakai `overflow-auto`, cukup. Tapi pastikan `max-h-48` tidak terlalu kecil di mobile — mungkin `max-h-[40vh]` lebih baik.

### 2.6 Global Mobile Tweaks
1. **Page title header** — `h-16` + `px-6`. Di mobile padding bisa dikurangi ke `px-4`. Font size `text-xl` cukup.
2. **Main content padding** — `p-6` di desktop. Di mobile bisa `p-4` atau `px-4 py-6` supaya tidak terlalu mepet tapi tetap ada ruang napas.
3. **Prevent horizontal scroll** — pastikan tidak ada elemen yang `width: 100% + padding/margin` tanpa `box-sizing`.
4. **Safe area** — kalau ada notched phone, pertimbangkan `env(safe-area-inset-*)` tapi ini optional untuk MVP.

---

## 3. Verification Checklist

### Hash Router
- [ ] Buka `/` → redirect ke `/#/dashboard`
- [ ] Buka `/#/playground` langsung → render Playground
- [ ] Buka `/#/activity?page=2` langsung → render Activity (query string tetap bekerja)
- [ ] Klik semua nav item → tidak ada full page reload (Network tab tidak ada document request)
- [ ] Refresh di `/#/dashboard` → tetap dashboard, tidak 404

### Mobile (Chrome DevTools iPhone SE / 375px)
- [ ] Sidebar toggle muncul, sidebar bisa dibuka/tutup, overlay clickable
- [ ] Dashboard: stat cards 1 kolom, charts tidak overflow, table bisa scroll horizontal
- [ ] Playground: tabs tidak overflow (scrollable atau wrapped), input tidak zoom di focus, response area tidak terlalu tinggi
- [ ] Activity: filter tidak terlalu panjang/overflow, table scroll horizontal, dialog tidak melebihi layar, pagination button mudah di-tap
- [ ] Seluruh halaman: tidak ada horizontal scroll tak terduga, tap target ≥ 44px

---

## 4. File Target

| File | Perubahan |
|------|-----------|
| `client/src/pages/Dashboard.tsx` | Wrap table in `overflow-x-auto`, adjust chart height mobile |
| `client/src/pages/ApiPlayground.tsx` | Scrollable tabs, flex-wrap checkboxes, responsive response height, full-width inputs |
| `client/src/pages/RequestActivity.tsx` | Collapsible/compact filters, wrap table in `overflow-x-auto`, responsive dialog width, pagination touch size |
| `client/src/App.tsx` | Adjust main padding mobile (`p-4 md:p-6`) |
| `client/src/components/Sidebar.tsx` | Verify tap targets ≥ 44px, mobile toggle size |

---

## 5. Non-Goals (Out of Scope)
- PWA / service worker
- Dark/light mode toggle (shadcn default sudah mendukung via class, tidak perlu tambahan)
- Animasi transisi halaman
- Pull-to-refresh
