/**
 * TerrainTab.tsx — Sub-tab 3 "Địa hình" của Mục 2.
 * 3 nested tabs: Cao độ / Đường đồng mức / Phong thủy.
 */

import { useEffect, useState } from 'react';
import { Mountain, Map as MapIcon, Compass, Crop, ChevronDown, ChevronRight } from 'lucide-react';
import { useSiteStore } from '../../../../store/useSiteStore';
import { SubTabsHorizontal } from '../../SubTabsHorizontal';
import { PlaceholderCard } from './PlaceholderCard';
import { ModeCommentsBlock } from '../ModeCommentsBlock';

type Inner = 'elevation' | 'contour' | 'fengshui';

export function TerrainTab() {
  const [inner, setInner] = useState<Inner>('elevation');
  const [showBoundaryDebug, setShowBoundaryDebug] = useState(false);
  const setMode = useSiteStore(s => s.setMode);
  const env     = useSiteStore(s => s.env);
  const setEnv  = useSiteStore(s => s.setEnv);
  const terrain              = useSiteStore(s => s.terrain);
  const clickedPoint         = useSiteStore(s => s.clickedPoint);
  const setClickedPoint      = useSiteStore(s => s.setClickedPoint);
  const showContourOverlay   = useSiteStore(s => s.showContourOverlay);
  const toggleContourOverlay = useSiteStore(s => s.toggleContourOverlay);
  const elevColorMode        = useSiteStore(s => s.elevColorMode);
  const setElevColorMode     = useSiteStore(s => s.setElevColorMode);
  const contourCount         = useSiteStore(s => s.contourCount);
  const selectedBoundaryIdx  = useSiteStore(s => s.selectedBoundaryIdx);
  const setSelectedBoundaryIdx = useSiteStore(s => s.setSelectedBoundaryIdx);
  const demBufferDim        = useSiteStore(s => s.demBufferDim);
  const setDemBufferDim     = useSiteStore(s => s.setDemBufferDim);

  const boundaryCandidates = terrain?.boundaryCandidates ?? [];

  useEffect(() => {
    if (inner === 'elevation') setMode('elevation');
    if (inner === 'contour')   setMode('contour');
  }, [inner, setMode]);

  return (
    <SubTabsHorizontal
      tabs={[
        { id: 'elevation', label: 'Cao độ',       icon: <Mountain size={11}/> },
        { id: 'contour',   label: 'Đồng mức',     icon: <MapIcon size={11}/> },
        { id: 'fengshui',  label: 'Phong thủy',   icon: <Compass size={11}/> },
      ]}
      activeId={inner}
      onChange={(id) => setInner(id as Inner)}
    >
      {inner === 'elevation' && (
        <div className="space-y-2.5">

          {/* Bảng màu */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Bảng màu</div>
            <div className="flex gap-1">
              <button
                onClick={() => setElevColorMode('natural')}
                className={`flex-1 px-2 py-1 rounded text-[10px] font-bold border transition ${
                  elevColorMode === 'natural'
                    ? 'bg-green-500/25 border-green-400/60 text-green-200'
                    : 'border-white/10 text-slate-400 hover:text-slate-200'
                }`}
                title="Tông màu đất tự nhiên (xanh–vàng–nâu)"
              >
                🌿 Tự nhiên
              </button>
              <button
                onClick={() => setElevColorMode('rainbow')}
                className={`flex-1 px-2 py-1 rounded text-[10px] font-bold border transition ${
                  elevColorMode === 'rainbow'
                    ? 'bg-green-500/25 border-green-400/60 text-green-200'
                    : 'border-white/10 text-slate-400 hover:text-slate-200'
                }`}
                title="Gradient địa hình liên tục (xanh→vàng→đỏ) như topographic-map.com"
              >
                🌈 Topographic
              </button>
            </div>
            {/* Preview gradient bar */}
            {elevColorMode === 'rainbow' && (
              <div className="mt-1.5 h-3 rounded-sm w-full"
                style={{ background: 'linear-gradient(to right, #1a4fcc, #2a8a6e, #aacc44, #f5b800, #e05500, #aa1111)' }}
                title="Gradient: thấp (xanh) → cao (đỏ)"
              />
            )}
          </div>

          {/* ── Ranh giới hiển thị (dropdown manual) — luôn hiện khi có terrain ── */}
          {terrain && (() => {
            // Detect wedge: range/diagonal > 50% → cần clip
            const hm = terrain.heightmap;
            const range = hm.maxZ - hm.minZ;
            const diag = Math.hypot(hm.width * hm.cellSize, hm.height * hm.cellSize);
            const isWedgy = range > 30 && range / diag > 0.5;
            const hasCands = boundaryCandidates.length > 0;
            const activeCand = selectedBoundaryIdx !== null ? boundaryCandidates[selectedBoundaryIdx] : null;
            const borderColor = isWedgy && !activeCand ? 'border-red-400/60' : 'border-amber-400/40';
            const bgColor = isWedgy && !activeCand ? 'bg-red-500/10' : 'bg-amber-500/5';

            return (
              <div className={`rounded border ${borderColor} ${bgColor} p-2`}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold
                                  text-amber-300">
                    <Crop size={11}/> Ranh giới hiển thị
                  </div>
                  {activeCand && (
                    <span className="text-[9px] text-accent-teal font-mono">
                      ✓ {activeCand.layer}
                    </span>
                  )}
                  {!activeCand && hasCands && (
                    <span className="text-[9px] text-slate-500 font-mono">
                      Không clip
                    </span>
                  )}
                </div>

                {/* Cảnh báo nếu wedge detected nhưng chưa clip */}
                {isWedgy && !activeCand && (
                  <div className="text-[9.5px] text-red-300 mb-1.5 leading-snug">
                    ⚠ Phát hiện wedge nghiêng (chênh {range.toFixed(0)}m trên {diag.toFixed(0)}m diag).
                    {hasCands ? ' Chọn boundary ↓ để clip.' : ' DXF không có polyline khép kín nào.'}
                  </div>
                )}

                {hasCands ? (
                  <>
                    <select
                      value={selectedBoundaryIdx ?? -1}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setSelectedBoundaryIdx(v < 0 ? null : v);
                      }}
                      className="w-full px-2 py-1 rounded text-[10.5px] bg-bg-dark border border-white/15
                                 text-slate-100 outline-none focus:border-amber-400/60 cursor-pointer"
                    >
                      <option value={-1}>— Không clip (hiện toàn bộ TIN) —</option>
                      {boundaryCandidates.map((c, i) => (
                        <option key={i} value={i}>
                          {c.isLikelyBoundary ? '★ ' : '   '}
                          {c.layer} · {(c.area / 10000).toFixed(2)} ha
                          {c.aspectRatio > 4 ? ' (mỏng dài)' : ''}
                        </option>
                      ))}
                    </select>
                    <div className="text-[9.5px] text-slate-500 mt-1 leading-snug">
                      ★ = likely boundary (đề xuất). Auto-pick lúc load nếu có.
                    </div>
                  </>
                ) : (
                  <div className="text-[10px] text-slate-400 italic">
                    File DXF không có polyline khép kín (closed) phù hợp làm boundary.
                    Trong AutoCAD: vẽ polyline ranh giới + đặt tên layer là "Ranh gioi" / "H-limit" /
                    "boundary" rồi export DXF.
                  </div>
                )}

                {/* Debug info collapsible */}
                {hasCands && (
                  <>
                    <button
                      onClick={() => setShowBoundaryDebug(v => !v)}
                      className="mt-1.5 flex items-center gap-1 text-[9.5px] text-slate-500 hover:text-slate-300"
                    >
                      {showBoundaryDebug ? <ChevronDown size={10}/> : <ChevronRight size={10}/>}
                      Chi tiết ({boundaryCandidates.length} candidate)
                    </button>
                    {showBoundaryDebug && (
                      <div className="mt-1 space-y-0.5 text-[9px] font-mono text-slate-400 pl-2 border-l border-amber-400/20">
                        {boundaryCandidates.slice(0, 10).map((c, i) => (
                          <div key={i} className={c.isLikelyBoundary ? 'text-amber-300' : ''}>
                            #{i} {c.isLikelyBoundary ? '★' : ' '} layer="{c.layer}" ·
                            {' '}{(c.area / 10000).toFixed(2)} ha ({c.pctOfBbox.toFixed(0)}% bbox) ·
                            {' '}aspect={c.aspectRatio.toFixed(1)} · closed={c.closedKind}
                          </div>
                        ))}
                        {boundaryCandidates.length > 10 && (
                          <div className="text-slate-600">... +{boundaryCandidates.length - 10} more</div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {/* ── Độ mờ vùng mở rộng nghiên cứu (chỉ hiện với terrain dựng từ DEM Google Earth) ── */}
          {terrain?.heightmap.boundaryMask && (
            <div className="rounded border border-cyan-400/30 bg-cyan-500/5 p-2">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="text-[10px] uppercase tracking-wider font-bold text-cyan-300">
                  Vùng mở rộng nghiên cứu
                </div>
                <span className="text-[9px] text-slate-500 font-mono">{Math.round(demBufferDim * 100)}% mờ</span>
              </div>
              <input
                type="range"
                min={0} max={1} step={0.05}
                value={demBufferDim}
                onChange={(e) => setDemBufferDim(Number(e.target.value))}
                className="w-full h-1 accent-cyan-400"
                title="Độ mờ vùng buffer quanh ranh giới thật — 0% = hiện rõ như ranh giới chính, 100% = mờ tối đa"
              />
              <div className="text-[9.5px] text-slate-500 mt-1 leading-snug">
                Kéo về 0% để xem toàn bộ rõ nét, hoặc dùng dropdown "Ranh giới hiển thị" ↑
                để ẨN HẲN vùng này (chỉ giữ đúng ranh giới KMZ/vẽ tay).
              </div>
            </div>
          )}

          {/* Min/Max cao độ — chỉ hiển thị (read-only), absolute từ file gốc */}
          {terrain && (
            <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
              <div className="px-2 py-1 rounded bg-blue-500/10 border border-blue-400/25">
                <div className="text-[9px] text-slate-500 uppercase">Thấp nhất</div>
                <div className="text-blue-300 font-bold">{terrain.heightmap.minZ.toFixed(2)} m</div>
              </div>
              <div className="px-2 py-1 rounded bg-red-500/10 border border-red-400/25">
                <div className="text-[9px] text-slate-500 uppercase">Cao nhất</div>
                <div className="text-red-300 font-bold">{terrain.heightmap.maxZ.toFixed(2)} m</div>
              </div>
            </div>
          )}

          {/* Hướng dẫn click + hiển thị điểm vừa click */}
          <div className="px-2 py-1.5 rounded bg-amber-500/8 border border-amber-400/25">
            <div className="flex items-center gap-1.5 text-[10px] text-amber-300 font-bold mb-0.5">
              📍 Đo cao độ tại điểm
            </div>
            {clickedPoint ? (
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10.5px] font-mono text-slate-200">
                  <b className="text-amber-300">{clickedPoint.y.toFixed(2)} m</b>
                  <span className="text-slate-500 ml-1.5">
                    @ ({clickedPoint.x.toFixed(1)}, {clickedPoint.z.toFixed(1)})
                  </span>
                </div>
                <button
                  onClick={() => setClickedPoint(null)}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10
                             text-slate-500 hover:text-slate-200 transition"
                >
                  Xoá
                </button>
              </div>
            ) : (
              <div className="text-[9.5px] text-slate-500 italic">
                Click vào bề mặt 3D để xem cao độ tuyệt đối tại điểm đó
              </div>
            )}
          </div>

          <ModeCommentsBlock mode="elevation" />
        </div>
      )}

      {inner === 'contour' && (
        <div className="space-y-2.5">
          <label className="flex items-center gap-2 cursor-pointer text-[10.5px]">
            <input
              type="checkbox" checked={showContourOverlay} onChange={toggleContourOverlay}
              className="accent-green-400"
            />
            <span className="text-slate-300">Hiện đường đồng mức trên 3D</span>
          </label>

          {/* Khoảng đều đường đồng mức */}
          <div className="grid grid-cols-[80px_1fr_50px] items-center gap-2">
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Khoảng đều</label>
            <input
              type="range" min={1} max={20} step={1} value={env.contourInterval}
              onChange={(e) => setEnv({ contourInterval: Number(e.target.value) })}
              className="w-full h-1 accent-green-400"
            />
            <span className="text-[10px] font-mono text-slate-300 text-right">{env.contourInterval}m</span>
          </div>

          {/* Feedback: số đường đang hiển thị / tổng */}
          {contourCount.total > 0 && (
            <div className="text-[9.5px] text-slate-500 font-mono pl-0.5">
              Đang giữ <b className="text-green-300">{contourCount.kept}</b>
              <span className="text-slate-600"> / {contourCount.total}</span> đường
              {contourCount.kept < contourCount.total && (
                <span className="text-amber-400 ml-1">
                  (lọc {Math.round((1 - contourCount.kept / contourCount.total) * 100)}%)
                </span>
              )}
            </div>
          )}

          {/* Độ mờ */}
          <div className="grid grid-cols-[80px_1fr_50px] items-center gap-2">
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Độ trong</label>
            <input
              type="range" min={0} max={1} step={0.05} value={env.contourOpacity}
              onChange={(e) => setEnv({ contourOpacity: Number(e.target.value) })}
              className="w-full h-1 accent-green-400"
            />
            <span className="text-[10px] font-mono text-slate-300 text-right">
              {(env.contourOpacity * 100).toFixed(0)}%
            </span>
          </div>

          {/* Màu đường đồng mức */}
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Màu đường</div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setEnv({ contourColorMode: 'elevation' })}
                className={`flex-1 px-2 py-1 rounded text-[10px] font-bold border transition ${
                  env.contourColorMode === 'elevation'
                    ? 'bg-green-500/25 border-green-400/60 text-green-200'
                    : 'border-white/10 text-slate-400 hover:text-slate-200'
                }`}
                title="Gradient màu theo dải cao độ (xanh thấp → đỏ cao)"
              >
                Theo cao độ
              </button>
              <button
                onClick={() => setEnv({ contourColorMode: 'single' })}
                className={`flex-1 px-2 py-1 rounded text-[10px] font-bold border transition ${
                  env.contourColorMode === 'single'
                    ? 'bg-green-500/25 border-green-400/60 text-green-200'
                    : 'border-white/10 text-slate-400 hover:text-slate-200'
                }`}
                title="Một màu cố định cho tất cả đường đồng mức"
              >
                Đồng nhất
              </button>
            </div>

            {/* Color picker + presets — luôn hiện khi mode='single' */}
            {env.contourColorMode === 'single' && (
              <div className="space-y-1.5 pl-1 pt-0.5">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={env.contourSingleColor ?? '#22d3c5'}
                    onChange={(e) => setEnv({ contourSingleColor: e.target.value })}
                    className="w-12 h-7 rounded border border-white/10 bg-transparent cursor-pointer"
                    title="Mở picker để chọn màu tự do"
                  />
                  <input
                    type="text"
                    value={env.contourSingleColor ?? '#22d3c5'}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      if (/^#[0-9a-fA-F]{6}$/.test(v)) setEnv({ contourSingleColor: v });
                    }}
                    className="flex-1 px-2 py-1 text-[10px] font-mono bg-bg-dark border border-white/10
                               rounded text-slate-200 outline-none focus:border-green-400/50"
                    placeholder="#22d3c5"
                  />
                </div>
                {/* Preset swatches */}
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider mr-1">Preset:</span>
                  {[
                    '#ffffff', '#22d3c5', '#f59e0b', '#ef4444', '#a78bfa',
                    '#84cc16', '#06b6d4', '#94a3b8', '#000000',
                  ].map(c => (
                    <button
                      key={c}
                      onClick={() => setEnv({ contourSingleColor: c })}
                      className={`w-5 h-5 rounded border transition hover:scale-110 ${
                        env.contourSingleColor === c
                          ? 'border-green-400 ring-1 ring-green-400/50'
                          : 'border-white/20'
                      }`}
                      style={{ background: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <ModeCommentsBlock mode="contour" />
        </div>
      )}

      {inner === 'fengshui' && (
        <div className="space-y-2.5">
          <PlaceholderCard
            icon={<Compass size={13} />}
            title="Phân tích phong thủy thế núi"
            description="Tự động nhận diện 'Tả Thanh Long – Hữu Bạch Hổ – Tiền Chu Tước – Hậu Huyền Vũ' từ địa hình 3D. Đánh giá hướng minh đường, dòng nước, thế núi bao quanh — phục vụ quy hoạch theo nguyên tắc phong thủy truyền thống."
          />
        </div>
      )}
    </SubTabsHorizontal>
  );
}
