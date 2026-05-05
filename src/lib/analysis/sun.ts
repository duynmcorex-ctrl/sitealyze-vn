// Vị trí mặt trời theo NOAA Solar Position Algorithm (đơn giản hoá).
export interface SunPosition {
  altitude: number;  // radian, >0 = trên đường chân trời
  azimuth: number;   // radian, 0 = North, clockwise
  vector: [number, number, number]; // hướng tới mặt trời (Three.js: x East, y Up, z South)
}

export function computeSunPosition(
  month: number,         // 1..12
  hour: number,          // 0..24 (giờ địa phương)
  latitudeDeg: number,
  longitudeDeg = 105,    // VN ~105
  northRotationDeg = 0
): SunPosition {
  // Ngày đại diện: 15 mỗi tháng
  const dayOfYear = approxDayOfYear(month, 15);
  const decl = 23.44 * Math.sin(((360 / 365) * (dayOfYear - 81)) * Math.PI / 180);
  // Equation of time bỏ qua, giờ mặt trời ≈ giờ địa phương khi múi giờ chuẩn
  const hourAngleDeg = (hour - 12) * 15;
  const latRad = latitudeDeg * Math.PI / 180;
  const declRad = decl * Math.PI / 180;
  const haRad = hourAngleDeg * Math.PI / 180;

  const sinAlt = Math.sin(latRad) * Math.sin(declRad) + Math.cos(latRad) * Math.cos(declRad) * Math.cos(haRad);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

  const cosAz = (Math.sin(declRad) - Math.sin(altitude) * Math.sin(latRad)) / (Math.cos(altitude) * Math.cos(latRad));
  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (haRad > 0) azimuth = 2 * Math.PI - azimuth;

  const azWithRot = azimuth + (northRotationDeg * Math.PI / 180);
  // Three.js convention: +X East, +Z South. North is -Z.
  // Azimuth measured clockwise from North.
  const x = Math.sin(azWithRot) * Math.cos(altitude);
  const z = -Math.cos(azWithRot) * Math.cos(altitude);
  const y = Math.sin(altitude);

  return { altitude, azimuth: azWithRot, vector: [x, y, z] };
}

function approxDayOfYear(month: number, day: number): number {
  const daysBefore = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return daysBefore[Math.max(0, Math.min(11, month - 1))] + day;
}
