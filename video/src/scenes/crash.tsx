import React from "react";
import { interpolate } from "remotion";
import { Stage } from "../components/stage";
import { Captions, Kicker } from "../components/text";
import { Terminal } from "../components/terminal";
import { Chip, CONTENT_W } from "../components/panel";
import { color, font, size } from "../theme";
import type { SceneProps } from "../timeline";

// 断在第 38 帧：之后进度条转红、画面抖一下、日志吐出退出码。
const BREAK_FRAME = 38;

/** 02 痛点：长任务最怕的不是慢，是断。 */
export const CrashScene: React.FC<SceneProps> = ({
  localFrame,
  durationInFrames,
  captions,
}) => {
  const reached = interpolate(localFrame, [0, BREAK_FRAME], [0, 0.78], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const broke = localFrame >= BREAK_FRAME;
  const shake = broke
    ? Math.sin((localFrame - BREAK_FRAME) * 1.9) * interpolate(localFrame, [BREAK_FRAME, BREAK_FRAME + 12], [14, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0;
  const breakIn = interpolate(localFrame, [BREAK_FRAME + 2, BREAK_FRAME + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <Stage localFrame={localFrame} durationInFrames={durationInFrames} glow={color.red} enter="cut">
      <div style={{ transform: `translateX(${shake}px)` }}>
        <Kicker text="DAY 2 · 00:18" localFrame={localFrame} tone={color.red} />
        <div
          style={{
            marginTop: 26,
            fontFamily: font.display,
            fontSize: size.display,
            fontWeight: 800,
            lineHeight: 1.2,
            color: broke ? color.red : color.text,
          }}
        >
          跑到 <span style={{ color: color.amber }}>78%</span>
          <br />
          {broke ? "它断了。" : "还在推进…"}
        </div>

        <div style={{ marginTop: 46, width: CONTENT_W }}>
          <div style={{ height: 22, borderRadius: 22, background: `${color.line}99`, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${reached * 100}%`,
                borderRadius: 22,
                background: broke
                  ? `linear-gradient(90deg, ${color.red}, ${color.amber})`
                  : `linear-gradient(90deg, ${color.brand}, ${color.cyan})`,
                boxShadow: `0 0 26px ${broke ? color.red : color.brand}88`,
              }}
            />
          </div>
          <div
            style={{
              marginTop: 14,
              display: "flex",
              justifyContent: "space-between",
              fontFamily: font.mono,
              fontSize: size.micro - 4,
              color: color.textDim,
            }}
          >
            <span>work item #001 · mcp-server/src/browser</span>
            <span style={{ color: broke ? color.red : color.cyan }}>{Math.round(reached * 100)}%</span>
          </div>
        </div>

        <div style={{ marginTop: 40 }}>
          <Terminal
            title="agent session"
            localFrame={localFrame}
            fontSize={size.mono - 8}
            lines={[
              { text: "read mcp-server/src/browser/launcher.ts", start: 2, tone: "dim" },
              { text: "read mcp-server/src/browser/health.ts", start: 10, tone: "dim" },
              { text: "npm run typecheck … ok", start: 20, tone: "green" },
              { text: "kernel killed the process", start: BREAK_FRAME, tone: "red" },
              { text: "exit code 137 · context lost", start: BREAK_FRAME + 8, tone: "red" },
            ]}
          />
        </div>

        <div style={{ marginTop: 34, display: "flex", gap: 18, opacity: breakIn }}>
          <Chip label="已改文件全部作废" tone={color.red} localFrame={localFrame - BREAK_FRAME} filled />
          <Chip label="40 分钟白跑" tone={color.red} localFrame={localFrame - BREAK_FRAME} />
        </div>
      </div>
      <Captions cues={captions} />
    </Stage>
  );
};
