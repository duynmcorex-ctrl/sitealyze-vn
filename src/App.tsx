import { Canvas3D } from './components/Scene/Canvas3D';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar/Sidebar';
import { Legend } from './components/Legend/Legend';
import { Compass } from './components/Scene/Compass';
import { ReportPanel, ReportTrigger } from './components/Report/ReportPanel';
import { ViewButtons } from './components/Scene/ViewButtons';
import { useSiteStore } from './store/useSiteStore';

export default function App() {
  const loading = useSiteStore((s) => s.loading);
  const error = useSiteStore((s) => s.error);
  const terrain = useSiteStore((s) => s.terrain);

  return (
    <div className="h-full w-full flex flex-col bg-bg-base text-slate-100">
      <Header />
      <div className="flex-1 flex relative overflow-hidden">
        <main className="flex-1 relative">
          <Canvas3D />
          {!terrain && !loading && <DropHint />}
          {loading && <LoadingOverlay />}
          {error && <ErrorBanner message={error} />}
          <Legend />
          <Compass />
          <ViewButtons />
          <ReportPanel />
          <ReportTrigger />
        </main>
        <Sidebar />
      </div>
    </div>
  );
}

function DropHint() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="text-center px-8 py-6 panel rounded-xl">
        <div className="text-2xl font-bold mb-2 text-accent-teal">SiteAlyze VN</div>
        <div className="text-slate-400 text-sm">
          Tải file <span className="text-accent-teal font-mono">.dxf</span> bản đồ địa hình
          ở thanh công cụ bên phải để bắt đầu phân tích
        </div>
      </div>
    </div>
  );
}

function LoadingOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-bg-base/70 backdrop-blur-sm">
      <div className="px-6 py-4 panel rounded-lg flex items-center gap-3">
        <div className="w-3 h-3 rounded-full bg-accent-teal animate-pulse" />
        <span className="text-slate-200">Đang phân tích địa hình…</span>
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  const setError = useSiteStore((s) => s.setError);
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 panel rounded-lg px-4 py-3 max-w-md border-red-500/40">
      <div className="flex items-start gap-3">
        <span className="text-red-400 font-semibold">Lỗi:</span>
        <span className="text-slate-200 text-sm flex-1">{message}</span>
        <button onClick={() => setError(null)} className="text-slate-400 hover:text-white">×</button>
      </div>
    </div>
  );
}
