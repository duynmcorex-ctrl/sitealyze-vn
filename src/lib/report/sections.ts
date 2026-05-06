import type { Heightmap, ReportSection, EnvParams } from '../types';
import type { SlopeData, SlopeClassMode } from '../analysis/slope';
import type { HydrologyData } from '../analysis/hydrology';
import type { TerrainFeatures } from '../analysis/features';
import type { SuitabilityData } from '../analysis/suitability';
import type { ContourLineSegment } from '../analysis/contours';
import { getSlopeClasses, SUITABILITY_CLASSES_REF as SUIT_CLASSES_FALLBACK } from './_classRefs';
import { computeSunPosition } from '../analysis/sun';
import {
  histogramAspect, histogramSlopeClass, terrainArea, terrainBboxSize,
  extremeZRegionDirection, accumulationHotspots, fmtArea, fmtMeters, fmtPct,
  DIR_NAMES_VI,
} from './stats';
import { detectTerrainShape } from './shape';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Cao độ
// ─────────────────────────────────────────────────────────────────────────────

export function buildElevationSection(
  hm: Heightmap,
  features: TerrainFeatures | undefined,
  slope: SlopeData | undefined,
  aspectHist: ReturnType<typeof histogramAspect> | undefined,
): ReportSection {
  const min = hm.minZ, max = hm.maxZ;
  const diff = max - min;
  const area = terrainArea(hm);
  const bbox = terrainBboxSize(hm);
  const slopeIntensity = diff / Math.sqrt(area * 10_000); // m chênh / m ngang trung bình

  const top = extremeZRegionDirection(hm, 'top', 0.15);
  const bot = extremeZRegionDirection(hm, 'bottom', 0.15);

  let shapeLine = '';
  if (features && slope && aspectHist) {
    const shape = detectTerrainShape(hm, features, slope, aspectHist);
    shapeLine = shape.description;
  }

  const intensityLabel =
    slopeIntensity > 0.10 ? 'rất dốc'
    : slopeIntensity > 0.05 ? 'dốc'
    : slopeIntensity > 0.02 ? 'trung bình'
    : 'thoải';

  return {
    id: 'elevation',
    title: '1. Cao độ địa hình',
    icon: '⛰️',
    summary: `Khu vực có cao độ ${fmtMeters(min, 1)} – ${fmtMeters(max, 1)}, chênh cao ${fmtMeters(diff, 1)} trên diện tích ${fmtArea(area)}.`,
    metrics: [
      { label: 'Thấp nhất',  value: fmtMeters(min, 1) },
      { label: 'Cao nhất',   value: fmtMeters(max, 1) },
      { label: 'Chênh cao',  value: fmtMeters(diff, 1) },
      { label: 'Diện tích',  value: fmtArea(area) },
      { label: 'Kích thước', value: `${bbox.w.toFixed(0)} × ${bbox.h.toFixed(0)} m` },
      { label: 'Mật độ chênh cao', value: `${(slopeIntensity * 100).toFixed(1)} m/100m`,
        emphasis: slopeIntensity > 0.05 ? 'warn' : 'good' },
    ],
    notes: [
      shapeLine || 'Phân tích dạng địa hình cần thêm dữ liệu đặc trưng.',
      `Vùng cao tập trung phía ${DIR_NAMES_VI[top.dir]} (${top.pct.toFixed(0)}% top 15% diện tích).`,
      `Vùng thấp tập trung phía ${DIR_NAMES_VI[bot.dir]} (${bot.pct.toFixed(0)}% bottom 15% diện tích).`,
      `Đặc tính chênh cao ${intensityLabel} (${(slopeIntensity * 100).toFixed(1)} m / 100 m ngang).`,
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Độ dốc
// ─────────────────────────────────────────────────────────────────────────────

export function buildSlopeSection(
  hm: Heightmap,
  slope: SlopeData | undefined,
  slopeMode: SlopeClassMode,
): ReportSection {
  if (!slope) {
    return emptySection('slope', '2. Độ dốc', 'Chưa có dữ liệu độ dốc.');
  }
  const classes = getSlopeClasses(slopeMode);
  const hist = histogramSlopeClass(slope.classes, hm.mask, classes.length);
  const totalArea = terrainArea(hm);

  // Tìm class chiếm ưu thế
  let domIdx = 0;
  for (let i = 1; i < hist.pct.length; i++) {
    if (hist.pct[i] > hist.pct[domIdx]) domIdx = i;
  }

  // Tính avg slope
  let sum = 0, n = 0;
  for (let i = 0; i < slope.slopeDeg.length; i++) {
    if (hm.mask && !hm.mask[i]) continue;
    sum += slope.slopeDeg[i]; n++;
  }
  const avgDeg = n > 0 ? sum / n : 0;

  // Build bullet cho từng class với % và diện tích
  const classBullets = classes.map((c, i) => {
    const a = (hist.pct[i] / 100) * totalArea;
    const tag = i === domIdx ? ' (chủ đạo)' : '';
    return `${c.label}: ${fmtPct(hist.pct[i], 1)} (${fmtArea(a)})${tag}`;
  });

  // Đánh giá tổng hợp
  const flatPct = hist.pct[0];
  const buildablePct = hist.pct[0] + (hist.pct[1] || 0); // 2 class đầu
  let assessment = '';
  if (flatPct > 60) {
    assessment = 'Khu vực chủ yếu bằng phẳng, thuận lợi xây dựng đại trà.';
  } else if (buildablePct > 40) {
    assessment = 'Có quỹ đất xây dựng đáng kể, cần phân khu hợp lý theo độ dốc.';
  } else if (buildablePct > 20) {
    assessment = 'Quỹ đất xây dựng hạn chế, ưu tiên kiến trúc theo địa hình (nhà sàn, giật cấp).';
  } else {
    assessment = 'Địa hình dốc, không phù hợp xây dựng quy mô lớn. Cần giải pháp đặc thù: tường chắn, san giật cấp.';
  }

  const recommendations: string[] = [];
  if (slopeMode === 'degree' && hist.pct[hist.pct.length - 1] > 5) {
    recommendations.push('Khu vực >45° (nguy hiểm) chiếm đáng kể — cần khảo sát địa chất kiểm tra rủi ro sạt trượt.');
  }
  if (slopeMode === 'percent' && hist.pct[3] > 50) {
    recommendations.push('Hơn 50% diện tích >30% — theo QCVN cần thẩm định nền đất, ổn định mái taluy.');
  }
  if (buildablePct < 20) {
    recommendations.push('Khuyến nghị giữ phần lớn diện tích làm cây xanh / cảnh quan, chỉ xây trên các "thềm" hợp lý.');
  }

  return {
    id: 'slope',
    title: `2. Độ dốc (${slopeMode === 'percent' ? 'theo %' : 'theo °'})`,
    icon: '📐',
    summary: `${classes[domIdx].label} chiếm ${fmtPct(hist.pct[domIdx])} diện tích — ${assessment}`,
    metrics: [
      { label: 'Độ dốc trung bình', value: `${avgDeg.toFixed(1)}°` },
      { label: 'Diện tích phẳng', value: fmtPct(flatPct), emphasis: flatPct > 30 ? 'good' : 'warn' },
      { label: 'Đất xây dựng được (≤2 lớp đầu)', value: fmtPct(buildablePct), emphasis: buildablePct > 40 ? 'good' : 'bad' },
    ],
    notes: classBullets,
    recommendations: recommendations.length ? recommendations : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Đường đồng mức
// ─────────────────────────────────────────────────────────────────────────────

export function buildContourSection(
  hm: Heightmap,
  contours: ContourLineSegment[] | undefined,
  interval: number,
): ReportSection {
  if (!contours) {
    return emptySection('contour', '3. Đường đồng mức', 'Chưa tính đường đồng mức.');
  }
  const totalLength = contours.reduce((s, seg) =>
    s + seg.paths.reduce((sl, p) => sl + p.length, 0), 0);
  const totalSegments = contours.length;
  const area = terrainArea(hm);
  const lineDensity = (totalLength * hm.cellSize) / Math.max(0.001, area * 10_000); // m line / m² area

  const elevations = contours.map((c) => c.elevation).sort((a, b) => a - b);
  const minE = elevations[0] ?? hm.minZ;
  const maxE = elevations[elevations.length - 1] ?? hm.maxZ;

  const densityLabel =
    lineDensity > 0.4 ? 'dày'
    : lineDensity > 0.2 ? 'trung bình'
    : 'thưa';

  return {
    id: 'contour',
    title: '3. Đường đồng mức',
    icon: '🗺️',
    summary: `Có ${totalSegments} mức cao độ, khoảng đều ${interval} m. Mật độ đường ${densityLabel} thể hiện địa hình ${densityLabel === 'dày' ? 'dốc' : densityLabel === 'trung bình' ? 'trung bình' : 'thoải'}.`,
    metrics: [
      { label: 'Khoảng đều', value: `${interval} m` },
      { label: 'Số đường', value: `${totalSegments}` },
      { label: 'Cao độ thấp/cao nhất', value: `${minE.toFixed(0)} / ${maxE.toFixed(0)} m` },
      { label: 'Mật độ', value: densityLabel },
    ],
    notes: [
      `Đường đồng mức bao quát từ ${minE.toFixed(0)} m đến ${maxE.toFixed(0)} m.`,
      `Mật độ đường: nơi đường gần nhau = sườn dốc, đường thưa = vùng phẳng.`,
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Đặc trưng địa hình
// ─────────────────────────────────────────────────────────────────────────────

export function buildFeaturesSection(
  hm: Heightmap,
  features: TerrainFeatures | undefined,
): ReportSection {
  if (!features) {
    return emptySection('features', '4. Đặc trưng địa hình', 'Chưa tính đặc trưng địa hình.');
  }
  const area = terrainArea(hm);
  const ridgeCount = features.ridges.reduce((s, v) => s + (v ? 1 : 0), 0);
  const valleyCount = features.valleys.reduce((s, v) => s + (v ? 1 : 0), 0);
  const total = hm.data.length;
  const ridgePct = (ridgeCount / total) * 100;
  const valleyPct = (valleyCount / total) * 100;

  // Đỉnh cao nhất
  const sortedPeaks = [...features.peaks].sort((a, b) => b.y - a.y);
  const highest = sortedPeaks[0];
  // Đáy thấp nhất
  const sortedPits = [...features.pits].sort((a, b) => a.y - b.y);
  const lowest = sortedPits[0];

  const notes: string[] = [
    `Tổng ${features.peaks.length} đỉnh núi và ${features.pits.length} đáy thung lũng được phát hiện.`,
    `Sống núi (vùng lồi) chiếm ${fmtPct(ridgePct)} diện tích.`,
    `Đường tụ thủy (vùng lõm) chiếm ${fmtPct(valleyPct)} diện tích.`,
  ];
  if (highest) notes.push(`Đỉnh cao nhất ở cao độ ${fmtMeters(highest.y, 1)}.`);
  if (lowest)  notes.push(`Đáy thấp nhất ở cao độ ${fmtMeters(lowest.y, 1)}.`);

  const peakDensity = features.peaks.length / Math.max(0.1, area);
  let summary = '';
  if (features.peaks.length === 0 && features.pits.length === 0) {
    summary = 'Địa hình đồng đều, không có đỉnh/đáy nổi bật.';
  } else if (peakDensity > 2) {
    summary = `Mật độ đỉnh cao (${peakDensity.toFixed(1)} đỉnh/ha) — địa hình phức tạp, nhiều mỏm núi nhỏ.`;
  } else if (features.peaks.length > features.pits.length * 2) {
    summary = 'Địa hình ưu thế lồi (nhiều đỉnh hơn đáy) — phù hợp dạng mai rùa hoặc đỉnh núi.';
  } else if (features.pits.length > features.peaks.length * 2) {
    summary = 'Địa hình ưu thế lõm (nhiều đáy hơn đỉnh) — có khả năng tích tụ nước nhiều điểm.';
  } else {
    summary = `Địa hình cân bằng giữa lồi và lõm: ${features.peaks.length} đỉnh / ${features.pits.length} đáy.`;
  }

  return {
    id: 'features',
    title: '4. Đặc trưng địa hình',
    icon: '🏔️',
    summary,
    metrics: [
      { label: 'Số đỉnh núi', value: `${features.peaks.length}` },
      { label: 'Số đáy thung lũng', value: `${features.pits.length}` },
      { label: 'Sống núi', value: fmtPct(ridgePct) },
      { label: 'Đường tụ thủy', value: fmtPct(valleyPct) },
    ],
    notes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Thủy văn
// ─────────────────────────────────────────────────────────────────────────────

export function buildHydrologySection(
  hm: Heightmap,
  hydro: HydrologyData | undefined,
): ReportSection {
  if (!hydro) {
    return emptySection('hydrology', '5. Thủy văn', 'Chưa phân tích thủy văn.');
  }
  const hotspots = accumulationHotspots(hydro, hm, 3);
  // Tỉ lệ vùng tích tụ cao (top 10% accum)
  const validAccum: number[] = [];
  for (let i = 0; i < hydro.flowAccum.length; i++) {
    if (hm.mask && !hm.mask[i]) continue;
    validAccum.push(hydro.flowAccum[i]);
  }
  validAccum.sort((a, b) => b - a);
  const top10Threshold = validAccum[Math.floor(validAccum.length * 0.1)] ?? 0;
  const topAccumCount = validAccum.filter((v) => v >= top10Threshold).length;
  const topAccumPct = (topAccumCount / validAccum.length) * 100;

  // Hướng dòng chảy chủ đạo
  const dirCounts = new Array(8).fill(0);
  for (let i = 0; i < hydro.flowDir.length; i++) {
    if (hm.mask && !hm.mask[i]) continue;
    const d = hydro.flowDir[i];
    if (d >= 0 && d < 8) dirCounts[d]++;
  }
  const D8_NAMES_VI = ['Đông', 'Đông Bắc', 'Bắc', 'Tây Bắc', 'Tây', 'Tây Nam', 'Nam', 'Đông Nam'];
  let domD = 0;
  for (let i = 1; i < 8; i++) if (dirCounts[i] > dirCounts[domD]) domD = i;

  const hotspotLines = hotspots.length > 0
    ? hotspots.map((h, i) => {
        const dirVi = DIR_NAMES_VI[h.dirFromCenter];
        return `Vùng tích tụ #${i + 1}: hướng ${dirVi} so với trung tâm, accumulation ≈ ${h.accum.toFixed(0)} cell.`;
      })
    : ['Không có vùng tích tụ nước rõ rệt.'];

  let drainageAssessment: string;
  if (hotspots.length === 0 || hotspots[0]?.accum < 50) {
    drainageAssessment = 'Thoát nước phân tán đều, không có rủi ro tích tụ tập trung.';
  } else if (hotspots[0]?.accum > 500) {
    drainageAssessment = 'Có dòng chảy chính tập trung mạnh — cần giải pháp thoát nước chuyên biệt (mương, hồ điều hoà).';
  } else {
    drainageAssessment = 'Có một số mạch tụ thủy nhỏ, cần lưu ý khi quy hoạch hạ tầng thoát nước.';
  }

  return {
    id: 'hydrology',
    title: '5. Thủy văn',
    icon: '💧',
    summary: `Hướng thoát nước chủ đạo về phía ${D8_NAMES_VI[domD]}. ${drainageAssessment}`,
    metrics: [
      { label: 'Vùng tích tụ chính', value: `${hotspots.length}` },
      { label: 'Diện tích tích tụ cao (top 10%)', value: fmtPct(topAccumPct) },
      { label: 'Hướng chảy chính', value: D8_NAMES_VI[domD] },
    ],
    notes: hotspotLines,
    recommendations: hotspots[0]?.accum > 200 ? [
      'Tại các vùng tích tụ chính: thiết kế mương thu, hồ điều hoà hoặc bãi thấm.',
      'Tránh xây dựng nhà ở/công trình quan trọng trên đường tụ thủy chính.',
    ] : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Đất xây dựng (suitability)
// ─────────────────────────────────────────────────────────────────────────────

export function buildSuitabilitySection(
  hm: Heightmap,
  suit: SuitabilityData | undefined,
): ReportSection {
  if (!suit) {
    return emptySection('suitability', '6. Đất xây dựng', 'Chưa đánh giá đất xây dựng.');
  }
  const classes = SUIT_CLASSES_FALLBACK;
  const counts = new Array(classes.length).fill(0);
  let total = 0, sum = 0;
  for (let i = 0; i < suit.classes.length; i++) {
    if (hm.mask && !hm.mask[i]) continue;
    counts[suit.classes[i]]++;
    total++;
    sum += suit.score[i];
  }
  const avgScore = total > 0 ? sum / total : 0;
  const totalArea = terrainArea(hm);
  const pct = counts.map((c) => total > 0 ? (c / total) * 100 : 0);

  const goodPct = pct[0] + pct[1]; // Rất phù hợp + Phù hợp
  const badPct = pct[3];

  const bullets = classes.map((c, i) => {
    const a = (pct[i] / 100) * totalArea;
    return `${c.label}: ${fmtPct(pct[i])} (${fmtArea(a)})`;
  });

  let summary: string;
  if (goodPct > 50) {
    summary = `${fmtPct(goodPct)} diện tích phù hợp xây dựng — quỹ đất tốt cho phát triển.`;
  } else if (goodPct > 20) {
    summary = `${fmtPct(goodPct)} diện tích phù hợp xây dựng — cần lựa chọn vị trí kỹ.`;
  } else {
    summary = `Chỉ ${fmtPct(goodPct)} phù hợp xây dựng — quỹ đất hạn chế, ưu tiên cảnh quan.`;
  }

  const recommendations: string[] = [];
  if (badPct > 40) {
    recommendations.push(`${fmtPct(badPct)} không phù hợp xây dựng — nên giữ làm rừng/cây xanh tự nhiên.`);
  }
  if (goodPct > 30) {
    recommendations.push('Tập trung công trình tại các vùng "Rất phù hợp" và "Phù hợp" để tối ưu chi phí xây dựng.');
  }

  return {
    id: 'suitability',
    title: '6. Đất xây dựng',
    icon: '🏗️',
    summary,
    metrics: [
      { label: 'Điểm trung bình', value: `${avgScore.toFixed(0)}/100`,
        emphasis: avgScore > 60 ? 'good' : avgScore > 40 ? 'warn' : 'bad' },
      { label: 'Đất phù hợp+',   value: fmtPct(goodPct), emphasis: goodPct > 40 ? 'good' : 'warn' },
      { label: 'Không phù hợp',  value: fmtPct(badPct),  emphasis: badPct > 40 ? 'bad' : 'good' },
    ],
    notes: bullets,
    recommendations: recommendations.length ? recommendations : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Nắng & bóng đổ
// ─────────────────────────────────────────────────────────────────────────────

export function buildSunSection(
  hm: Heightmap,
  env: EnvParams,
  aspectHist: ReturnType<typeof histogramAspect> | undefined,
): ReportSection {
  const sun = computeSunPosition(env.month, env.hour, env.latitude, 105, env.northRotation);
  const altDeg = sun.altitude * 180 / Math.PI;
  const azDeg = (sun.azimuth * 180 / Math.PI + 360) % 360;

  // Tỉ lệ đón nắng theo aspect (Đông/ĐN/Nam/TN/Tây gọi là sườn đón nắng)
  let sunnyPct = 0, shadyPct = 0;
  if (aspectHist) {
    sunnyPct = aspectHist.pct.E + aspectHist.pct.SE + aspectHist.pct.S + aspectHist.pct.SW + aspectHist.pct.W;
    shadyPct = aspectHist.pct.N + aspectHist.pct.NE + aspectHist.pct.NW;
  }

  let timeOfDay: string;
  if (altDeg <= 0) timeOfDay = 'mặt trời đã lặn';
  else if (altDeg < 15) timeOfDay = 'nắng yếu (sáng sớm hoặc chiều muộn)';
  else if (altDeg < 45) timeOfDay = 'nắng vừa';
  else timeOfDay = 'nắng mạnh (gần đỉnh)';

  let solarPotential: string;
  if (sunnyPct > 60) solarPotential = 'Rất tốt — phần lớn sườn đón nắng.';
  else if (sunnyPct > 40) solarPotential = 'Tốt — đủ sườn đón nắng cho công trình.';
  else if (sunnyPct > 20) solarPotential = 'Trung bình — cần chọn vị trí cẩn thận để tối đa nắng.';
  else solarPotential = 'Hạn chế — phần lớn địa hình khuất nắng, nên thiết kế phòng cần ánh sáng phía Đông/Nam.';

  const azName = aspectName(azDeg);

  return {
    id: 'sun',
    title: '7. Nắng & bóng đổ',
    icon: '☀️',
    summary: `Tháng ${env.month}, ${env.hour}h, vĩ độ ${env.latitude}°N: mặt trời ở ${altDeg.toFixed(0)}° hướng ${azName}. ${solarPotential}`,
    metrics: [
      { label: 'Góc cao mặt trời', value: `${altDeg.toFixed(0)}°` },
      { label: 'Hướng mặt trời',   value: azName },
      { label: 'Tình trạng',       value: timeOfDay },
      { label: 'Sườn đón nắng (E/SE/S/SW/W)', value: fmtPct(sunnyPct), emphasis: sunnyPct > 40 ? 'good' : 'warn' },
      { label: 'Sườn khuất nắng (N/NE/NW)',   value: fmtPct(shadyPct), emphasis: shadyPct > 50 ? 'bad' : 'good' },
    ],
    notes: [
      `Vĩ độ ${env.latitude}°N — đặc trưng vùng ${env.latitude > 18 ? 'Bắc Trung Bộ trở ra' : 'Nam Trung Bộ trở vào'}.`,
      `Trong ngày ${dayPhrase(env.month)}, vị trí mặt trời thay đổi từ Đông Nam (sáng) qua Nam (trưa) sang Tây Nam (chiều).`,
      sunnyPct > 0
        ? `${fmtPct(sunnyPct)} diện tích sườn phơi về Đông/Nam/Tây — nhận nắng tốt.`
        : 'Phần lớn địa hình ít nghiêng nên không có sườn phơi rõ rệt.',
    ],
    recommendations: shadyPct > 50 ? [
      'Tránh đặt công trình ở (hoặc tăng kích thước cửa sổ) ở các sườn Bắc.',
      'Cân nhắc các giải pháp lấy sáng gián tiếp cho các khu khuất nắng.',
    ] : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Gió
// ─────────────────────────────────────────────────────────────────────────────

export function buildWindSection(
  env: EnvParams,
  aspectHist: ReturnType<typeof histogramAspect> | undefined,
): ReportSection {
  // Hướng gió user nhập (env.windDirection: 0=Bắc, theo chiều kim đồng hồ)
  const windDirVi = aspectName(env.windDirection);
  // "Sườn đón gió" = aspect đối hướng với chiều gió đến (gió thổi về phía A => sườn phơi A đón gió thực ra là phía đối...)
  // Trong app: windDirection = hướng gió ĐẾN từ. Gió từ NE thổi về SW. Sườn đón gió = sườn phơi NE.
  const windFromDir = aspectName(env.windDirection);
  const oppositeDir = aspectName((env.windDirection + 180) % 360);

  // % sườn đón gió (cùng hướng với gió đến)
  let exposedPct = 0, shelteredPct = 0;
  if (aspectHist) {
    const winDirKey = degToDirKey(env.windDirection);
    const oppDirKey = degToDirKey((env.windDirection + 180) % 360);
    exposedPct = aspectHist.pct[winDirKey] + aspectHist.pct[neighborKey(winDirKey, +1)] + aspectHist.pct[neighborKey(winDirKey, -1)];
    shelteredPct = aspectHist.pct[oppDirKey] + aspectHist.pct[neighborKey(oppDirKey, +1)] + aspectHist.pct[neighborKey(oppDirKey, -1)];
  }

  let exposureLevel: string;
  if (exposedPct > 50) exposureLevel = 'cao — gió mạnh có thể tác động trực diện';
  else if (exposedPct > 25) exposureLevel = 'trung bình — một số sườn đón gió';
  else exposureLevel = 'thấp — đa số khuất gió hoặc địa hình phẳng';

  return {
    id: 'wind',
    title: '8. Gió',
    icon: '💨',
    summary: `Hướng gió ${windFromDir} (${env.windDirection}°). Mức phơi gió: ${exposureLevel}.`,
    metrics: [
      { label: 'Hướng gió',     value: `${windFromDir} (${env.windDirection}°)` },
      { label: 'Sườn đón gió',  value: fmtPct(exposedPct),
        emphasis: exposedPct > 40 ? 'warn' : 'good' },
      { label: 'Sườn khuất gió',value: fmtPct(shelteredPct), emphasis: 'good' },
    ],
    notes: [
      `Sườn phơi hướng ${windFromDir} đón gió trực diện — gió giật mạnh, nên tránh hệ cửa lớn không bảo vệ.`,
      `Sườn phơi hướng ${oppositeDir} khuất gió — vi khí hậu yên ổn, phù hợp sân vườn, mặt đứng chính của công trình.`,
      `Khu vực miền núi phía Bắc thường có gió Đông Bắc mạnh vào mùa đông và gió Đông Nam mát vào mùa hè.`,
    ],
    recommendations: exposedPct > 40 ? [
      'Bố trí cây xanh/tường chắn gió ở mặt đón gió để giảm tải lực ngang.',
      'Hạn chế cửa sổ lớn trên sườn đón gió hoặc dùng cửa ba lớp/đệm cao su.',
    ] : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Tầm nhìn
// ─────────────────────────────────────────────────────────────────────────────

export function buildViewshedSection(
  hm: Heightmap,
  viewshed: Uint8Array | undefined,
  viewpoint: { x: number; z: number; height: number } | null,
): ReportSection {
  if (!viewshed || !viewpoint) {
    return {
      id: 'viewshed',
      title: '9. Tầm nhìn',
      icon: '👁️',
      summary: 'Chưa có điểm quan sát.',
      metrics: [],
      notes: [
        'Vào chế độ "Tầm nhìn" và bấm chuột lên địa hình để đặt điểm quan sát.',
        'Sau đó báo cáo sẽ phân tích phần trăm địa hình nhìn thấy được, điểm chết và đề xuất vị trí cảnh quan đẹp.',
      ],
      empty: true,
      emptyMessage: 'Chưa đặt điểm quan sát',
    };
  }
  let visible = 0, total = 0;
  for (let i = 0; i < viewshed.length; i++) {
    if (hm.mask && !hm.mask[i]) continue;
    total++;
    if (viewshed[i]) visible++;
  }
  const visiblePct = total > 0 ? (visible / total) * 100 : 0;
  const totalArea = terrainArea(hm);
  const visibleArea = (visiblePct / 100) * totalArea;

  let assessment: string;
  if (visiblePct > 70) assessment = 'Tầm nhìn rất rộng — vị trí lý tưởng cho điểm cảnh quan / quan sát.';
  else if (visiblePct > 40) assessment = 'Tầm nhìn tốt — phần lớn địa hình có thể quan sát.';
  else if (visiblePct > 20) assessment = 'Tầm nhìn trung bình — một phần địa hình bị che.';
  else assessment = 'Tầm nhìn hạn chế — vị trí chỉ phù hợp tạo không gian riêng tư, không có cảnh ngắm rộng.';

  return {
    id: 'viewshed',
    title: '9. Tầm nhìn',
    icon: '👁️',
    summary: `Từ điểm quan sát, ${fmtPct(visiblePct)} địa hình (${fmtArea(visibleArea)}) có thể nhìn thấy. ${assessment}`,
    metrics: [
      { label: 'Tỉ lệ nhìn thấy',  value: fmtPct(visiblePct), emphasis: visiblePct > 50 ? 'good' : 'warn' },
      { label: 'Diện tích nhìn thấy', value: fmtArea(visibleArea) },
      { label: 'Cao điểm quan sát', value: `+${viewpoint.height.toFixed(1)} m so với mặt đất` },
    ],
    notes: [
      assessment,
      'Vùng không nhìn thấy = bóng địa hình (sau núi/đồi). Có thể đặt khu yên tĩnh.',
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Giao thông & Tiếp cận
// ─────────────────────────────────────────────────────────────────────────────

import type { RoadsAnalysis } from '../analysis/roads';

export function buildRoadsSection(roads: RoadsAnalysis | undefined): ReportSection {
  if (!roads || roads.totalLengthM === 0) {
    return {
      id: 'roads',
      title: '10. Giao thông & Tiếp cận',
      icon: '🛣️',
      summary: 'Không phát hiện layer giao thông trong dữ liệu.',
      metrics: [],
      notes: [
        'Để phân tích giao thông, tải file DXF chứa layer có tên GIAOTHONG, GT, DUONG, ROAD... vào mục Lớp dữ liệu.',
        'App sẽ tự nhận diện và phân tích chiều dài, độ dốc dọc, hệ số tiếp cận.',
      ],
      empty: true,
      emptyMessage: 'Chưa có dữ liệu giao thông',
    };
  }

  const { totalLengthM, segments, accessibilityPct } = roads;

  const bullets: string[] = [];
  bullets.push(`Tổng chiều dài hệ thống đường: ${(totalLengthM / 1000).toFixed(2)} km.`);

  // Phân tích độ dốc dọc theo TCVN
  const steepSegments = segments.filter(s => s.maxSlopePct > 8);
  if (steepSegments.length > 0) {
    bullets.push(
      `${steepSegments.length} tuyến có độ dốc dọc max > 8% (giới hạn QCVN 04:2012 cho đường đô thị loại III–IV): ` +
      steepSegments.map(s => `${s.name} (max ${s.maxSlopePct.toFixed(1)}%)`).join(', ') + '.'
    );
  } else {
    bullets.push('Tất cả tuyến đường có độ dốc dọc ≤ 8%, trong giới hạn thiết kế đường đô thị.');
  }

  if (accessibilityPct >= 80) {
    bullets.push(`Hệ số tiếp cận ${accessibilityPct}% — rất tốt, đường bao phủ gần toàn bộ chu vi khu đất.`);
  } else if (accessibilityPct >= 50) {
    bullets.push(`Hệ số tiếp cận ${accessibilityPct}% — đạt yêu cầu; một số cạnh khu đất chưa có đường tiếp cận trực tiếp.`);
  } else {
    bullets.push(`Hệ số tiếp cận thấp (${accessibilityPct}%) — cần bổ sung đường/lối vào trên các cạnh chưa có tiếp cận.`);
  }

  // Phân tích theo QCVN 01:2021/BXD bảng 2.17 — lộ giới (không có trong data, ghi chú hướng dẫn)
  bullets.push('Theo QCVN 01:2021/BXD bảng 2.17: đường trục chính ≥ 24m, đường khu vực ≥ 12m, nội bộ ≥ 6m. Cần kiểm tra lộ giới thiết kế thực tế trên bản vẽ CAD.');

  const metrics = [
    { label: 'Tổng chiều dài', value: `${(totalLengthM / 1000).toFixed(2)} km` },
    { label: 'Số tuyến', value: `${segments.length}` },
    { label: 'Tiếp cận chu vi', value: `${accessibilityPct}%`, emphasis: (accessibilityPct >= 50 ? 'good' : 'warn') as 'good' | 'warn' | 'bad' },
  ];

  // Thêm tuyến có độ dốc max cao nhất
  const maxSlopeSegment = segments.reduce((a, b) => a.maxSlopePct > b.maxSlopePct ? a : b);
  metrics.push({ label: 'Dốc dọc max', value: `${maxSlopeSegment.maxSlopePct.toFixed(1)}%`, emphasis: maxSlopeSegment.maxSlopePct > 8 ? 'warn' : 'good' });

  return {
    id: 'roads',
    title: '10. Giao thông & Tiếp cận',
    icon: '🛣️',
    summary: `Phát hiện ${segments.length} tuyến đường, tổng ${(totalLengthM / 1000).toFixed(2)} km. Hệ số tiếp cận chu vi: ${accessibilityPct}%.`,
    metrics,
    notes: bullets,
    recommendations: steepSegments.length > 0 ? [
      'Kiểm tra và điều chỉnh tuyến có dốc dọc > 8% trước khi lập dự án đầu tư.',
      'Đảm bảo tầm nhìn dừng xe ≥ 40m trên đoạn dốc > 5% (theo TCVN 4054:2005).',
    ] : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function emptySection(id: string, title: string, msg: string): ReportSection {
  return {
    id, title, icon: '⚪',
    summary: msg, metrics: [], notes: [],
    empty: true, emptyMessage: msg,
  };
}

function aspectName(deg: number): string {
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return ['Bắc', 'Đông Bắc', 'Đông', 'Đông Nam', 'Nam', 'Tây Nam', 'Tây', 'Tây Bắc'][idx];
}

function degToDirKey(deg: number): 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' {
  const keys = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return keys[idx];
}

function neighborKey(k: ReturnType<typeof degToDirKey>, offset: number): ReturnType<typeof degToDirKey> {
  const keys = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
  const idx = keys.indexOf(k);
  return keys[((idx + offset) % 8 + 8) % 8];
}

function dayPhrase(month: number): string {
  if (month >= 3 && month <= 5) return 'mùa xuân';
  if (month >= 6 && month <= 8) return 'mùa hè';
  if (month >= 9 && month <= 11) return 'mùa thu';
  return 'mùa đông';
}
