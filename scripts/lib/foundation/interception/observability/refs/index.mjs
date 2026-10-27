/* 中文注释：Refs 层把原始证据留在本地可召回存储，避免大文本直接进入模型上下文。 */
export { writeRawRef, readRawRef, rawRefsSessionRoot } from './raw-ref-store.mjs';
export { readInterceptionRef, grepInterceptionRefs, listInterceptionRefs, pruneInterceptionRefs } from './recall.mjs';
export { sweepInterceptionRefs, runRefsSweepOnSessionClose } from './sweep.mjs';
export { decideRefRetention, refsSweepPolicy, shouldRunRefsSweep, DEFAULT_REFS_KEEP_DAYS } from './retention.mjs';
