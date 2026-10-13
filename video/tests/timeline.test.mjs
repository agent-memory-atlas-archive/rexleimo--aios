// 时间线不变量测试：竖版画幅、快切节奏、字幕覆盖与场景文件一一对应。
// 这是渲染前的机械门禁，不是靠人眼检查分镜表。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");
const timeline = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "timeline.json"), "utf8"));

const TOTAL_FRAMES = 900;
const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
// 竖版短视频节奏：单场不超过 5 秒，否则滑走；不少于 3 秒，否则来不及读完字幕。
const MIN_SCENE_SECONDS = 3;
const MAX_SCENE_SECONDS = 5;
// 字幕必须一行放下（折行会在中文里留下孤字）。阈值与 src/theme.ts 对齐：
// caption 52 + letterSpacing 1，盒子 920 - 左右内边距 68 = 852px 可用。
const CAPTION_PX = 53;
const CAPTION_BOX_PX = 852;

/** 全角按 1 em、半角按 0.55 em、空格按 0.3 em 估算渲染宽度。 */
function captionEmWidth(text) {
  let em = 0;
  for (const ch of text) {
    if (ch === " ") em += 0.3;
    else if (ch.codePointAt(0) > 0x2e80) em += 1;
    else em += 0.55;
  }
  return em;
}

test(`画幅为 ${WIDTH}x${HEIGHT} 竖版 @${FPS}fps`, () => {
  assert.equal(timeline.width, WIDTH);
  assert.equal(timeline.height, HEIGHT);
  assert.equal(timeline.fps, FPS);
  assert.ok(timeline.height > timeline.width, "竖版必须是高画面");
});

test(`宣传片总时长恰好 ${(TOTAL_FRAMES / FPS).toFixed(1)} 秒`, () => {
  const frames = timeline.scenes.reduce((sum, s) => sum + s.frames, 0);
  assert.equal(frames, TOTAL_FRAMES, `期望 ${TOTAL_FRAMES} 帧，实际 ${frames}`);
  assert.equal(frames / timeline.fps, TOTAL_FRAMES / FPS);
});

test("场景帧区间连续、无重叠、无空洞", () => {
  let cursor = 0;
  for (const scene of timeline.scenes) {
    assert.ok(scene.frames > 0, `${scene.id} 帧数必须为正`);
    cursor += scene.frames;
  }
  assert.equal(cursor, TOTAL_FRAMES);
});

test(`每场时长在 ${MIN_SCENE_SECONDS}~${MAX_SCENE_SECONDS} 秒之间（快切节奏）`, () => {
  for (const scene of timeline.scenes) {
    const seconds = scene.frames / timeline.fps;
    assert.ok(
      seconds >= MIN_SCENE_SECONDS && seconds <= MAX_SCENE_SECONDS,
      `${scene.id} 时长 ${seconds.toFixed(2)}s 超出 ${MIN_SCENE_SECONDS}~${MAX_SCENE_SECONDS}s`,
    );
  }
});

test("场景 id 唯一", () => {
  const ids = timeline.scenes.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, `重复的场景 id: ${ids.join(",")}`);
});

test("每个场景 id 都有对应的场景文件", () => {
  for (const scene of timeline.scenes) {
    const file = path.join(ROOT, "src", "scenes", `${scene.id}.tsx`);
    assert.ok(fs.existsSync(file), `缺少场景文件 ${path.relative(ROOT, file)}`);
  }
});

test("场景注册表与 json 顺序一致", () => {
  const source = fs.readFileSync(path.join(ROOT, "src", "PromoVideo.tsx"), "utf8");
  const listed = [...source.matchAll(/^\s{2}([a-z]+): ([A-Z][A-Za-z]+Scene),$/gm)].map((m) => m[1]);
  assert.deepEqual(listed, timeline.scenes.map((s) => s.id), "PromoVideo.tsx 的注册顺序必须与 timeline.json 一致");
});

test("字幕铺满每一场：从第 0 帧无缝接到散场，不留空白", () => {
  for (const scene of timeline.scenes) {
    assert.ok(scene.captions.length >= 1, `${scene.id} 没有字幕`);
    assert.equal(scene.captions[0].from, 0, `${scene.id} 字幕没从第 0 帧开始`);
    let cursor = 0;
    for (const cue of scene.captions) {
      assert.equal(cue.from, cursor, `${scene.id} 字幕在 ${cursor} 帧处留空或重叠`);
      assert.ok(cue.to > cue.from, `${scene.id} 字幕区间无效: ${cue.text}`);
      cursor = cue.to;
    }
    assert.equal(cursor, scene.frames, `${scene.id} 字幕没铺到散场（停在 ${cursor}/${scene.frames}）`);
  }
});

test("每条字幕一行放得下", () => {
  for (const scene of timeline.scenes) {
    for (const cue of scene.captions) {
      const px = Math.round(captionEmWidth(cue.text) * CAPTION_PX);
      assert.ok(px <= CAPTION_BOX_PX, `${scene.id} 字幕会折行(${px}px > ${CAPTION_BOX_PX}px): ${cue.text}`);
    }
  }
});

test("台词只有一份真源：场景文件不得自带字幕数组", () => {
  for (const scene of timeline.scenes) {
    const source = fs.readFileSync(path.join(ROOT, "src", "scenes", `${scene.id}.tsx`), "utf8");
    assert.ok(!/cues=\{\[/.test(source), `${scene.id}.tsx 内联了字幕数组，会和 timeline.json 漂移`);
    assert.match(source, /<Captions cues=\{captions\} \/>/, `${scene.id}.tsx 必须使用主线程下发的 captions`);
  }
});
