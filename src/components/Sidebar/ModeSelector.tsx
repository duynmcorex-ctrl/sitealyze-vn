import { useSiteStore } from '../../store/useSiteStore';
import type { AnalysisMode } from '../../lib/types';

const MODES: { id: AnalysisMode; label: string }[] = [
  { id: 'elevation', label: 'Cao độ' },
  { id: 'slope', label: 'Độ dốc' },
  { id: 'sun', label: 'Nắng' },
  { id: 'wind', label: 'Gió' },
  { id: 'hydrology', label: 'Thủy văn' },
  { id: 'contour', label: 'Đồng mức' },
  { id: 'features', label: 'Đặc trưng' },
  { id: 'suitability', label: 'Đất XD' },
  { id: 'viewshed', label: 'Tầm nhìn' },
  { id: 'roads', label: 'Giao thông' },
];

export function ModeSelector() {
  const mode = useSiteStore((s) => s.mode);
  const setMode = useSiteStore((s) => s.setMode);
  return (
    <div className="grid grid-cols-2 gap-2">
      {MODES.map((m) => (
        <button
          key={m.id}
          className={`btn-mode ${mode === m.id ? 'active' : ''}`}
          onClick={() => setMode(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
