/**
 * ProjectsPanel — quản lý nhiều dự án trong cùng scene 3D.
 *
 * - Liệt kê tất cả project đã tải
 * - Click → switch active project
 * - Eye icon → ẩn/hiện trong scene (background render)
 * - Rename (double-click)
 * - Xoá project
 * - Nút "+" → tạo project mới rỗng, sẵn sàng nhận file upload
 */
import { useState, useRef } from 'react';
import { Eye, EyeOff, Plus, Trash2, FolderOpen, CheckCircle } from 'lucide-react';
import { useSiteStore } from '../../store/useSiteStore';
import type { StoredProject } from '../../store/useSiteStore';

export function ProjectsPanel() {
  const projects        = useSiteStore((s) => s.projects);
  const activeProjectId = useSiteStore((s) => s.activeProjectId);
  const createProject   = useSiteStore((s) => s.createProject);
  const switchProject   = useSiteStore((s) => s.switchProject);
  const removeProject   = useSiteStore((s) => s.removeProject);
  const renameProject   = useSiteStore((s) => s.renameProject);
  const toggleProjectVisible = useSiteStore((s) => s.toggleProjectVisible);

  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  if (projects.length === 0) {
    return (
      <div className="text-[11px] text-slate-500 text-center py-2">
        Chưa có dự án nào. Tải file DXF để bắt đầu.
      </div>
    );
  }

  const startEdit = (p: StoredProject) => {
    setEditingId(p.id);
    setEditingName(p.name);
    setTimeout(() => inputRef.current?.select(), 30);
  };

  const commitEdit = () => {
    if (editingId && editingName.trim()) {
      renameProject(editingId, editingName.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="space-y-1">
      {projects.map((p) => {
        const isActive = p.id === activeProjectId;
        return (
          <div
            key={p.id}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition
              ${isActive
                ? 'bg-accent-teal/15 border border-accent-teal/40'
                : 'bg-bg-card border border-white/8 hover:border-white/20'}`}
            onClick={() => !isActive && switchProject(p.id)}
          >
            {/* Active indicator */}
            {isActive
              ? <CheckCircle size={12} className="text-accent-teal shrink-0" />
              : <FolderOpen   size={12} className="text-slate-500 shrink-0" />
            }

            {/* Project name (double-click to rename) */}
            <div className="flex-1 min-w-0">
              {editingId === p.id ? (
                <input
                  ref={inputRef}
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null); }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full bg-transparent border-b border-accent-teal text-[11px] text-white outline-none"
                />
              ) : (
                <div
                  className={`text-[11px] truncate select-none ${isActive ? 'text-slate-200 font-semibold' : 'text-slate-400'}`}
                  onDoubleClick={(e) => { e.stopPropagation(); startEdit(p); }}
                  title="Double-click để đổi tên"
                >
                  {p.name}
                </div>
              )}
              {p.terrain && (
                <div className="text-[10px] text-slate-600 truncate">
                  {p.terrain.heightmap.width}×{p.terrain.heightmap.height} &nbsp;·&nbsp;
                  ΔZ {(p.terrain.bounds.maxZ - p.terrain.bounds.minZ).toFixed(0)} m
                  {p.geo && <> &nbsp;·&nbsp; {p.geo.province}</>}
                </div>
              )}
            </div>

            {/* Eye toggle (chỉ hữu ích cho background projects) */}
            {!isActive && (
              <button
                onClick={(e) => { e.stopPropagation(); toggleProjectVisible(p.id); }}
                title={p.visible ? 'Ẩn khỏi scene' : 'Hiện trong scene'}
                className="p-0.5 rounded hover:bg-white/10 transition"
              >
                {p.visible
                  ? <Eye    size={12} className="text-accent-teal" />
                  : <EyeOff size={12} className="text-slate-600" />
                }
              </button>
            )}

            {/* Delete */}
            {projects.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Xoá dự án "${p.name}"?`)) removeProject(p.id);
                }}
                title="Xoá dự án"
                className="p-0.5 rounded hover:bg-red-500/20 text-slate-600 hover:text-red-400 transition"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        );
      })}

      {/* New project button */}
      <button
        onClick={() => createProject()}
        className="w-full mt-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md
                   border border-dashed border-white/15 text-[11px] text-slate-500
                   hover:border-accent-teal/40 hover:text-accent-teal transition"
        title="Tạo dự án mới — sau đó kéo file DXF vào"
      >
        <Plus size={12} />
        Thêm dự án
      </button>

      {projects.length > 1 && (
        <div className="text-[10px] text-slate-600 text-center pt-0.5">
          {projects.filter(p => p.id !== activeProjectId && p.visible && p.terrain).length > 0
            ? `${projects.filter(p => p.id !== activeProjectId && p.visible && p.terrain).length} dự án hiển thị nền`
            : 'Bật Eye để so sánh dự án khác trong scene'}
        </div>
      )}
    </div>
  );
}
