import React from "react";
import { interpolate } from "remotion";
import { Stage } from "../components/stage";
import { Captions, Headline, Kicker } from "../components/text";
import { BreakTrack } from "../components/diagram";
import { Chip, Panel } from "../components/panel";
import { color, size } from "../theme";
import type { SceneProps } from "../timeline";

const TRACK_W = 200;
const CARD_W = 596;

/** 03 反转：断掉的不等于丢掉的——检查点让中断变成续跑。 */
export const ResumeScene: React.FC<SceneProps> = ({
  localFrame,
  durationInFrames,
  captions,
}) => {
  const cardsIn = interpolate(localFrame, [30, 56], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Stage localFrame={localFrame} durationInFrames={durationInFrames} glow={color.green} enter="slide">
      <Kicker text="DAY 2 · 08:02" localFrame={localFrame} tone={color.green} />
      <Headline
        text="中断，不是重跑"
        localFrame={localFrame}
        delay={6}
        sizeOverride={size.display}
        accentChars="不是"
      />
      <div style={{ marginTop: 30, display: "flex", gap: 30, alignItems: "flex-start", paddingLeft: 44 }}>
        <BreakTrack
          localFrame={localFrame}
          height={660}
          thickness={18}
          containerWidth={TRACK_W}
          runTo={0.78}
          breaks={[{ at: 0.78, label: "断" }]}
          checkpoints={[0.34, 0.62]}
          resumeFrom={0.62}
          resumedLabel="显式续跑"
        />
        <div style={{ width: CARD_W, opacity: cardsIn, display: "flex", flexDirection: "column", gap: 18 }}>
          <Panel
            title="每轮落检查点"
            body="迭代结论、关键改动、证据路径，逐轮写进会话状态。"
            tone={color.green}
            width={CARD_W}
            localFrame={localFrame - 34}
            badge=".aios/"
          />
          <Panel
            title="恢复要人触发"
            body="人来决定要不要继续；上一轮遗留的操作者门不会被自动放行。"
            tone={color.cyan}
            width={CARD_W}
            localFrame={localFrame - 50}
            badge="--session"
          />
          <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
            <Chip label="08:02 接着跑" tone={color.green} localFrame={localFrame - 62} filled />
            <Chip label="不从零开始" tone={color.textDim} localFrame={localFrame - 68} />
          </div>
        </div>
      </div>
      <Captions cues={captions} />
    </Stage>
  );
};
