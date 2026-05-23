/**
 * persistPanels.ts
 * localStorage helper cho CollapsiblePanel — lưu trạng thái mở/đóng của từng panel.
 *
 * Format: localStorage["sitealyze.panels.open"] = JSON.stringify({ projects: true, evaluation: false, ... })
 */

const KEY = 'sitealyze.panels.open';

/** Đọc toàn bộ map trạng thái panel từ localStorage */
function readMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch {
    return {};
  }
}

/** Ghi map state */
function writeMap(map: Record<string, boolean>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch { /* quota / private mode — ignore */ }
}

/** Lấy trạng thái mở của 1 panel; fallback về `defaultOpen` nếu chưa lưu */
export function getPanelOpen(id: string, defaultOpen: boolean): boolean {
  const map = readMap();
  return id in map ? !!map[id] : defaultOpen;
}

/** Lưu trạng thái mở/đóng của 1 panel */
export function setPanelOpen(id: string, open: boolean): void {
  const map = readMap();
  map[id] = open;
  writeMap(map);
}
