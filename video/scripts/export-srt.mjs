/**
 * 从 `src/timeline.json` 导出 SRT 配音稿：`npm run srt` → `out/aios-promo.srt`。
 *
 * 字幕文案即旁白脚本，唯一真源仍是 timeline.json——本文件不产文案，只做时间码换算。
 * 用法：剪映「导入字幕」读入该 SRT，全选文本轨后「文本朗读」即可生成与画面同步的配音轨。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { toSrtEntries, toSrtText, narrationSeconds } from "./narration.mjs";

const root = path.resolve(import.meta.dirname, "..");
const timeline = JSON.parse(readFileSync(path.join(root, "src", "timeline.json"), "utf8"));
const entries = toSrtEntries(timeline);
const outDir = path.join(root, "out");
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "aios-promo.srt");

writeFileSync(outFile, `${toSrtText(entries)}\n`, "utf8");

const spoken = timeline.scenes.reduce((sum, s) => sum + narrationSeconds(s.captions), 0);
const totalFrames = timeline.scenes.reduce((sum, s) => sum + s.frames, 0);
console.log(`✔ ${path.relative(root, outFile)}  ${entries.length} 条`);
console.log(`  朗读合计 ${spoken.toFixed(2)}s / 片长 ${(totalFrames / timeline.fps).toFixed(2)}s`);
console.log(`  余量 ${(totalFrames / timeline.fps - spoken).toFixed(2)}s（剪映里按实际音色微调）`);
