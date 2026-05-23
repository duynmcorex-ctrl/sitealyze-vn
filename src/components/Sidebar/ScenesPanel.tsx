/**
 * ScenesPanel.tsx
 * UI quản lý các Scene đã lưu (camera bookmarks).
 *
 * Mỗi scene = 1 góc camera + thumbnail. Click để tween mượt đến góc đó.
 * Cảnh báo: thumbnail capture cần renderer (gl) — phải chạy bên trong Canvas qua SceneCapturer.
 */

import { useState } from 'react';
import { Camera, Trash2, Edit3, Plus } from 'lucide-react';
import { useSiteStore } from '../../store/useSiteStore';

export function ScenesPanel() {
  const terrain          = useSiteStore(s => s.terrain);
  const scenes           = useSiteStore(s => s.scenes);
  const requestSaveScene = useSiteStore(s => s.requestSaveScene);
  const requestLoadScene = useSiteStore(s => s.requestLoadScene);
  const removeScene      = useSiteStore(s => s.removeScene);
  const renameScene      = useSiteStore(s => s.renameScene);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');

  if (!terrain) {
    return (
      <div className="text-[10.5px] text-slate-500 italic py-1.5">
        Tải file địa hình trước để lưu scene
      </div>
    );
  }

  const startRename = (id: string, current: string) => {
    setRenamingId(id);
    setRenameInput(current);
  };

  const confirmRename = () => {
    if (renamingId && renameInput.trim()) {
      renameScene(renamingId, renameInput.trim());
    }
    setRenamingId(null);
    setRenameInput('');
  };

  return (
    <div className="flex flex-col gap-1.5">
      {/* Nút thêm scene */}
      <button
        onClick={() => requestSaveScene()}
        className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md
                   bg-accent-teal/15 border border-accent-teal/40 text-accent-teal
                   hover:bg-accent-teal/25 transition text-[10.5px] font-bold"
      >
        <Plus size={11} />
        Thêm scene hiện tại
      </button>

      {/* List scenes */}
      {scenes.length === 0 ? (
        <div className="text-[10px] text-slate-500 italic px-1 py-1.5">
          Chưa có scene nào. Xoay camera đến góc đẹp rồi nhấn "Thêm scene hiện tại".
        </div>
      ) : (
        <div className="flex flex-col gap-1 max-h-[280px] overflow-y-auto pr-0.5">
          {scenes.map((sc, i) => (
            <div
              key={sc.id}
              className="group flex items-center gap-1.5 p-1 rounded
                         bg-white/3 border border-white/8 hover:border-accent-teal/40 transition"
            >
              {/* Thumbnail */}
              <button
                onClick={() => requestLoadScene(sc.id)}
                className="shrink-0 w-[60px] h-[40px] rounded overflow-hidden bg-black/40
                           flex items-center justify-center border border-white/10
                           hover:border-accent-teal transition"
                title="Click để di chuyển camera đến scene này"
              >
                {sc.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sc.thumbnail} alt={sc.name} className="w-full h-full object-cover" />
                ) : (
                  <Camera size={14} className="text-slate-500" />
                )}
              </button>

              {/* Name */}
              <div className="flex-1 min-w-0">
                {renamingId === sc.id ? (
                  <input
                    autoFocus
                    value={renameInput}
                    onChange={e => setRenameInput(e.target.value)}
                    onBlur={confirmRename}
                    onKeyDown={e => {
                      if (e.key === 'Enter') confirmRename();
                      if (e.key === 'Escape') { setRenamingId(null); setRenameInput(''); }
                    }}
                    className="w-full px-1 py-0.5 text-[10.5px] bg-bg-dark border border-accent-teal/50 rounded
                               text-slate-100 outline-none"
                  />
                ) : (
                  <button
                    onDoubleClick={() => startRename(sc.id, sc.name)}
                    onClick={() => requestLoadScene(sc.id)}
                    className="text-[10.5px] font-semibold text-slate-200 truncate text-left w-full"
                    title={sc.name + ' (double-click để đổi tên)'}
                  >
                    {sc.name}
                  </button>
                )}
                <div className="text-[8.5px] text-slate-500 font-mono">
                  #{i + 1} · fov {sc.fov.toFixed(0)}°
                </div>
              </div>

              {/* Actions: rename + delete (hover) */}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                <button
                  onClick={() => startRename(sc.id, sc.name)}
                  className="p-0.5 rounded text-slate-500 hover:text-accent-teal transition"
                  title="Đổi tên"
                ><Edit3 size={11} /></button>
                <button
                  onClick={() => {
                    if (confirm(`Xoá scene "${sc.name}"?`)) removeScene(sc.id);
                  }}
                  className="p-0.5 rounded text-slate-500 hover:text-red-400 transition"
                  title="Xoá"
                ><Trash2 size={11} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
