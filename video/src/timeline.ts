import timelineData from "./timeline.json";

export type CaptionCue = {
  text: string;
  /** 场景本地帧区间，闭开区 [from, to) */
  from: number;
  to: number;
};

export type SceneDescriptor = {
  id: string;
  label: string;
  frames: number;
  /** 这一场的硬字幕脚本，静音播放时它就是旁白 */
  captions: CaptionCue[];
  /** inclusive first frame of the scene on the master timeline */
  from: number;
  /** exclusive last frame of the scene on the master timeline */
  to: number;
};

/** 场景组件的唯一入参契约：本地帧、本场时长、由主线程下发的字幕脚本。 */
export type SceneProps = {
  localFrame: number;
  durationInFrames: number;
  captions: CaptionCue[];
};

const raw = timelineData as {
  fps: number;
  width: number;
  height: number;
  compositionId: string;
  scenes: { id: string; label: string; frames: number; captions: CaptionCue[] }[];
};

// 累加偏移只在这里算一次，场景文件与渲染脚本共用同一份 json，避免时长两处漂移。
let cursor = 0;
export const SCENES: SceneDescriptor[] = raw.scenes.map((scene) => {
  const from = cursor;
  const to = cursor + scene.frames;
  cursor = to;
  return { ...scene, from, to };
});

export const FPS = raw.fps;export const WIDTH = raw.width;
export const HEIGHT = raw.height;
export const COMPOSITION_ID = raw.compositionId;
export const TOTAL_FRAMES = cursor;
export const DURATION_IN_SECONDS = TOTAL_FRAMES / FPS;
