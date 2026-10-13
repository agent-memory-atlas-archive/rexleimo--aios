import React from "react";
import { interpolate, spring, useVideoConfig } from "remotion";
import { Stage } from "../components/stage";
import { Captions } from "../components/text";
import { Chip, CONTENT_W } from "../components/panel";
import { Terminal } from "../components/terminal";
import { color, font, size } from "../theme";
import type { SceneProps } from "../timeline";

const CLIENTS = ["codex", "claude", "gemini", "opencode", "hermes", "grok", "workbuddy", "pi", "zcode", "qoder"];

/** 08 收束：产品名 + 客户端矩阵 + 安装命令，最后一屏要能被截图记住。 */
export const CtaScene: React.FC<SceneProps> = ({
  localFrame,
  durationInFrames,
  captions,
}) => {
  const { fps } = useVideoConfig();
  const mark = spring({ frame: localFrame, fps, config: { damping: 15, stiffness: 130, mass: 0.9 } });
  const clientsIn = interpolate(localFrame, [18, 38], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cmdIn = interpolate(localFrame, [34, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const chipsIn = interpolate(localFrame, [70, 86], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <Stage localFrame={localFrame} durationInFrames={durationInFrames} glow={color.brand} enter="rise">
      <div style={{ display: "flex", alignItems: "center", gap: 26, transform: `scale(${0.7 + mark * 0.3})`, transformOrigin: "0 50%" }}>
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 26,
            background: `linear-gradient(140deg, ${color.brand}, ${color.cyan})`,
            boxShadow: `0 0 60px ${color.brand}77`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: font.display,
            fontSize: 56,
            fontWeight: 800,
            color: "#061019",
          }}
        >
          A
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 22 }}>
          <div style={{ fontFamily: font.display, fontSize: size.display, fontWeight: 800, lineHeight: 1 }}>AIOS</div>
          <div style={{ fontFamily: font.mono, fontSize: size.body - 12, color: color.cyan, letterSpacing: 3 }}>
            6.3.0
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 34,
          fontFamily: font.display,
          fontSize: size.headline - 12,
          fontWeight: 700,
          lineHeight: 1.28,
        }}
      >
        一套记忆
        <br />
        <span style={{ color: color.brandSoft }}>十个客户端共用</span>
      </div>

      <div
        style={{
          marginTop: 30,
          width: CONTENT_W,
          opacity: clientsIn,
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        {CLIENTS.map((name, i) => (
          <div
            key={name}
            style={{
              padding: "12px 22px",
              borderRadius: 12,
              background: `${color.bgPanel}`,
              border: `1px solid ${color.line}`,
              fontFamily: font.mono,
              fontSize: size.micro - 4,
              color: color.textDim,
              opacity: clientsIn * interpolate(localFrame, [20 + i * 2, 28 + i * 2], [0.2, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            }}
          >
            {name}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 40, opacity: cmdIn }}>
        <Terminal
          title="install"
          localFrame={localFrame - 50}
          lines={[
            { prompt: "$ ", text: "aios init", start: 0 },
            { text: "memo · workflow · evidence · skills  ok", start: 14, tone: "green" },
          ]}
        />
      </div>

      <div style={{ marginTop: 34, display: "flex", gap: 16, opacity: chipsIn }}>
        <Chip label="MIT" tone={color.green} localFrame={localFrame - 90} filled />
        <Chip label="10 clients" tone={color.cyan} localFrame={localFrame - 94} />
        <Chip label="纯代码绘制" tone={color.violet} localFrame={localFrame - 98} />
      </div>

      <Captions cues={captions} />
    </Stage>
  );
};
