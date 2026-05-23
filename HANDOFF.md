# HANDOFF — SiteAlyze VN (Build web hien trang)
> Tạo: 2026-05-23 | Dùng để mở session mới tiếp tục đúng chỗ

---

## 1. Project location
```
D:\CV lam chinh thuc\OneDrive\0. Myself\9- AI\Build web hien trang\
```
Stack: React + TypeScript + Vite + Tailwind + Three.js/@react-three/fiber + Zustand  
**Không chạy được npm trực tiếp từ máy host Windows** (xem memory).

---

## 2. Những gì đã làm xong trong 2 session vừa rồi

### ✅ A — Revert `forceFlatTerrain` (Steps 1-8, hoàn chỉnh)
Đã xóa toàn bộ logic force-flat terrain khỏi 8 files + xóa file `src/lib/terrain/forceFlat.ts`.  
TypeScript `tsc --noEmit` → **0 lỗi**.

### ✅ B — Fix overlay polyline draping (`src/lib/dxf/parseOverlayDxf.ts`)
**Vấn đề gốc:** File `QHC 11ha Minh Tân.dxf` có terrain Z=33-92m nhưng đường/ranh giới Z=0  
→ App vẽ đường bị "V" lặn xuống đất / uốn lượn / biến mất.

**Giải pháp cuối cùng:**
- `sampleHeight()` trả 3-way discriminated union: `hit` / `outside` / `outOfBounds`
- `overlayToWorldSpace()` dùng `lastValidH ?? terrainFloor` → **không bao giờ cắt polyline**
- Đối tượng Z=0 giữ nguyên cao độ ổn định; Z>0 tái tạo địa hình đúng
- Trees (`circlesToTreePoints`) skip nếu ngoài TIN (không phá terrain)

**Logic chính (overlayToWorldSpace):**
```ts
for (const p of dense) {
  const sr = sampleHeight(p.x, p.y, bounds, heightmap);
  let h: number;
  if (sr.kind === 'hit') { lastValidH = sr.h; h = sr.h; }
  else { h = lastValidH ?? terrainFloor; }  // KHÔNG cắt, dùng fallback
  seg.push({ x: p.x - cx, y: h + elevationOffset, z: -(p.y - cy) });
}
```

### ✅ C — Fix `buildWaterMask` bug V2 GIS-MCA (`src/lib/analysis/mca.ts:309`)
**Vấn đề gốc:** Y0 = 74.9% (Không thuận lợi) — sai so với PDF nghiên cứu.  
**Root cause:** `buildWaterMask` coi cell NaN (ngoài TIN coverage) là "mặt nước".  
File QHC 11ha ~70% bbox là NaN → BFS tính mọi cell đều gần "nước giả"  
→ X3 = 1-2 → hard constraint X3<4 → veto Y=0 cho hầu hết ô.

**Fix (1 dòng, line 309):**
```ts
// TRƯỚC (bug):
if (!Number.isFinite(z) || z <= waterZ) mask[i] = 1;

// SAU (đúng):
if (Number.isFinite(z) && z <= waterZ) mask[i] = 1;
```
Sau fix: Y0 kỳ vọng < 40%, X3 mean tăng lên 6-9, Y1/Y2 tăng đáng kể.

---

## 3. Việc chưa làm (optional, chưa được yêu cầu)

| # | Việc | File | Ghi chú |
|---|------|------|---------|
| 1 | Fix bug tương tự NaN=water trong V1 | `src/lib/analysis/suitability.ts:63` | `(!Number.isFinite(z) \|\| z <= waterZ)` → `(Number.isFinite(z) && z <= waterZ)` — flood penalty V1 cũng sai |
| 2 | Detect water layer từ DXF | `parseOverlayDxf.ts` | Layer "ho", "song", "kenh", "lake" → X3 chính xác hơn |
| 3 | Upload landuse file | store + mca.ts | X4/X5/X7 hiện dùng default (chưa có landuse) |

---

## 4. Các file quan trọng nhất

| File | Vai trò |
|------|---------|
| `src/lib/dxf/parseOverlayDxf.ts` | Parser DXF overlay + draping polylines lên terrain |
| `src/lib/analysis/mca.ts` | V2 GIS-MCA 9 tiêu chí (X1-X9) |
| `src/lib/analysis/suitability.ts` | V1 đánh giá 4 yếu tố địa hình |
| `src/lib/terrain/heightmap.ts` | Rasterize TIN → heightmap (có `mask` Uint8Array) |
| `src/components/Sidebar/sections/tabs/MCATab.tsx` | UI V2 GIS-MCA |
| `src/store/useSiteStore.ts` | Zustand store trung tâm |

---

## 5. Kiến trúc cần nhớ

- **`mask: Uint8Array`** trong heightmap: `1` = cell có dữ liệu TIN thực, `0` = exterior/trống
- **`sampleHeight()`** trả `hit/outside/outOfBounds` — không clamp về edge
- **`terrainFloor = heightmap.minZ ?? 0`** dùng làm fallback Z cho polylines ngoài TIN
- **`buildWaterMask`** chỉ dùng `Number.isFinite(z) && z <= waterZ` (đã fix)
- **Hard constraints MCA:** X3<4 (sát nước <300m) OR X2<5 (ngập >5%) → force Y=0
- **Trọng số default** theo Bảng 15 PDF nghiên cứu ĐH Kiến trúc HN 2026 — đã đúng

---

## 6. Test case chính

File: `QHC 11ha Minh Tân.dxf`  
- Terrain: Z = 33-92m, coverage ~30% bbox
- Đường/ranh: Z = 0
- Sau fix draping: đường hiển thị đầy đủ, không uốn lượn
- Sau fix water mask: Y0 < 40% (trước fix: 74.9%)
