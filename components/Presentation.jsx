"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { slides, sectors } from "../lib/slides";
import { samplePath, waypoints } from "../lib/path";

const N = slides.length;
const AUTO_MS = 9000;

export default function Presentation() {
  const canvasRef = useRef(null);
  const hudRef = useRef(null);
  const barRef = useRef(null);
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  const [loadedMB, setLoadedMB] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [auto, setAuto] = useState(false);
  const activeRef = useRef(0);

  const goTo = useCallback((i) => {
    const k = Math.max(0, Math.min(N - 1, i));
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: max * (k / (N - 1)), behavior: "smooth" });
  }, []);

  // ───────── 3D сцена ─────────
  useEffect(() => {
    const canvas = canvasRef.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    } catch (e) { setError("Не удалось запустить WebGL. Попробуйте другой браузер."); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping; // текстуры скана уже содержат освещение

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02030a);
    scene.fog = new THREE.FogExp2(0x03050c, 0.028);
    const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.02, 300);

    // Звёзды — видны сквозь «дыры» скана
    {
      const n = 1800, a = new Float32Array(n * 3), c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 120, s = Math.sqrt(1 - u * u);
        a.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th)], i * 3);
        const w = 0.55 + Math.random() * 0.45, tint = Math.random();
        c.set([w * (0.8 + 0.2 * tint), w * 0.9, w], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(a, 3));
      g.setAttribute("color", new THREE.BufferAttribute(c, 3));
      scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false })));
    }

    // Пылинки в невесомости вдоль маршрута
    const DN = 520, dust = new Float32Array(DN * 3), dseed = new Float32Array(DN * 3);
    for (let i = 0; i < DN; i++) {
      const p = samplePath(Math.random());
      dust.set([p.pos[0] + (Math.random() - 0.5) * 2.6, p.pos[1] + (Math.random() - 0.5) * 2.2, p.pos[2] + (Math.random() - 0.5) * 1.5], i * 3);
      dseed.set([Math.random() * 6.28, Math.random() * 6.28, 0.15 + Math.random() * 0.35], i * 3);
    }
    const dustBase = dust.slice();
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dust, 3));
    const dustMat = new THREE.PointsMaterial({ color: 0xcfe8ff, size: 0.022, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false });
    scene.add(new THREE.Points(dustGeo, dustMat));

    // ───── управление ─────
    let target = 0, cur = 0, raf, disposed = false;
    let mx = 0, my = 0, smx = 0, smy = 0;
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      target = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      const a = Math.min(N - 1, Math.round(target * (N - 1)));
      if (a !== activeRef.current) { activeRef.current = a; setActive(a); }
    };
    const onMove = (e) => {
      mx = (e.clientX / window.innerWidth) * 2 - 1;
      my = (e.clientY / window.innerHeight) * 2 - 1;
      document.documentElement.style.setProperty("--mx", mx.toFixed(3));
      document.documentElement.style.setProperty("--my", my.toFixed(3));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMove, { passive: true });
    onScroll();

    // ───── модель ─────
    const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const mtlLoader = new MTLLoader();
    mtlLoader.setPath("/model/");
    mtlLoader.load("spaceship.mtl", (mtls) => {
      mtls.preload();
      const objLoader = new OBJLoader();
      objLoader.setPath("/model/");
      objLoader.setMaterials(mtls);
      objLoader.load("spaceship.obj", (obj) => {
        if (disposed) return;
        obj.traverse((o) => {
          if (!o.isMesh) return;
          const old = Array.isArray(o.material) ? o.material : [o.material];
          const mats = old.map((m) => {
            const nm = new THREE.MeshBasicMaterial({ map: m.map || null, side: THREE.DoubleSide, color: 0xffffff });
            if (nm.map) { nm.map.colorSpace = THREE.SRGBColorSpace; nm.map.anisotropy = maxAniso; }
            return nm;
          });
          o.material = Array.isArray(o.material) ? mats : mats[0];
          if (o.geometry.attributes.color) o.geometry.deleteAttribute("color");
        });
        scene.add(obj);
        setReady(true);
      }, (e) => {
        if (e.lengthComputable && e.total) setProgress(e.loaded / e.total);
        setLoadedMB(e.loaded / 1048576);
      }, () => setError("Не удалось загрузить 3D модель (public/model)."));
    }, undefined, () => setError("Не удалось загрузить материалы модели."));

    // ───── цикл ─────
    const clock = new THREE.Clock();
    const fwd = new THREE.Vector3();
    let lastFov = 0, lastHud = "";
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05), time = clock.elapsedTime;
      const diff = target - cur;
      cur += diff * (1 - Math.exp(-dt * 2.6));
      smx += (mx - smx) * (1 - Math.exp(-dt * 4));
      smy += (my - smy) * (1 - Math.exp(-dt * 4));

      const s = samplePath(cur);
      // лёгкое «дыхание» камеры в невесомости
      camera.position.set(
        s.pos[0] + Math.sin(time * 0.55) * 0.025,
        s.pos[1] + Math.sin(time * 0.43 + 1.3) * 0.02,
        s.pos[2]
      );
      camera.up.set(0, 1, 0);
      camera.lookAt(s.look[0], s.look[1], s.look[2]);
      camera.rotateY(-smx * 0.07);                       // параллакс мышью
      camera.rotateX(-smy * 0.045);
      camera.rotateZ((s.roll + Math.sin(time * 0.37) * 0.7) * Math.PI / 180); // крен

      // «варп»: при перелёте между слайдами поле зрения расширяется
      const fov = s.fov + Math.min(Math.abs(diff) * 160, 16);
      if (Math.abs(fov - lastFov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); lastFov = fov; }

      // пыль дрейфует
      const pa = dustGeo.attributes.position.array;
      for (let i = 0; i < DN; i++) {
        const k = i * 3, sp = dseed[k + 2];
        pa[k] = dustBase[k] + Math.sin(time * sp + dseed[k]) * 0.18;
        pa[k + 1] = dustBase[k + 1] + Math.cos(time * sp * 0.8 + dseed[k + 1]) * 0.15;
        pa[k + 2] = dustBase[k + 2] + Math.sin(time * sp * 0.6 + dseed[k]) * 0.12;
      }
      dustGeo.attributes.position.needsUpdate = true;

      // HUD и полоса прогресса — напрямую в DOM (без перерисовки React)
      if (barRef.current) barRef.current.style.transform = `scaleX(${cur.toFixed(4)})`;
      if (hudRef.current) {
        camera.getWorldDirection(fwd);
        const txt = `X ${s.pos[0].toFixed(2).padStart(6)}  Y ${s.pos[1].toFixed(2).padStart(5)}  Z ${s.pos[2].toFixed(2).padStart(6)}  ·  ГЛУБИНА ${(Math.abs(s.pos[2] - waypoints[0].pos[2])).toFixed(1)} м`;
        if (txt !== lastHud) { hudRef.current.textContent = txt; lastHud = txt; }
      }
      renderer.render(scene, camera);
    };
    tick();

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      onScroll();
    };
    window.addEventListener("resize", onResize);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
    };
  }, []);

  // ───── клавиатура ─────
  useEffect(() => {
    const onKey = (e) => {
      const cur = activeRef.current;
      if (["ArrowDown", "ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); goTo(cur + 1); setAuto(false); }
      else if (["ArrowUp", "ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); goTo(cur - 1); setAuto(false); }
      else if (e.key === "Home") { e.preventDefault(); goTo(0); }
      else if (e.key === "End") { e.preventDefault(); goTo(N - 1); }
      else if (e.key === "a" || e.key === "A" || e.key === "ф" || e.key === "Ф") setAuto((v) => !v);
      else if (e.key === "f" || e.key === "F" || e.key === "а" || e.key === "А") toggleFs();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo]);

  // ───── автопоказ ─────
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => {
      if (activeRef.current >= N - 1) { setAuto(false); return; }
      goTo(activeRef.current + 1);
    }, AUTO_MS);
    return () => clearInterval(id);
  }, [auto, goTo]);

  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  };

  const pct = Math.round(progress * 100);
  return (
    <>
      <canvas ref={canvasRef} className="bg" />
      <div className="vignette" />
      <div className="scan" />
      <div className="topbar"><i ref={barRef} /></div>

      <div className={"loader" + (ready || error ? " done" : "")}>
        <div className="ring" />
        <div className="ltxt">ЗАГРУЗКА МОДУЛЯ…</div>
        <div className="bar">{progress > 0 ? <i style={{ width: pct + "%" }} /> : <i className="indet" />}</div>
        <div className="lsub">{progress > 0 ? pct + "%" : loadedMB.toFixed(1) + " МБ"}</div>
      </div>
      {error && <div className="err">{error}</div>}

      <div className="hud">
        <div className="hud-title">ИКТ · ОРБИТАЛЬНЫЙ МОДУЛЬ</div>
        <div className="hud-sector">СЕКТОР {String(active + 1).padStart(2, "0")} — {sectors[active]}</div>
        <div className="hud-xyz" ref={hudRef} />
      </div>

      <div className="dots">
        {slides.map((_, i) => <button key={i} className={i === active ? "on" : ""} onClick={() => { goTo(i); setAuto(false); }} aria-label={"Слайд " + (i + 1)} />)}
      </div>

      <div className="ctrl">
        <button onClick={() => goTo(active - 1)} aria-label="Назад" title="Назад (←)">‹</button>
        <button className={auto ? "on" : ""} onClick={() => setAuto((v) => !v)} title="Автопоказ (A)">{auto ? "❚❚ Авто" : "▶ Авто"}</button>
        <button onClick={toggleFs} title="Во весь экран (F)">⛶</button>
        <button onClick={() => { goTo(active + 1); setAuto(false); }} aria-label="Вперёд" title="Вперёд (→)">›</button>
      </div>

      <div className="hint" style={{ opacity: active === 0 && ready ? 1 : 0 }}>ЛИСТАЙТЕ ВНИЗ · ← → · A — автопоказ · F — экран<span>↓</span></div>

      <main>
        {slides.map((s, i) => {
          const side = s.type === "title" ? "center" : i % 2 ? "left" : "right";
          return (
            <section key={i} className={`slide ${side}${i === active ? " active" : ""}`}>
              <div className={"ghost " + (side === "left" ? "gr" : "gl")}>{String(i + 1).padStart(2, "0")}</div>
              <div className={"card" + (s.cols || s.type === "title" ? " wide" : "")}>
                <div className="num">{String(i + 1).padStart(2, "0")} / {String(N).padStart(2, "0")}</div>
                {s.type === "title" ? (
                  <>
                    {s.badge && <div className="badge"><b />{s.badge}</div>}
                    <h1>{s.title}</h1><p className="sub">{s.sub}</p>
                  </>
                ) : (
                  <>
                    <h2>{s.title}</h2>
                    {s.items && <ul>{s.items.map((t, k) => <li key={k} style={{ "--i": k }}>{t}</li>)}</ul>}
                    {s.cols && <div className="cols">{s.cols.map((c, k) => (
                      <div key={k} className={k ? "bad" : ""}><h3>{c.head}</h3><ul>{c.items.map((t, j) => <li key={j} style={{ "--i": j + k }}>{t}</li>)}</ul></div>
                    ))}</div>}
                    {s.fact && <div className="fact" style={{ "--i": (s.items ? s.items.length : 4) + 1 }}><span>{s.factLabel || "ФАКТ"}</span>{s.fact}</div>}
                  </>
                )}
              </div>
            </section>
          );
        })}
      </main>
    </>
  );
}
