// Cross-country performance profile (docs/PERF.md). Needs the backend on :8000 and `npm run build && npx vite preview --port 4173`.
// Usage: node scripts/profile.mjs [screenshot-dir]   (LAYER_OFF=1 scrubs with the heatmap off)
import { chromium } from "@playwright/test";
(async () => {
  const b = await chromium.launch({ headless: false, args: ["--window-size=1440,960"] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const sizes = {};
  p.on("response", async (r) => {
    const u = r.url();
    if (u.includes("/api/plan") || u.includes("/api/heatmap")) {
      try { sizes[u.includes("plan") ? "plan_bytes" : "heatmap_bytes"] = (await r.body()).length; } catch {}
    }
  });
  const consoleErrors = []; p.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 160)));
  await p.goto("http://localhost:4173/");
  await p.evaluate(() => localStorage.setItem("units", "imperial"));
  await p.reload();
  await p.getByLabel("Origin").fill("Seattle, WA");
  await p.getByLabel("Destination").fill("Miami, FL");
  const dep = new Date(Date.now() + 2 * 3600_000);
  const pad = (n) => String(n).padStart(2, "0");
  await p.getByLabel("Departure").fill(`${dep.getFullYear()}-${pad(dep.getMonth() + 1)}-${pad(dep.getDate())}T${pad(dep.getHours())}:00`);
  await p.getByLabel(/Cargo weight/).fill("32000");
  const t0 = Date.now();
  await p.getByRole("button", { name: "Plan routes" }).click();
  await p.getByRole("heading", { name: /routes? · |No safe route/ }).waitFor({ timeout: 180000 });
  const planS = (Date.now() - t0) / 1000;
  await p.getByRole("heading", { name: /along corridor/ }).waitFor({ timeout: 240000 });
  const heatS = (Date.now() - t0) / 1000;
  await p.waitForTimeout(3000);
  const cps = await p.evaluate(() => document.body.innerText.match(/(\d+) checkpoints/)?.[1] ?? null);

  // Frame recorder: rAF intervals while an interaction runs.
  const record = async (fn) => {
    await p.evaluate(() => { window.__f = []; let last = performance.now(); window.__on = true; const tick = (t) => { window.__f.push(t - last); last = t; if (window.__on) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    await fn();
    const f = await p.evaluate(() => { window.__on = false; return window.__f.slice(1); });
    f.sort((a, b) => a - b);
    const avg = f.reduce((s, x) => s + x, 0) / f.length;
    return { frames: f.length, avg_fps: +(1000 / avg).toFixed(1), p95_ms: +f[Math.floor(f.length * 0.95)].toFixed(1), max_ms: +f[f.length - 1].toFixed(1), over_50ms: f.filter((x) => x > 50).length };
  };
  if (process.env.LAYER_OFF) { await p.getByRole("radio", { name: "Off" }).click(); await p.waitForTimeout(1000); }
  const thumb = await p.getByRole("slider", { name: "Forecast hour" }).boundingBox();
  const track = await p.locator("[data-orientation=horizontal]").first().boundingBox();
  const scrub = await record(async () => {
    await p.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
    await p.mouse.down();
    for (let i = 0; i <= 120; i++) { await p.mouse.move(track.x + (track.width * i) / 120, thumb.y + thumb.height / 2); await p.waitForTimeout(16); }
    for (let i = 120; i >= 0; i--) { await p.mouse.move(track.x + (track.width * i) / 120, thumb.y + thumb.height / 2); await p.waitForTimeout(16); }
    await p.mouse.up();
  });
  const pan = await record(async () => {
    await p.mouse.move(900, 450);
    await p.mouse.down();
    for (let i = 0; i < 90; i++) { await p.mouse.move(900 + Math.sin(i / 10) * 250, 450 + Math.cos(i / 14) * 150); await p.waitForTimeout(16); }
    await p.mouse.up();
  });
  const gpu = await p.evaluate(() => { const gl = document.createElement("canvas").getContext("webgl2"); const e = gl.getExtension("WEBGL_debug_renderer_info"); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "unknown"; });
  await p.screenshot({ path: (process.argv[2] ?? ".") + "/perf-seattle-miami.png" });

  console.log(JSON.stringify({ consoleErrors, gpu, plan_s: planS, heatmap_s: heatS, ...sizes, scrub, pan }, null, 1));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
