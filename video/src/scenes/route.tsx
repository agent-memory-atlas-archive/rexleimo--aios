import React from "react";
import { interpolate } from "remotion";
import { Stage } from "../components/stage";
import { Captions, Headline, Kicker } from "../components/text";
import { Chip, CONTENT_W, Panel } from "../components/panel";
import { color, font, size } from "../theme";
import type { SceneProps } from "../timeline";

const COMMANDS = ["/plan", "/implement", "/review", "/debug", "/team"];

/** 04 机制：语义判断不靠猜关键词，由显式声明的命令面路由到三档流程。 */
export const RouteScene: React.FC<SceneProps> = ({
  localFrame,
  durationInFrames,
  captions,
}) => {
  const chipsIn = interpolate(localFrame, [8, 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const noteIn = interpolate(localFrame, [30, 44], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Stage localFrame={localFrame} durationInFrames={durationInFrames} glow={color.cyan} enter="rise">
      <Kicker text="它怎么保证不乱跑" localFrame={localFrame} />
      <Headline
        text="你说意图，它选流程"
        localFrame={localFrame}
        delay={6}
        sizeOverride={size.headline}
        accentChars="意图流程"
      />

      <div style={{ marginTop: 32, opacity: chipsIn, display: "flex", gap: 14, flexWrap: "wrap" }}>
        {COMMANDS.map((cmd, i) => (
          <Chip key={cmd} label={cmd} tone={color.brandSoft} localFrame={localFrame - 8 - i * 3} />
        ))}
      </div>

      <div
        style={{
          marginTop: 24,
          height: 58,
          display: "flex",
          alignItems: "center",
          gap: 18,
          opacity: noteIn,
        }}
      >
        <div style={{ fontFamily: font.mono, fontSize: size.body - 8, color: color.cyan }}>↓</div>
        <div style={{ fontFamily: font.mono, fontSize: size.micro - 6, color: color.textDim, whiteSpace: "nowrap" }}>
          声明 intent，不解析你的自然语言
        </div>
        <div style={{ flex: 1, height: 2, background: `${color.cyan}44` }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 4 }}>
        <Panel
          title="direct"
          body="直接回答，不建持久计划。"
          tone={color.textDim}
          width={CONTENT_W}
          localFrame={localFrame - 32}
        />
        <Panel
          title="guarded"
          body="一处可回滚的本地改动。"
          tone={color.cyan}
          width={CONTENT_W}
          localFrame={localFrame - 42}
        />
        <Panel
          title="planned"
          body="落一个工作项，按 Provider 执行。"
          tone={color.green}
          width={CONTENT_W}
          localFrame={localFrame - 52}
        />
      </div>
      <Captions cues={captions} />
    </Stage>
  );
};
