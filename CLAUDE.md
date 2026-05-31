# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

# About Me

- Tên: Duy (ethan)
- Chức vụ: Kiến trúc sư quy hoạch - quản lý dự án - Trưởng phòng
- Công ty: HAAD (Công ty cổ phần phát triển kiến trúc đô thị Hà Nội)
- Quy mô công ty: 15 nhân viên, 40 dự án/năm
- Giới tính: Nam
- Công cụ thường dùng: Auto CAD, mindmap, Google Earth, Word, PPT, Excel
- Kinh nghiệm: 7 năm QH đô thị, khu du lịch, sân golf
- Kỹ thuật: CAD thành thạo, Photoshop, Google Earth, Office cơ bản
- Không biết lập trình

# Instructions for Claude

- Luôn trả lời bằng tiếng Việt trừ khi được hỏi tiếng Anh
- Xưng hô: "tao" = Claude, "mày" = Duy (phong cách thân thiện gen Z)
- Thẳng thắn, chỉ ra vấn đề, không né tránh
- Không thêm những câu lưu ý không cần thiết
- Khi không chắc chắn → nói rõ là không chắc, không đoán mò
- Trình bày đủ sâu như một chuyên gia, không nói chung chung
- Thuật ngữ chuyên ngành có thể giữ tiếng Anh nhưng hạn chế
- Ngôn ngữ như gen Z để gần gũi

---

# Development Commands

```bash
npm run dev       # Start dev server at http://localhost:5173
npm run build     # TypeScript check + Vite production build → dist/
npm run preview   # Preview production build locally
```

No test runner is configured. Type-check only via `tsc --noEmit` (included in `build`).

---

# Project: SiteAlyze VN

**Web app đánh giá hiện trạng quy hoạch** — visualize địa hình 3D từ file DXF/DWG + phân tích đa tiêu chí cho quy hoạch chi tiết 1/500 tại Việt Nam.

**Stack:** React 18 + TypeScript + Vite · Three.js / React Three Fiber · MapLibre GL · Zustand · Tailwind CSS · Comlink (Web Workers) · `libredwg-web` (WASM)

---

# Architecture

## High-level data flow

```
DXF/DWG file upload
  → terrain.worker.ts (Comlink, off-thread)
    → lib/dxf/parseDxf|parseDwg.ts  (parse CAD entities)
    → lib/terrain/triangulate.ts     (Delaunay TIN)
    → lib/terrain/buildMesh.ts       (heightmap raster → BufferGeometry)
  → useSiteStore (Zustand) — stores terrain + heightmap
    → Canvas3D (R3F) renders TerrainMesh + overlays
    → Sidebar panels trigger mode changes → computeForMode()
      → lib/analysis/* (slope, hydrology, contours, MCA, etc.)
      → results cached back in store → re-render
```

## `src/store/useSiteStore.ts` — Single source of truth

All application state lives in one Zustand store (~100+ fields). Key state groups:

| Group | Fields | Notes |
|-------|--------|-------|
| **Terrain** | `terrain`, `heightmap`, `loading`, `error` | Output of worker |
| **Mode** | `mode` | `'elevation' \| 'slope' \| 'hydro' \| 'sun' \| 'wind' \| 'features' \| 'mca' \| 'suitability' \| ...` |
| **Analysis cache** | `slopeResult`, `hydroResult`, `contours`, `mcaResult`, `suitabilityResult`, ... | Lazy-computed, invalidated on terrain change |
| **Multi-project** | `projects[]`, `activeProjectId` | Multiple DXF sites can be loaded simultaneously |
| **Overlay layers** | `overlayBoundary`, `overlayRoads`, `overlayBuildings`, `overlayTrees` | Vector layers from a second DXF upload |
| **Landuse zones** | `landuseZones`, `landuseStats` | Building density / floor-area-ratio zones |
| **Flood sim** | `floodLevel`, `floodEnabled` | Real-time water surface overlay |
| **UI** | `sidebarWidth`, `theme`, `basemapVisible`, `reportVisible` | Layout state |
| **Scenes** | `scenes[]` | Bookmarked camera positions with thumbnails |

`computeForMode(mode)` is the central dispatch — calling it triggers the appropriate `lib/analysis/` function and stores results.

## `src/workers/terrain.worker.ts` — Off-thread computation

Wrapped with Comlink. Handles blocking operations so the UI stays responsive:
- `processDxf(dxfText, cellSize, layerPattern)` — parse DXF + build heightmap
- `processDwg(buffer, cellSize, layerPattern)` — parse DWG (via `libredwg-web` WASM) + build heightmap

`terrainClient.ts` provides a lazy singleton `Remote<TerrainWorkerAPI>` used throughout the app.

## `src/lib/` — Core business logic

| Folder | Purpose |
|--------|---------|
| `analysis/` | Terrain algorithms: `slope`, `hydrology` (D8), `contours` (D3 marching squares), `viewshed`, `sun`, `wind`, `features` (peak/ridge detection), `mca` (9-criterion MCA), `suitability`, `climatology`, `roadClassify` |
| `terrain/` | `triangulate` (Delaunay), `buildMesh` (rasterize → Three.js geometry), `heightmap` utilities |
| `dxf/` | `parseDxf`, `parseDwg`, `parseOverlayDxf`, `parseLanduse`, `parseLanduseXlsx`, `extractElevation`, `detectBoundary` |
| `coord/` | `vn2000.ts` — VN-2000 zone detection; `provinces.ts` — province lookup |
| `project/` | `saveLoad.ts` — serialize/deserialize `.siteproj.json` (v2 format) |
| `report/` | `generateReport.ts`, `markdown.ts`, `stats.ts` |
| `types.ts` | All shared TypeScript types for the app |

## `src/components/` — UI

**`Scene/Canvas3D.tsx`** — R3F canvas root. Key children:
- `TerrainMesh` — main heightmap mesh with vertex colors driven by active mode
- `ContourLines`, `FlowArrows`, `FeatureMarkers`, `LanduseLayer`, `MCALayer`, `RoadsRender`, `TreeInstances`, `WindParticles`, `FloodMesh` — analysis overlays, shown/hidden per mode
- `TerrainMeshBg` — other projects rendered semi-transparent (VN2000-offset positions)
- Camera helpers: `CameraPreset`, `AutoFit`, `SceneTweener`, `SceneCapturer`

**`Sidebar/`** — 6 collapsible sections (resizable panel):
1. `ProjectManagementSection` — file I/O, multi-project switching
2. `GeneralInfoSection` — metadata (name, population, brief)
3. `EvaluationSection` — analysis mode tabs (terrain, slope, hydrology, features, viewshed, climate)
4. `PlanningSection` — land-use zones, building massing, MCA weights
5. `SimulationSection` — flood level, climate, wind simulation
6. `ReportSection` — generate + export report

**`Map/BasemapPanel.tsx`** — floating MapLibre GL 2D map, toggled independently of the 3D view.

## WASM / build notes

`vite.config.ts` has a custom `copyLibreDwgWasm()` plugin that copies `libredwg-web.wasm` into `public/` at build time. The dev server sets `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers required for SharedArrayBuffer (DWG WASM threading). If those headers are missing, DWG parsing silently falls back.

## Project file format

Saved as `.siteproj.json` (v2). Contains serialized terrain buffers, overlay layer data, metadata, scenes, MCA weights, and multi-project array. Loaded via `lib/project/saveLoad.ts`.

## Vietnamese planning domain context

- **VN-2000 coordinate system** — auto-detected from easting/northing, used for multi-project spatial alignment
- **MCA 9 criteria** match the GIS-AI land suitability framework: X1 elevation, X2 flood risk, X3 water distance, X4 land-use type, X5 building density, X6 planning conformity, X7 GPMB cost, X8 traffic access, X9 road density — see `distil-reference/MD-gis-ai-land-suitability-evaluation.md`
- **Planning standards** referenced: QCVN 01:2021/BXD, Luật Quy hoạch đô thị và nông thôn 2024
- **Output classification** Y=0/1/2 (Không thuận lợi / Ít thuận lợi / Thuận lợi) rendered as red/orange/green overlay

## Tính năng đang phát triển

- Mô phỏng quy hoạch 3D từ file CAD (phương án quy hoạch)
- Mô phỏng luồng giao thông, đánh giá nút giao, bãi đỗ xe
