import React from "react";
import { interpolate } from "remotion";
import { Stage } from "../components/stage";
import { Captions, Kicker } from "../components/text";
import { CheckStamp, FlowNode } from "../components/diagram";
import { CONTENT_W } from "../components/panel";
import { color, font, size } from "../theme";
import type { SceneProps } from "../timeline";

const STAGES = [
  { title: "Fact", sub: "发生了什么", tone: color.brandSoft },
  { title: "Capability", sub: "允许做什么", tone: color.cyan },
  { title: "Evidence", sub: "凭什么算完成", tone: color.green },
];

const CLAIMS = [
  { text: "typecheck 退出码 0", meta: "tsc --noEmit" },
  { text: "128 个测试通过", meta: "node --test" },
  { text: "4 个文件的改动可复核", meta: "git diff --stat" },
  { text: "证据写进只追加日志", meta: "append-only journal" },
];

/** 07 证据门：完成不是模型的一句话，是一组可复核的事实。 */
export const ProofScene: React.FC<SceneProps> = ({
  localFrame,
  durationInFrames,
  captions,
}) => {
  const stageIn = interpolate(localFrame, [10, 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const nodeW = (CONTENT_W - 168) / 3;
  return (
    <Stage localFrame={localFrame} durationInFrames={durationInFrames} glow={color.green} enter="cut">
      <Kicker text="凭什么算完成" localFrame={localFrame} tone={color.green} />
      <div
        style={{
          marginTop: 20,
          fontFamily: font.display,
          fontSize: size.headline,
          fontWeight: 800,
          lineHeight: 1.2,
        }}
      >
        证据<span style={{ color: color.green }}>，不是话术</span>
      </div>

      <div style={{ marginTop: 30, display: "flex", gap: 12, opacity: stageIn }}>
        {STAGES.map((s, i) => (
          <div key={s.title} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <FlowNode title={s.title} sub={s.sub} tone={s.tone} width={nodeW} localFrame={localFrame - 12 - i * 7} active={i === 2 && localFrame > 40} />
            {i < STAGES.length - 1 ? (
              <div style={{ fontFamily: font.mono, fontSize: size.body - 10, color: color.textFaint }}>→</div>
            ) : null}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 22 }}>
        {CLAIMS.map((claim, i) => (
          <CheckStamp key={claim.text} text={claim.text} meta={claim.meta} localFrame={localFrame} delay={22 + i * 11} />
        ))}
      </div>

      <Captions cues={captions} />
    </Stage>
  );
};
