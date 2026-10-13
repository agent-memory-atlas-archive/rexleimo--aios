#!/usr/bin/env node
// video/scripts/render.mjs — 带可见进度的 Remotion 渲染入口。
// 渲染进度同时输出到三处：TTY 单行动态条、非 TTY 的百分比行（便于 agent 采集）、
// 以及 out/render-progress.json（供外部轮询/子代理读取）。
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";

const ROOT = path.resolve(import.meta.dirname, "..");
const ENTRY = path.join(ROOT, "src", "index.ts");
const TIMELINE = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "timeline.json"), "utf8"));

const args = parseArgs(process.argv.slice(2));
const compositionId = args.str("composition", TIMELINE.compositionId);
const outDir = path.join(ROOT, "out");
const outputFile = path.resolve(ROOT, args.str("output", "out/aios-promo.mp4"));
const progressFile = path.join(outDir, "render-progress.json");
const cores = os.cpus().length;
const concurrency = Number(args.str("concurrency", String(Math.max(2, Math.min(cores - 2, 10)))));
const browserExecutable = args.str("browser", process.env.REMOTION_BROWSER_EXECUTABLE || "");
const still = args.flag("still");

// --scene <id> 只渲染该场景的帧区间，用于子代理并行产出分段素材
const framesFlag = (() => {
  const scene = args.str("scene", "");
  if (!scene) return undefined;
  const found = sceneRange(scene);
  if (!found) {
    fail(`未知场景 id: ${scene}。可选：${TIMELINE.scenes.map((s) => s.id).join(", ")}`);
  }
  return [found.from, found.to - 1];
})();

function parseArgs(argv) {
  const map = new Map();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      map.set(key, true);
    } else {
      map.set(key, next);
      i++;
    }
  }
  return {
    flag: (k) => map.get(k) === true,
    str: (k, d) => (typeof map.get(k) === "string" ? map.get(k) : d),
  };
}

function sceneRange(id) {
  let from = 0;
  for (const scene of TIMELINE.scenes) {
    if (scene.id === id) return { ...scene, from, to: from + scene.frames };
    from += scene.frames;
  }
  return null;
}

function totalFor(flagFrames) {
  if (!flagFrames) return TIMELINE.scenes.reduce((a, s) => a + s.frames, 0);
  return flagFrames[1] - flagFrames[0] + 1;
}

function sceneForGlobalFrame(globalFrame) {
  let from = 0;
  for (const scene of TIMELINE.scenes) {
    const to = from + scene.frames;
    if (globalFrame >= from && globalFrame < to) return { ...scene, from, to };
    from = to;
  }
  return null;
}

const started = Date.now();
let lastSceneLabel = null;
let lastJsonWrite = 0;
let lastPrintedPercent = -1;

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.dirname(outputFile), { recursive: true });

const isTty = process.stdout.isTTY;
const bar = (pct) => {
  const cells = 34;
  const filled = Math.round((pct / 100) * cells);
  return "█".repeat(filled) + "░".repeat(Math.max(0, cells - filled));
};

function writeProgress(state) {
  const now = Date.now();
  if (state.final || now - lastJsonWrite > 350) {
    lastJsonWrite = now;
    fs.writeFileSync(progressFile, JSON.stringify({ ...state, updatedAt: new Date(now).toISOString() }, null, 2));
  }
}

function reportProgress(phase, { pct, renderedFrames, totalFrames, etaSec, stitchStage }) {
  // renderedFrames 是已完成帧数（1-based 计数），最后一帧的下标要减一，否则刚好越过场景边界会误报下一场
  const globalFrame = Math.min(
    (framesFlag ? framesFlag[0] : 0) + Math.max(0, renderedFrames - 1),
    totalFor(null) - 1
  );
  const scene = sceneForGlobalFrame(globalFrame);
  const sceneText = scene ? `${scene.id}` : "-";
  if (scene && lastSceneLabel !== null && scene.id !== lastSceneLabel && phase === "render") {
    process.stdout.write(`\n  ✔ 上一场完成 → 进入 ${scene.id} · ${scene.label}\n`);
  }
  if (scene) lastSceneLabel = scene.id;

  const sizeMb = fs.existsSync(outputFile) ? (fs.statSync(outputFile).size / 1048576).toFixed(1) : "0.0";
  const line = `${bar(pct)} ${String(pct).padStart(5)}%  frame ${String(renderedFrames).padStart(4)}/${totalFrames}  ${sceneText.padEnd(8)} ${stitchStage.padEnd(6)} ${sizeMb}MB  eta ${fmtSec(etaSec)}`;

  if (isTty) {
    process.stdout.write(`\r  ${line}`);
  } else if (pct - lastPrintedPercent >= 2.5 || pct >= 100) {
    lastPrintedPercent = pct;
    process.stdout.write(`  ${line}\n`);
  }

  writeProgress({
    phase,
    percent: pct,
    renderedFrames,
    totalFrames,
    currentScene: sceneText,
    currentSceneLabel: scene ? scene.label : null,
    etaSeconds: Math.round(etaSec),
    elapsedSeconds: Math.round((Date.now() - started) / 1000),
    outputMb: Number(sizeMb),
    stitchStage,
    compositionId,
    outputFile,
    concurrency,
  });
}

function fmtSec(s) {
  if (!Number.isFinite(s) || s < 0) return "--:--";
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

const header = [
  "AIOS promo render",
  `composition : ${compositionId}`,
  `resolution  : ${TIMELINE.width}x${TIMELINE.height} @ ${TIMELINE.fps}fps`,
  `frames      : ${framesFlag ? `${framesFlag[0]}-${framesFlag[1]} (${totalFor(framesFlag)} 帧)` : `0-${totalFor(null) - 1} (${totalFor(null)} 帧)`}`,
  `concurrency : ${concurrency} / ${cores} cores`,
  `browser     : ${browserExecutable || "remotion headless shell (auto)"}`,
  `output      : ${path.relative(process.cwd(), outputFile) || outputFile}`,
];
console.log(`\n${"─".repeat(78)}`);
for (const line of header) console.log(`  ${line}`);
console.log(`${"─".repeat(78)}\n`);

// remotion 各回调的进度标度不统一（bundle 给 0-100，renderMedia 给 0-1），在边界处归一。
const toPercent = (v) => Math.min(100, Math.max(0, Math.round((v > 1 ? v : v * 100) * 10) / 10));

let bundlePct = -1;
console.log("  [1/3] bundling webpack entry …");
const serveUrl = await bundle({
  entryPoint: ENTRY,
  onProgress: (p) => {
    const pct = Math.round(toPercent(p));
    if (pct !== bundlePct && pct % 10 === 0) {
      bundlePct = pct;
      process.stdout.write(`\r     bundle ${String(pct).padStart(3)}%`);
    }
  },
});
process.stdout.write("\n");

const composition = await selectComposition({
  serveUrl,
  id: compositionId,
  browserExecutable: browserExecutable || null,
});

if (composition.id !== compositionId) fail(`selectComposition 未找到 ${compositionId}`);

if (still) {
  // --frame 接受逗号分隔列表：一次 bundle 出多张校验帧，避免每帧重新打包。
  const frames = args.str("frame", "60").split(",").map((f) => Number(f.trim())).filter(Number.isFinite);
  console.log(`  [2/3] rendering ${frames.length} still(s): ${frames.join(", ")} …`);
  for (const frame of frames) {
    const out = path.resolve(ROOT, `out/still-${String(frame).padStart(4, "0")}.png`);
    await renderStill({
      serveUrl,
      composition,
      frame,
      output: out,
      browserExecutable: browserExecutable || null,
      imageFormat: "png",
    });
    console.log(`  ✔ frame ${frame} → ${path.relative(process.cwd(), out)}`);
  }
  writeProgress({ phase: "still-done", final: true, percent: 100, frames, stillOutputs: frames.map((f) => `out/still-${String(f).padStart(4, "0")}.png`) });
  process.exit(0);
}

console.log("  [2/3] rendering video …\n");
let renderStart = 0;
try {
  await renderMedia({
    serveUrl,
    composition,
    outputLocation: outputFile,
    codec: "h264",
    concurrency,
    frameRange: framesFlag ?? null,
    browserExecutable: browserExecutable || null,
    chromiumOptions: { headless: true, gl: "swangle" },
    onStart: ({ frameCount, resolvedConcurrency }) => {
      renderStart = Date.now();
      console.log(
        `\n  ▶ render started · ${frameCount} frames · ${(frameCount / composition.fps).toFixed(2)}s of video · concurrency ${resolvedConcurrency}\n`,
      );
    },
    onProgress: (p) => {
      const total = totalFor(framesFlag);
      const rendered = p.renderedFrames ?? 0;
      const pct = toPercent(p.progress ?? 0);
      // 用真实渲染速率算 ETA，避免把 bundle 耗时算进剩余时间
      const elapsed = Math.max(1, ((renderStart ? Date.now() - renderStart : 1000) / 1000));
      const fps = rendered / elapsed;
      const etaSec = fps > 0 ? (total - rendered) / fps : -1;
      reportProgress("render", {
        pct,
        renderedFrames: rendered,
        totalFrames: total,
        etaSec,
        stitchStage: p.stitchStage ?? "render",
      });
    },
  });
} catch (err) {
  const hint =
    /Failed to launch|browser|chromium|Headless/i.test(String(err?.message)) && !browserExecutable
      ? "\n  提示：传 --browser \"C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe\" 用本机 Chrome 渲染。"
      : "";
  fail(`${err?.message ?? err}${hint}`);
}

process.stdout.write("\n");
console.log("  [3/3] done");
const secs = (Date.now() - started) / 1000;
const size = fs.statSync(outputFile).size;
console.log(`  ✔ ${path.relative(process.cwd(), outputFile)}  ${(size / 1048576).toFixed(1)}MB  用时 ${fmtSec(secs)}`);
console.log(`  进度文件：${path.relative(process.cwd(), progressFile)}\n`);
writeProgress({ phase: "done", final: true, percent: 100, renderedFrames: totalFor(framesFlag), totalFrames: totalFor(framesFlag), outputFile, secondsElapsed: Math.round(secs), outputMb: Number((size / 1048576).toFixed(1)) });
