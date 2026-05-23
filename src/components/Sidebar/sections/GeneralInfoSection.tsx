/**
 * GeneralInfoSection.tsx — Mục 1 "Thông tin chung"
 *
 * Layout 2 cột: label trái (~14ch), input phải, dòng liền nhau (gap nhỏ).
 *
 * 8 trường theo PDF:
 *   1. Tên dự án
 *   2. Chủ đầu tư
 *   3. Vị trí (nhập / KMZ — KMZ placeholder)
 *   4. Diện tích
 *   5. Tỉ lệ (radio: 1/5000, 1/2000, 1/500)
 *   6. Loại hình (tag chip multi)
 *   7. Dân số
 *   8. Nhiệm vụ thiết kế
 *
 * + Khu vực "Tổng hợp thông tin" tự động
 */

import { useMemo, useState, useRef, ReactNode } from 'react';
import { MapPin, X, Upload } from 'lucide-react';
import { useSiteStore } from '../../../store/useSiteStore';
import type { PlanningScale } from '../../../store/useSiteStore';
import { PROVINCES } from '../../../lib/coord/provinces';
import { parseLocationFile } from '../../../lib/coord/parseKml';
import { findProvince } from '../../../lib/coord/provinces';

const DEFAULT_TAGS = [
  'QH Đô thị', 'Du lịch', 'Nghỉ dưỡng', 'Golf', 'Đô thị du lịch',
  'Khu dân cư', 'Khu công nghiệp', 'Hành chính', 'Sinh thái',
];

interface RowProps {
  label: string;
  children: ReactNode;
  /** Đặt label trên dòng riêng (cho textarea, tag chip) */
  stack?: boolean;
}

function Row({ label, children, stack }: RowProps) {
  if (stack) {
    return (
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
        {children}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[80px_1fr] items-center gap-2">
      <label className="text-[10px] uppercase tracking-wider text-slate-500">{label}</label>
      <div>{children}</div>
    </div>
  );
}

export function GeneralInfoSection() {
  const projects          = useSiteStore(s => s.projects);
  const activeProjectId   = useSiteStore(s => s.activeProjectId);
  const updateProjectInfo = useSiteStore(s => s.updateProjectInfo);
  const renameProject     = useSiteStore(s => s.renameProject);
  const terrain           = useSiteStore(s => s.terrain);
  const geo               = useSiteStore(s => s.geo);
  const setGeoOverride    = useSiteStore(s => s.setGeoOverride);

  const active = projects.find(p => p.id === activeProjectId);
  const [newTag, setNewTag] = useState('');
  const [kmzMsg, setKmzMsg] = useState<string | null>(null);
  const kmzRef = useRef<HTMLInputElement>(null);

  /** Upload KMZ/KML → trích lat/lon → auto-set province */
  const handleKmzFile = async (file: File) => {
    setKmzMsg('Đang đọc file…');
    try {
      const loc = await parseLocationFile(file);
      if (!loc) {
        setKmzMsg('⚠ Không tìm thấy toạ độ. Thử xuất KML từ Google Earth.');
        return;
      }
      const found = findProvince(loc.lat, loc.lon);
      if (found) {
        setGeoOverride(found.province);
        setKmzMsg(`✓ ${found.province} (${loc.lat.toFixed(3)}°N, ${loc.lon.toFixed(3)}°E)`);
      } else {
        setKmzMsg(`✓ ${loc.lat.toFixed(3)}°N, ${loc.lon.toFixed(3)}°E (chưa nhận diện tỉnh)`);
      }
    } catch {
      setKmzMsg('⚠ Lỗi đọc file. Kiểm tra định dạng KMZ/KML.');
    }
  };
  const tags = active?.tags ?? [];

  // Auto-calculated area (ha)
  const autoAreaHa = terrain
    ? (terrain.heightmap.width * terrain.heightmap.height * terrain.heightmap.cellSize ** 2) / 10000
    : null;
  const displayAreaHa = active?.manualAreaHa ?? autoAreaHa;

  const addTag = (t: string) => {
    const v = t.trim();
    if (!v || tags.includes(v)) return;
    updateProjectInfo({ tags: [...tags, v] });
    setNewTag('');
  };
  const removeTag = (t: string) => {
    updateProjectInfo({ tags: tags.filter(x => x !== t) });
  };

  // Auto-summary
  const summary = useMemo(() => {
    if (!active) return '';
    const parts: string[] = [];
    if (active.name)     parts.push(`Dự án "${active.name}"`);
    if (active.investor) parts.push(`chủ đầu tư: ${active.investor}`);
    if (geo)             parts.push(`tại ${geo.province}`);
    if (displayAreaHa)   parts.push(`diện tích ${displayAreaHa.toFixed(2)} ha`);
    if (active.scale)    parts.push(`tỉ lệ ${active.scale}`);
    if (tags.length > 0) parts.push(`loại hình: ${tags.join(', ')}`);
    if (active.population) parts.push(`dân số dự kiến ${active.population.toLocaleString('vi-VN')} người`);
    if (active.designBrief) parts.push(`Nhiệm vụ thiết kế: ${active.designBrief}`);
    return parts.length ? parts.join('. ') + '.' : '';
  }, [active, geo, displayAreaHa, tags]);

  if (!active) {
    return (
      <div className="text-[10.5px] text-slate-500 italic py-1.5">
        Chưa có dự án nào. Tạo dự án mới trong mục 0.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">

      {/* 1. Tên dự án */}
      <Row label="Tên dự án">
        <input
          value={active.name}
          onChange={(e) => renameProject(active.id, e.target.value)}
          placeholder="VD: Khu đô thị Bắc Lý Nhân"
          className="w-full px-2 py-1 text-xs bg-bg-dark border border-white/10 rounded
                     text-slate-100 outline-none focus:border-slate-400/60 transition"
        />
      </Row>

      {/* 2. Chủ đầu tư */}
      <Row label="Chủ đầu tư">
        <input
          value={active.investor ?? ''}
          onChange={(e) => updateProjectInfo({ investor: e.target.value || undefined })}
          placeholder="VD: Công ty TNHH ABC"
          className="w-full px-2 py-1 text-xs bg-bg-dark border border-white/10 rounded
                     text-slate-100 outline-none focus:border-slate-400/60 transition"
        />
      </Row>

      {/* 3. Vị trí — province dropdown + KMZ upload + lat/lon display */}
      <Row label="Vị trí" stack>
        {/* Province dropdown */}
        <div className="flex items-center gap-1.5">
          <select
            value={geo?.province ?? ''}
            onChange={(e) => setGeoOverride(e.target.value || null)}
            className="flex-1 px-2 py-1 rounded text-[10.5px] bg-bg-dark border border-white/10
                       text-slate-200 outline-none hover:border-slate-400/50 focus:border-slate-400/60
                       transition cursor-pointer"
          >
            <option value="">— Chọn tỉnh/thành —</option>
            {PROVINCES.map(p => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
          {/* KMZ upload button */}
          <button
            onClick={() => kmzRef.current?.click()}
            title="Upload file KMZ/KML ranh giới từ Google Earth để tự động nhận vị trí"
            className="p-1.5 rounded border border-white/10 text-slate-400
                       hover:text-accent-teal hover:border-accent-teal/50 transition"
          >
            <Upload size={12} />
          </button>
          <input
            ref={kmzRef} type="file" accept=".kmz,.kml,.KMZ,.KML"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleKmzFile(f); e.target.value = ''; }}
          />
          {/* Clear button */}
          {geo && (
            <button
              onClick={() => { setGeoOverride(null); setKmzMsg(null); }}
              title="Xoá — tự phát hiện lại từ DXF"
              className="p-1 text-slate-600 hover:text-red-400 transition"
            >
              <X size={11} />
            </button>
          )}
        </div>
        {/* Lat/lon display or KMZ status */}
        {geo && (
          <div className="text-[9.5px] text-slate-500 font-mono pl-0.5">
            <MapPin size={9} className="inline mr-0.5 text-accent-teal" />
            {geo.lat.toFixed(4)}°N · {geo.lon.toFixed(4)}°E
            <span className="ml-1.5 text-slate-600">· {geo.climateZone}</span>
          </div>
        )}
        {kmzMsg && (
          <div className={`text-[9.5px] leading-snug ${kmzMsg.startsWith('✓') ? 'text-accent-teal' : 'text-amber-400'}`}>
            {kmzMsg}
          </div>
        )}
        {!geo && (
          <div className="text-[9.5px] text-slate-600 italic">
            Upload file KMZ/KML từ Google Earth hoặc chọn tỉnh thủ công
          </div>
        )}
      </Row>

      {/* 4. Diện tích */}
      <Row label="Diện tích">
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={active.manualAreaHa ?? ''}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              updateProjectInfo({ manualAreaHa: Number.isFinite(v) ? v : undefined });
            }}
            min={0} step={0.01}
            placeholder={autoAreaHa ? autoAreaHa.toFixed(2) : '—'}
            className="flex-1 px-2 py-1 text-xs bg-bg-dark border border-white/10 rounded
                       text-slate-100 outline-none focus:border-slate-400/60 transition"
          />
          <span className="text-[10px] text-slate-500 shrink-0">ha</span>
          {autoAreaHa && (
            <span className="text-[9px] text-slate-600 shrink-0" title="Diện tích tự tính từ heightmap">
              (tự: {autoAreaHa.toFixed(1)})
            </span>
          )}
        </div>
      </Row>

      {/* 5. Tỉ lệ (radio) */}
      <Row label="Tỉ lệ">
        <div className="flex gap-1.5">
          {(['1/5000', '1/2000', '1/500'] as PlanningScale[]).map(s => {
            const isActive = active.scale === s;
            return (
              <button
                key={s}
                onClick={() => updateProjectInfo({ scale: isActive ? undefined : s })}
                title={s === '1/5000' ? 'QH chung' : s === '1/2000' ? 'QH phân khu' : 'QH chi tiết / thiết kế đô thị'}
                className={`flex-1 px-1 py-1 rounded text-[10px] font-bold border transition
                  ${isActive
                    ? 'bg-slate-500/25 border-slate-400/60 text-slate-100'
                    : 'border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/25'}`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </Row>

      {/* 6. Loại hình (tag chip multi) */}
      <Row label="Loại hình" stack>
        <div className="flex flex-wrap gap-1">
          {tags.map(t => (
            <span
              key={t}
              className="inline-flex items-center gap-0.5 pl-2 pr-1 py-0.5 rounded-full
                         text-[10px] bg-slate-500/20 border border-slate-400/40 text-slate-200"
            >
              {t}
              <button onClick={() => removeTag(t)} className="text-slate-500 hover:text-red-400">
                <X size={9} />
              </button>
            </span>
          ))}
          {/* Suggest chip */}
          {DEFAULT_TAGS.filter(t => !tags.includes(t)).slice(0, 4).map(t => (
            <button
              key={t}
              onClick={() => addTag(t)}
              className="px-2 py-0.5 rounded-full text-[10px] border border-dashed border-white/15
                         text-slate-500 hover:text-slate-300 hover:border-slate-400/40 transition"
              title={`Thêm tag "${t}"`}
            >
              + {t}
            </button>
          ))}
          {/* Custom tag input */}
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addTag(newTag);
            }}
            placeholder="+ thêm…"
            className="px-2 py-0.5 rounded-full text-[10px] bg-bg-dark border border-white/10
                       text-slate-200 outline-none w-20 focus:border-slate-400/50 transition"
          />
        </div>
      </Row>

      {/* 7. Dân số */}
      <Row label="Dân số">
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={active.population ?? ''}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              updateProjectInfo({ population: Number.isFinite(v) ? v : undefined });
            }}
            min={0} step={100}
            placeholder="VD: 5000"
            className="flex-1 px-2 py-1 text-xs bg-bg-dark border border-white/10 rounded
                       text-slate-100 outline-none focus:border-slate-400/60 transition"
          />
          <span className="text-[10px] text-slate-500 shrink-0">người</span>
        </div>
      </Row>

      {/* 8. Nhiệm vụ thiết kế */}
      <Row label="Nhiệm vụ" stack>
        <textarea
          value={active.designBrief ?? ''}
          onChange={(e) => updateProjectInfo({ designBrief: e.target.value || undefined })}
          placeholder="Mô tả ngắn về mục tiêu, định hướng, nhiệm vụ thiết kế chính của đồ án…"
          rows={3}
          className="w-full px-2 py-1.5 text-xs bg-bg-dark border border-white/10 rounded
                     text-slate-100 outline-none focus:border-slate-400/60 transition resize-none leading-relaxed"
        />
      </Row>

      {/* ── Tổng hợp thông tin tự động ── */}
      <div className="mt-1 pt-2 border-t border-white/8">
        <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-bold mb-1">
          📋 Tổng hợp thông tin
        </div>
        {summary ? (
          <div className="px-2.5 py-2 rounded-md bg-slate-500/10 border border-slate-400/20
                          text-[10.5px] text-slate-300 leading-relaxed">
            {summary}
          </div>
        ) : (
          <div className="text-[10px] text-slate-600 italic">
            Điền thông tin ở trên để hiển thị tổng hợp tự động.
          </div>
        )}
      </div>

    </div>
  );
}
