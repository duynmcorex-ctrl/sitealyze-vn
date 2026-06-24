/**
 * highResCapture.ts
 * Cầu nối giữa component bên trong <Canvas> (có quyền truy cập THREE.WebGLRenderer
 * qua useThree()) và UI bên ngoài Canvas (ExportPanel, ReportSection) muốn chụp ảnh
 * ở độ phân giải cao hơn viewport hiện tại (vd: xuất 4K cho slide).
 *
 * Cách dùng:
 *   - Canvas3D.tsx mount <HighResCaptureBridge /> bên trong <Canvas>, component đó
 *     gán hàm capture thật vào `highResCaptureRef.current`.
 *   - ExportPanel.tsx gọi `highResCaptureRef.current?.(width, height, filename)`.
 */
export type HighResCaptureFn = (width: number, height: number, filename: string) => void;

export const highResCaptureRef: { current: HighResCaptureFn | null } = { current: null };
