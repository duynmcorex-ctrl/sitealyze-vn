/**
 * PlanningSection.tsx — Mục 3 "Phương án quy hoạch"
 *
 * - File CAD sử dụng đất (LandusePanel hiện có)
 * - File Excel chỉ tiêu (đã tích hợp trong LandusePanel)
 * - Toggle 3D massing: extrude khối công trình từ maxFloors × floorHeight
 */

import { Box } from 'lucide-react';
import { LandusePanel } from '../LandusePanel';
import { useSiteStore } from '../../../store/useSiteStore';

export function PlanningSection() {
  const showMassing3D   = useSiteStore(s => s.showMassing3D);
  const toggleMassing3D = useSiteStore(s => s.toggleMassing3D);
  const floorHeight     = useSiteStore(s => s.floorHeight);
  const setFloorHeight  = useSiteStore(s => s.setFloorHeight);
  const landuse         = useSiteStore(s => s.landuse);
  const typeOverrides   = useSiteStore(s => s.typeOverrides);

  // Đếm parcel có maxFloors > 0 — TỪ indicator HOẶC từ type override
  // (Indicator parcel-level WIN, không có thì dùng typeOverride)
  const countMassable = landuse?.parcels.filter(p => {
    const ov = typeOverrides[p.inferredType];
    const floors = p.indicator?.maxFloors ?? ov?.maxFloors;
    return floors !== undefined && floors !== null && floors > 0;
  }).length ?? 0;
  const totalParcels = landuse?.parcels.length ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <LandusePanel />

      {/* ── 3D Building Massing Control ── */}
      <div className="rounded-md border border-amber-400/30 bg-amber-500/8 p-2.5 space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-300 uppercase tracking-wider">
          <Box size={12} /> Khối 3D công trình
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-[10.5px]">
          <input
            type="checkbox"
            checked={showMassing3D}
            onChange={toggleMassing3D}
            className="accent-amber-400"
            disabled={countMassable === 0}
          />
          <span className={countMassable === 0 ? 'text-slate-500' : 'text-slate-200'}>
            Hiện khối 3D công trình (theo tầng cao × MĐXD)
          </span>
        </label>

        {showMassing3D && (
          <div className="grid grid-cols-[80px_1fr_55px] items-center gap-2 pt-1">
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Cao tầng</label>
            <input
              type="range" min={2.5} max={5} step={0.1} value={floorHeight}
              onChange={(e) => setFloorHeight(Number(e.target.value))}
              className="w-full h-1 accent-amber-400"
            />
            <span className="text-[10px] font-mono text-amber-300 text-right">
              {floorHeight.toFixed(1)} m
            </span>
          </div>
        )}

        {/* Thống kê */}
        {totalParcels > 0 && (
          <div className="text-[9.5px] text-slate-400 leading-relaxed pt-0.5">
            {countMassable > 0 ? (
              <>
                Đã có <b className="text-amber-300">{countMassable}</b> / {totalParcels} ô có
                tầng cao trong chỉ tiêu — bật toggle để dựng khối.
                {showMassing3D && (
                  <span className="block mt-0.5 text-slate-500">
                    Footprint khối thu nhỏ theo √(MĐXD/100) để khối &lt; ranh ô đất.
                  </span>
                )}
              </>
            ) : (
              <span className="text-amber-400/80">
                ⚠ Chưa parcel nào có tầng cao. Có 2 cách:
                <br/>(1) Tải Excel chỉ tiêu SDD ở trên, hoặc
                <br/>(2) <b className="text-amber-300">Gõ MĐXD + Tầng theo từng loại đất</b> ngay
                trong bảng phân bố loại đất ↑ (LandusePanel).
              </span>
            )}
          </div>
        )}
        {totalParcels === 0 && (
          <div className="text-[9.5px] text-slate-500 italic">
            Tải file DXF QH sử dụng đất + Excel chỉ tiêu để bắt đầu mô phỏng.
          </div>
        )}
      </div>
    </div>
  );
}
