import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { Rail } from "./components/terminal";
import { CrashScene } from "./scenes/crash";
import { CtaScene } from "./scenes/cta";
import { HookScene } from "./scenes/hook";
import { ProofScene } from "./scenes/proof";
import { ResumeScene } from "./scenes/resume";
import { RouteScene } from "./scenes/route";
import { TeamScene } from "./scenes/team";
import { WorkScene } from "./scenes/work";
import { SCENES, TOTAL_FRAMES, type SceneDescriptor, type SceneProps } from "./timeline";
import { color, font, layout, size } from "./theme";

// 场景注册表：顺序必须与 src/timeline.json 完全一致，测试会守住这条不变量。
const SCENE_BY_ID: Record<string, React.FC<SceneProps>> = {
  hook: HookScene,
  crash: CrashScene,
  resume: ResumeScene,
  route: RouteScene,
  work: WorkScene,
  team: TeamScene,
  proof: ProofScene,
  cta: CtaScene,
};

// 每个场景在自己的 Sequence 边界里读本地帧，避免在主时间线上 map() 里调用 hook。
// 字幕脚本由这里从 timeline.json 下发，场景文件不自带台词，避免两处台词漂移。
const SceneHost: React.FC<{ scene: SceneDescriptor }> = ({ scene }) => {
  const Comp = SCENE_BY_ID[scene.id];
  const localFrame = useCurrentFrame();
  return (
    <Comp
      localFrame={localFrame}
      durationInFrames={scene.frames}
      captions={scene.captions}
    />
  );
};

const Chrome: React.FC = () => (
  <div
    style={{
      position: "absolute",
      top: layout.chromeTop,
      left: layout.padX,
      display: "flex",
      alignItems: "center",
      gap: 16,
    }}
  >
    <div
      style={{
        width: 18,
        height: 18,
        borderRadius: 18,
        background: color.cyan,
        boxShadow: `0 0 24px ${color.cyan}`,
      }}
    />
    <div style={{ fontFamily: font.mono, fontSize: size.micro, letterSpacing: 6, color: color.textDim }}>AIOS</div>
  </div>
);

export const PromoVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const markers = (() => {
    let cursor = 0;
    return SCENES.map((scene) => {
      const at = cursor / TOTAL_FRAMES;
      cursor += scene.frames;
      return { label: scene.id, at };
    });
  })();

  return (
    <AbsoluteFill style={{ background: color.bg }}>
      {SCENES.map((scene) => (
        <Sequence key={scene.id} from={scene.from} durationInFrames={scene.frames} name={scene.id}>
          <SceneHost scene={scene} />
        </Sequence>
      ))}
      <Chrome />
      <Rail progress={frame / (TOTAL_FRAMES - 1)} markers={markers} />
    </AbsoluteFill>
  );
};
