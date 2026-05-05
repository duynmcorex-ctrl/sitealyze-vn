/**
 * markdown.ts
 * Serialize Report → Markdown string.
 */
import type { Report, ReportSection, ReportMetric } from '../types';

export function reportToMarkdown(report: Report): string {
  const { terrain: t, generatedAt, sections } = report;
  const dateStr = new Date(generatedAt).toLocaleString('vi-VN');

  const lines: string[] = [
    `# BÁO CÁO PHÂN TÍCH ĐỊA HÌNH`,
    ``,
    `> Sinh tự động bởi **SiteAlyze VN** — ${dateStr}`,
    ``,
    `## Thông tin địa hình`,
    ``,
    `| Thông số | Giá trị |`,
    `|----------|---------|`,
    `| Cao độ   | ${t.minZ.toFixed(1)} – ${t.maxZ.toFixed(1)} m |`,
    `| Diện tích | ${formatArea(t.areaHa)} |`,
    `| Kích thước lưới | ${t.cellSize} m/cell (${t.width} × ${t.height}) |`,
    ``,
    `---`,
    ``,
  ];

  sections.forEach((sec) => {
    lines.push(`## ${sec.title}`);
    lines.push(``);
    if (sec.empty) {
      lines.push(`> ⚠️ ${sec.emptyMessage ?? 'Chưa có dữ liệu'}`);
    } else {
      lines.push(sec.summary);
      lines.push(``);
      if (sec.metrics.length > 0) {
        lines.push(`| Chỉ số | Giá trị |`);
        lines.push(`|--------|---------|`);
        sec.metrics.forEach((m: ReportMetric) => {
          const badge = m.emphasis === 'good' ? ' ✅' : m.emphasis === 'warn' ? ' ⚠️' : m.emphasis === 'bad' ? ' ❌' : '';
          lines.push(`| ${m.label} | ${m.value}${badge} |`);
        });
        lines.push(``);
      }
      if (sec.notes.length > 0) {
        sec.notes.forEach((n) => lines.push(`- ${n}`));
        lines.push(``);
      }
      if (sec.recommendations && sec.recommendations.length > 0) {
        lines.push(`### Khuyến nghị`);
        lines.push(``);
        sec.recommendations.forEach((r) => lines.push(`- ${r}`));
        lines.push(``);
      }
    }
    lines.push(`---`);
    lines.push(``);
  });

  lines.push(`*Báo cáo được tạo tự động bởi SiteAlyze VN. Vui lòng kiểm tra lại với số liệu khảo sát thực địa trước khi sử dụng chính thức.*`);

  return lines.join('\n');
}

function formatArea(ha: number): string {
  if (ha < 0.1) return `${(ha * 10_000).toFixed(0)} m²`;
  return `${ha.toFixed(2)} ha`;
}
