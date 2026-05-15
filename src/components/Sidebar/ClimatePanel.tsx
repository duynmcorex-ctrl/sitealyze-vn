/**
 * ClimatePanel.tsx
 * Phân tích khí hậu & tư vấn bố trí chức năng theo quy hoạch VN.
 * Tham chiếu: QCVN 09:2017/BXD, TCVN 4088:2011, khi_hau_quy_hoach_khu_dat.md
 *
 * Input: heightmap (Z range, aspect, slope), geo (province → climate zone)
 * Output: gợi ý bố trí chức năng theo hướng nắng/gió, loại địa hình, độ cao
 */

import { useSiteStore } from '../../store/useSiteStore';
import { Sun, Wind, Droplets, AlertTriangle, CheckCircle, Info, Thermometer } from 'lucide-react';

// ── Hướng ưu tiên cho từng loại công trình (bảng 1+2 từ guide) ─────────────
const FUNC_GUIDE = [
  { func: 'Nhà ở / Villa / Phòng nghỉ',    best: 'Nam, Đông Nam',     avoid: 'Tây, Tây Bắc',  icon: '🏠' },
  { func: 'Lobby / Tiền sảnh đón tiếp',    best: 'Đông, Đông Nam',    avoid: 'Tây (chói chiều)',icon: '🏛' },
  { func: 'Nhà hàng / F&B ngoài trời',     best: 'Nam, Đông Nam',     avoid: 'Tây (nóng tối)',  icon: '🍽' },
  { func: 'Spa / Wellness / Thiền',         best: 'Đông, Đông Nam',    avoid: 'Tây (bức xạ)',    icon: '🧘' },
  { func: 'Bể bơi ngoài trời',             best: 'Đông, Nam',         avoid: 'Tây (chói chiều)',icon: '🏊' },
  { func: 'Sân thể thao',                  best: 'Nam, Đông Nam',     avoid: 'Tây (chói mắt)',  icon: '⚽' },
  { func: 'Kho / Kỹ thuật / Bãi đỗ',      best: 'Bắc, Tây Bắc',     avoid: '—',               icon: '🏭' },
  { func: 'Solar (tấm pin mặt trời)',       best: 'Nam, nghiêng 10–20°',avoid: 'Bắc (thấp hiệu quả)', icon: '☀' },
  { func: 'Mặt nước / Hồ cảnh quan',       best: 'Đầu hướng gió mát', avoid: '—',              icon: '💧' },
];

// ── Phân tích terrain → loại địa hình ───────────────────────────────────────
function classifyTerrain(minZ: number, maxZ: number, cellSize: number): {
  type: 'lowland' | 'hill' | 'mountain';
  heightRange: number;
  label: string;
  desc: string;
} {
  const h = maxZ - minZ;
  if (h < 20)  return { type: 'lowland',  heightRange: h, label: 'Đồng bằng / Mặt bằng', desc: 'Độ dốc thấp, cần hệ thống thoát nước nhân tạo. Gió quét tự do theo hướng chủ đạo.' };
  if (h < 200) return { type: 'hill',     heightRange: h, label: 'Đồi thấp ('+h.toFixed(0)+'m)', desc: 'Vi khí hậu thay đổi theo sườn. Sườn Nam/ĐN ưu tiên ở chính. Tránh đáy thung lũng (gió katabatic, sương mù).' };
  return      { type: 'mountain',  heightRange: h, label: 'Đồi/Núi cao ('+h.toFixed(0)+'m)', desc: 'Chênh lệch nhiệt ~0.6°C/100m. Sương mù 600–1500m. Thiết kế theo "vành đai độ cao": dịch vụ ở chân, khu ở giữa sườn, landmark trên đỉnh.' };
}

// ── Rủi ro theo địa hình ────────────────────────────────────────────────────
function getRisks(terrainType: string, heightRange: number): { level: 'high'|'med'|'low'; text: string }[] {
  const risks: { level: 'high'|'med'|'low'; text: string }[] = [];
  if (terrainType === 'lowland') {
    risks.push({ level: 'high', text: 'Thoát nước phụ thuộc hạ tầng — cần độ dốc nhân tạo ≥ 0.5–1%, hồ điều tiết' });
    risks.push({ level: 'med',  text: 'Đảo nhiệt đô thị nếu tỷ lệ bê tông hóa cao — dải cây xanh ≥ 30%' });
  }
  if (terrainType === 'hill' || terrainType === 'mountain') {
    risks.push({ level: 'high', text: 'Sạt lở khi mưa lớn ở độ dốc > 30% — kiểm tra QCVN trước khi bố trí công trình' });
    risks.push({ level: 'med',  text: 'Gió katabatic ban đêm: khí lạnh chảy xuống thung lũng — tránh phòng nghỉ ở đáy' });
  }
  if (heightRange > 200) {
    risks.push({ level: 'med',  text: 'Sương mù 600–1500m — ảnh hưởng giao thông và hoạt động ngoài trời buổi sáng' });
  }
  return risks;
}

// ── Component ────────────────────────────────────────────────────────────────
export function ClimatePanel() {
  const terrain = useSiteStore(s => s.terrain);
  const geo     = useSiteStore(s => s.geo);

  if (!terrain) {
    return (
      <div className="text-slate-500 text-xs p-3 italic">
        Tải file CAD địa hình để xem phân tích khí hậu
      </div>
    );
  }

  const { minZ, maxZ } = terrain.heightmap;
  const terrainInfo = classifyTerrain(minZ, maxZ, terrain.heightmap.cellSize);
  const risks = getRisks(terrainInfo.type, terrainInfo.heightRange);
  const province = geo?.province ?? '';

  // Phát hiện vùng ven biển hay miền núi theo tên tỉnh
  const isCoastal    = /Đà Nẵng|Khánh Hòa|Bình Thuận|Ninh Thuận|Quảng Nam|Quảng Ngãi|Phú Yên|Bình Định|Thừa Thiên|Quảng Bình|Hà Tĩnh|Hải Phòng|Nam Định|Thái Bình|Kiên Giang|Cà Mau|Bà Rịa|TP.HCM/.test(province);
  const isLaoWind    = /Nghệ An|Hà Tĩnh|Quảng Bình|Quảng Trị|Thừa Thiên/.test(province);
  const isHighland   = /Lâm Đồng|Kon Tum|Gia Lai|Đắk Lắk|Đắk Nông|Sơn La|Điện Biên|Lai Châu|Lào Cai|Hà Giang|Yên Bái/.test(province);

  return (
    <div className="flex flex-col gap-3 text-xs">

      {/* Loại địa hình */}
      <div className="bg-white/5 rounded-lg p-3 border border-white/10">
        <div className="flex items-center gap-2 mb-1.5">
          <Thermometer size={13} className="text-amber-400 shrink-0" />
          <span className="font-semibold text-slate-200">{terrainInfo.label}</span>
          <span className="ml-auto text-slate-500 font-mono text-[10px]">{minZ.toFixed(0)}–{maxZ.toFixed(0)} m</span>
        </div>
        <p className="text-slate-400 leading-relaxed">{terrainInfo.desc}</p>
      </div>

      {/* Hướng nắng + gió chính */}
      <div className="bg-white/5 rounded-lg p-3 border border-white/10">
        <div className="flex items-center gap-2 mb-2">
          <Sun size={13} className="text-yellow-400 shrink-0" />
          <span className="font-semibold text-slate-200">Hướng nắng & gió VN</span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10.5px]">
          <div className="flex gap-1.5"><span className="text-yellow-300 font-bold w-16 shrink-0">Lý tưởng:</span><span className="text-slate-300">Đông Nam — nắng sớm + thoáng gió</span></div>
          <div className="flex gap-1.5"><span className="text-red-400 font-bold w-16 shrink-0">Tránh:</span><span className="text-slate-300">Tây, Tây Bắc — bức xạ chiều + gió lạnh</span></div>
          <div className="flex gap-1.5"><span className="text-cyan-300 font-bold w-16 shrink-0">Gió hè:</span><span className="text-slate-300">Đông Nam / Nam (ẩm, mát từ biển)</span></div>
          <div className="flex gap-1.5"><span className="text-blue-300 font-bold w-16 shrink-0">Gió đông:</span><span className="text-slate-300">Đông Bắc (lạnh, hanh — MB)</span></div>
        </div>
        {isLaoWind && (
          <div className="mt-2 flex items-start gap-1.5 bg-orange-500/10 rounded px-2 py-1.5">
            <Wind size={11} className="text-orange-400 shrink-0 mt-0.5" />
            <span className="text-orange-300">⚡ Vùng Gió Lào: T &gt; 40°C, ẩm &lt; 40% hướng Tây — bắt buộc vành đai cây xanh dày + Low-E cho cửa Tây</span>
          </div>
        )}
        {isCoastal && (
          <div className="mt-2 flex items-start gap-1.5 bg-blue-500/10 rounded px-2 py-1.5">
            <Droplets size={11} className="text-blue-300 shrink-0 mt-0.5" />
            <span className="text-blue-200">🌊 Ven biển: gió biển cuốn muối → dùng thép inox 316L, tránh kính phản quang hướng biển</span>
          </div>
        )}
        {isHighland && (
          <div className="mt-2 flex items-start gap-1.5 bg-purple-500/10 rounded px-2 py-1.5">
            <Info size={11} className="text-purple-300 shrink-0 mt-0.5" />
            <span className="text-purple-200">🏔 Cao nguyên: chênh nhiệt ngày/đêm &gt; 15°C → xử lý giãn nở vật liệu; đêm núi rừng lạnh sau 18h</span>
          </div>
        )}
      </div>

      {/* Rủi ro cần xử lý */}
      {risks.length > 0 && (
        <div className="bg-white/5 rounded-lg p-3 border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={13} className="text-amber-400 shrink-0" />
            <span className="font-semibold text-slate-200">Rủi ro cần xử lý</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {risks.map((r, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${r.level==='high'?'bg-red-400':r.level==='med'?'bg-yellow-400':'bg-green-400'}`} />
                <span className="text-slate-400 leading-relaxed">{r.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bảng bố trí chức năng */}
      <div className="bg-white/5 rounded-lg p-3 border border-white/10">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle size={13} className="text-green-400 shrink-0" />
          <span className="font-semibold text-slate-200">Bố trí chức năng theo hướng</span>
          <span className="ml-auto text-slate-600 text-[9px]">QCVN 09:2017/BXD</span>
        </div>
        <div className="flex flex-col gap-1">
          {FUNC_GUIDE.map((g, i) => (
            <div key={i} className="grid grid-cols-[16px_1fr_auto_auto] gap-x-1.5 items-start py-0.5 border-b border-white/5 last:border-0">
              <span className="text-[11px]">{g.icon}</span>
              <span className="text-slate-300 text-[10.5px]">{g.func}</span>
              <span className="text-green-400 text-[9.5px] font-mono text-right">{g.best}</span>
              {g.avoid !== '—' && (
                <span className="text-red-400/70 text-[9px] font-mono text-right ml-1">✕{g.avoid}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Cây xanh chiến lược */}
      <div className="bg-white/5 rounded-lg p-3 border border-white/10">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-green-400 text-[13px]">🌳</span>
          <span className="font-semibold text-slate-200">Cây xanh chiến lược khí hậu</span>
        </div>
        <div className="flex flex-col gap-1 text-[10.5px] text-slate-400">
          <div><span className="text-green-300">Hướng Nam/ĐN:</span> Cây rụng lá cao tán — che nắng hè, lọt nắng đông</div>
          <div><span className="text-orange-300">Hướng Tây/TN:</span> Cây thường xanh tán dày — chắn bức xạ chiều quanh năm</div>
          <div><span className="text-blue-300">Vuông góc gió ĐB:</span> Hàng cây chắn gió thường xanh — giảm thất thoát nhiệt</div>
          <div><span className="text-cyan-300">Dọc mặt đứng Tây:</span> Cây bụi thấp — giảm bức xạ mặt đất</div>
        </div>
      </div>

      <div className="text-[9px] text-slate-600 px-1">
        📚 Tham chiếu: QCVN 09:2017/BXD · TCVN 4088:2011 · climate-data.org · suncalc.org
      </div>
    </div>
  );
}
