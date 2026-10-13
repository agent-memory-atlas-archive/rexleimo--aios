import React from "react";
import { interpolate } from "remotion";
import { Stage } from "../components/stage";
import { Captions, Headline, Kicker } from "../components/text";
import { Terminal } from "../components/terminal";
import { color, size } from "../theme";
import type { SceneProps } from "../timeline";

/** 01 冷开场：一句话指令，3 秒内把「机器接手了」这件事说清。 */
const TASK_COMMAND = "/implement 重构浏览器层，测试全绿";

export const HookScene: React.FC<SceneProps> = ({
  localFrame,
  durationInFrames,
  captions,
}) => {
  const headlineIn = interpolate(localFrame, [4, 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const terminalIn = interpolate(localFrame, [16, 28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Stage localFrame={localFrame} durationInFrames={durationInFrames} glow={color.brand} enter="rise">
      <div style={{ opacity: headlineIn }}>
        <Kicker text="DAY 1 · 23:40" localFrame={localFrame} />
        <Headline
          text="一句话，"
          localFrame={localFrame}
          delay={6}
          sizeOverride={size.display}
        />
        <div style={{ marginTop: -14 }}>
          <Headline
            text="整晚交给它"
            localFrame={localFrame}
            delay={16}
            sizeOverride={size.display}
            accentChars="整晚"
          />
        </div>
      </div>
      <div style={{ marginTop: 60, opacity: terminalIn }}>
        <Terminal
          title="~/coding/app — zsh"
          localFrame={localFrame}
          lines={[
            { prompt: "$ ", text: TASK_COMMAND, start: 20 },
            { text: "capability planned · work item #001 accepted", start: 50, tone: "cyan" },
            { text: "agent started · 40 min job", start: 60, tone: "dim" },
          ]}
        />
      </div>
      <Captions cues={captions} />
    </Stage>
  );
};
