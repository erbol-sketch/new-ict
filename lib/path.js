// Чистая математика камеры (без three.js) — маршрут полёта по модулю.
// Ось модуля (скан наклонён): центр сечения c(z). Все ракурсы взяты вдоль неё,
// поэтому камера никогда не оказывается внутри стен или снаружи модели.
const AXIS = [ // [z, x, y] — центр сечения модуля
  [-1.5, -0.21, -0.10], [-2.0, -0.31, 0.02], [-2.5, -0.35, 0.19], [-3.0, -0.49, 0.41],
  [-3.5, -0.56, 0.67], [-4.0, -0.57, 0.71], [-4.5, -0.33, 0.69], [-5.0, -0.54, 0.96],
  [-5.5, -0.61, 1.09], [-6.0, -0.67, 1.30], [-6.5, -0.76, 1.39], [-7.0, -1.40, 1.41],
  [-7.5, -1.40, 1.47], [-8.0, -1.14, 1.59], [-8.5, -1.00, 1.74], [-9.0, -0.95, 1.82],
  [-9.5, -0.97, 1.86], [-10.0, -1.02, 1.93], [-10.5, -1.09, 1.99], [-11.0, -1.18, 2.06],
  [-11.5, -1.23, 2.11], [-12.0, -1.23, 2.12],
];
export function axisAt(z) {
  for (let i = 0; i < AXIS.length - 1; i++) {
    const a = AXIS[i], b = AXIS[i + 1];
    if (z <= a[0] && z >= b[0]) { const k = (a[0] - z) / (a[0] - b[0]); return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, z]; }
  }
  const e = z > AXIS[0][0] ? AXIS[0] : AXIS[AXIS.length - 1];
  return [e[1], e[2], z];
}
const rotY = (v, deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]]; };
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };

// z — где камера, yaw — поворот влево(+)/вправо(−) от оси, pitch — подъём взгляда,
// roll — крен (невесомость!), fov, look — как далеко смотрим.
function shot(z, yaw = 0, pitch = 0, roll = 0, fov = 74, dist = 3.2, dx = 0, dy = 0) {
  const c = axisAt(z); const pos = [c[0] + dx, c[1] + dy, c[2]];
  const f = norm([axisAt(z - 3)[0] - c[0], axisAt(z - 3)[1] - c[1], -3]);
  const d = rotY(f, yaw); d[1] += Math.tan(pitch * Math.PI / 180) * Math.hypot(d[0], d[2]);
  return { pos, look: [pos[0] + d[0] * dist, pos[1] + d[1] * dist, pos[2] + d[2] * dist], roll, fov };
}

// 10 лучших ракурсов, по одному на слайд
export const waypoints = [
  shot(-1.7, 0, 0, 0, 72),        // 1  люк «TO NOD 2» + флаг, вид вглубь станции
  shot(-3.5, -38, 0, -4, 76),     // 2  боковая стена «TO NOD 2», люк-тоннель справа
  shot(-4.3, 0, 0, 5, 74),        // 3  кольцо люка, заходим в тоннель
  shot(-5.3, 0, 0, -6, 76),       // 4  тоннель с зелёным экраном и боковыми люками
  shot(-6.2, 0, 0, 0, 72),        // 5  симметричный коридор
  shot(-6.6, 22, 0, 7, 74),       // 6  зелёный экран + стойки с кабелями
  shot(-7.5, 0, -2, -5, 72),       // 7  центральный отсек, стойки слева
  shot(-8.6, -18, -2, 6, 74),      // 8  диагональ по правому борту
  shot(-10.0, 0, 0, -3, 70),      // 9  торцевой отсек, сетка и мешки
  shot(-10.8, 4, -3, -3, 62),     // 10 финал: «To PMA2 / DECK» крупно
];

// Catmull-Rom (равномерный) по ключевым точкам: t ∈ [0,1] → кадр камеры
function cr(p0, p1, p2, p3, u) {
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}
export function samplePath(t, wps = waypoints) {
  const n = wps.length, x = Math.min(Math.max(t, 0), 1) * (n - 1);
  const i = Math.min(Math.floor(x), n - 2), u = x - i;
  const g = (k) => wps[Math.min(Math.max(k, 0), n - 1)];
  const w0 = g(i - 1), w1 = g(i), w2 = g(i + 1), w3 = g(i + 2);
  const v3 = (key) => [0, 1, 2].map((a) => cr(w0[key][a], w1[key][a], w2[key][a], w3[key][a], u));
  const s = (key) => cr(w0[key], w1[key], w2[key], w3[key], u);
  return { pos: v3("pos"), look: v3("look"), roll: s("roll"), fov: s("fov") };
}
