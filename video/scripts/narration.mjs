/**
 * 旁白时长估算：字幕文案就是配音脚本，`timeline.json` 仍是唯一真源。
 *
 * 这里只回答一个可机械判定的问题——「这句话放得进这一拍的窗口吗」。
 * 估算不是声学测量：真人 TTS 的语速随音色与标点浮动，所以门禁留了余量，
 * 而最终对齐仍以剪映里实际生成的配音轨长度为准。
 */

/** 中文按字计，英文/数字按实际读出的音节数计，避免把 "AIOS" 读成 4 拍。 */
const LATIN_SYLLABLES = { ai: 2, aios: 3, diff: 1, remotion: 3, chip: 1, json: 1 };

/** 不发音的空白与停顿标点。 */
const SILENT = /[\s，。：；、「」“”·—…？！、,.!?()/]/u;

/** 正常偏快的口播语速（字/秒）。剪映默认音色大致落在这个量级。 */
export const SPEECH_RATE = 4.5;

/** 每条字幕读完需要的换气停顿（秒）。 */
export const CUE_PAUSE_SECONDS = 0.12;

/**
 * 一句文案的口播音节数。
 * @param {string} text
 * @returns {number}
 */
export function syllables(text) {
  let total = 0;
  let i = 0;
  while (i < text.length) {
    const word = /^[A-Za-z]+/.exec(text.slice(i));
    if (word) {
      total += LATIN_SYLLABLES[word[0].toLowerCase()] ?? word[0].length;
      i += word[0].length;
      continue;
    }
    const digits = /^[0-9]+/.exec(text.slice(i));
    if (digits) {
      total += digits[0].length;
      i += digits[0].length;
      continue;
    }
    if (!SILENT.test(text[i])) total += 1;
    i += 1;
  }
  return total;
}

/**
 * 一条字幕朗读所需秒数（含尾部换气）。
 * @param {string} text
 * @returns {number}
 */
export function cueSeconds(text) {
  return syllables(text) / SPEECH_RATE + CUE_PAUSE_SECONDS;
}

/**
 * 一整拍的旁白秒数下限：所有字幕依次读完的总时长。
 * @param {{ text: string }[]} captions
 * @returns {number}
 */
export function narrationSeconds(captions) {
  return captions.reduce((sum, cue) => sum + cueSeconds(cue.text), 0);
}

/**
 * 把时间轴导成 SRT 条目（绝对秒），供剪映「导入字幕 → 文本朗读」使用。
 * @param {{ fps: number, scenes: { frames: number, captions: { from: number, to: number, text: string }[] }[] }} timeline
 */
export function toSrtEntries(timeline) {
  const entries = [];
  let cursor = 0;
  for (const scene of timeline.scenes) {
    for (const cue of scene.captions) {
      entries.push({
        index: entries.length + 1,
        startSeconds: (cursor + cue.from) / timeline.fps,
        endSeconds: (cursor + cue.to) / timeline.fps,
        text: cue.text,
      });
    }
    cursor += scene.frames;
  }
  return entries;
}

/**
 * SRT 时间码：`HH:MM:SS,mmm`。
 * @param {number} seconds
 */
export function srtTimecode(seconds) {
  const ms = Math.round(seconds * 1000);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

/**
 * 渲染成 SRT 文本。
 * @param {ReturnType<typeof toSrtEntries>} entries
 */
export function toSrtText(entries) {
  return entries
    .map((e) => `${e.index}\n${srtTimecode(e.startSeconds)} --> ${srtTimecode(e.endSeconds)}\n${e.text}\n`)
    .join("\n");
}
