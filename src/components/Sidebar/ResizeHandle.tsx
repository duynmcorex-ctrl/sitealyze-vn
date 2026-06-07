/**
 * ResizeHandle.tsx
 * Thanh kéo cạnh trái Sidebar → drag để thay đổi width.
 *
 * - Persist width vào localStorage ("sitealyze.sidebar.width")
 * - Min 280px (đủ hiện nội dung), Max 720px (~50% screen)
 * - Double-click → reset về width mặc định 320px
 */

import { useCallback, useEffect, useState } from 'react';
import { GripVertical } from 'lucide-react';

const KEY        = 'sitealyze.sidebar.width';
const MIN_WIDTH  = 280;
const MAX_WIDTH  = 720;
const DEFAULT    = 320;

export function getStoredSidebarWidth(): number {
  try {
    const v = parseInt(localStorage.getItem(KEY) ?? '');
    if (Number.isFinite(v) && v >= MIN_WIDTH && v <= MAX_WIDTH) return v;
  } catch { /* ignore */ }
  return DEFAULT;
}

interface Props {
  width: number;
  onChange: (w: number) => void;
}

export function ResizeHandle({ width, onChange }: Props) {
  const [dragging, setDragging] = useState(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent) => {
      // Sidebar nằm bên phải → width = (window width - mouseX)
      const newW = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - e.clientX));
      onChange(newW);
    };
    const onUp = () => {
      setDragging(false);
      // Persist khi thả chuột
      try {
        localStorage.setItem(KEY, String(width));
      } catch { /* ignore */ }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging, onChange, width]);

  const onDoubleClick = () => {
    onChange(DEFAULT);
    try { localStorage.setItem(KEY, String(DEFAULT)); } catch { /* ignore */ }
  };

  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      title="Kéo để thay đổi rộng sidebar — double-click để reset"
      className={`group absolute left-0 top-0 bottom-0 w-3 z-50 cursor-ew-resize
                  flex items-center justify-center
                  ${dragging ? 'bg-accent-teal/40' : 'hover:bg-accent-teal/20'} transition`}
    >
      <GripVertical
        size={12}
        className={`text-slate-600 group-hover:text-accent-teal transition
                    ${dragging ? 'text-accent-teal' : ''}`}
      />
    </div>
  );
}
