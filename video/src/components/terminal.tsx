import React from "react";
import { interpolate, spring, useVideoConfig } from "remotion";
import { color, font, layout, size } from "../theme";

export type TerminalLine = {
  text: string;
  /** 行首提示符，空字符串表示纯输出行 */
  prompt?: string;
  tone?: "text" | "dim" | "brand" | "green" | "amber" | "red" | "cyan";
  /** 该行开始打字的本地帧 */
  start: number;
};

const toneColor: Record<NonNullable<TerminalLine["tone"]>, string> = {
  text: color.text,
  dim: color.textDim,
  brand: color.brandSoft,
  green: color.green,
  amber: color.amber,
  red: color.red,
  cyan: color.cyan,
};

// 竖版每场只有 3 秒上下，打字必须比横版快一档，否则观众等不到话说完。
const CHARS_PER_FRAME = 1.6;

/** 终端窗口：逐字打字 + 光标闪烁，是全片的主要「真实感」载体。宽度固定为内容区。 */
export const Terminal: React.FC<{
  title: string;
  lines: TerminalLine[];
  localFrame: number;
  height?: number;
  fontSize?: number;
}> = ({ title, lines, localFrame, height, fontSize = size.mono - 2 }) => {
  const { fps } = useVideoConfig();
  const CONTENT_W = layout.width - layout.padX * 2;
  const pop = spring({ frame: localFrame, fps, config: { damping: 200, stiffness: 150 } });

  const visible = lines
    .map((line) => {
      const elapsed = Math.max(0, localFrame - line.start);
      const chars = Math.min(line.text.length, Math.floor(elapsed * CHARS_PER_FRAME));
      return { ...line, shown: line.text.slice(0, chars), done: chars >= line.text.length };
    })
    // 还没轮到的行不占位，否则窗口里会先挂一排空提示符
    .filter((line) => localFrame >= line.start);
  const activeIndex = visible.findIndex((v) => !v.done);
  const caretOn = Math.floor(localFrame / 10) % 2 === 0;

  return (
    <div
      style={{
        width: CONTENT_W,
        height,
        borderRadius: 22,
        background: "#0B101C",
        border: `1px solid ${color.line}`,
        boxShadow: `0 44px 90px -34px #000000, 0 0 0 1px ${color.brand}26`,
        overflow: "hidden",
        transform: `scale(${0.94 + pop * 0.06}) translateY(${(1 - pop) * 30}px)`,
        opacity: Math.min(1, pop * 1.5),
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          height: 64,
          padding: "0 26px",
          background: "#0E1524",
          borderBottom: `1px solid ${color.line}`,
        }}
      >
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
          <div key={c} style={{ width: 18, height: 18, borderRadius: 18, background: c }} />
        ))}
        <div
          style={{
            marginLeft: 14,
            fontFamily: font.mono,
            fontSize: size.micro - 4,
            color: color.textFaint,
            letterSpacing: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </div>
      </div>
      <div
        style={{
          padding: "26px 30px",
          fontFamily: font.mono,
          fontSize,
          lineHeight: 1.72,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        {visible.map((line, i) => (
          <div key={i} style={{ color: toneColor[line.tone ?? "text"] }}>
            {line.prompt ? <span style={{ color: color.green }}>{line.prompt}</span> : null}
            {!line.prompt && !line.done ? <span style={{ color: color.textFaint }}>› </span> : null}
            {line.shown}
            {activeIndex === i && caretOn ? <span style={{ color: color.brandSoft }}>▋</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * 竖版左侧竖排进度轨：整片持续填充，切场景不清零。
 * 放在左边缘是因为底部带会被抖音/小红书的文案与进度条盖住。
 */
export const Rail: React.FC<{
  progress: number;
  markers: { label: string; at: number }[];
}> = ({ progress, markers }) => {
  const top = layout.contentTop - 40;
  const trackHeight = 1700 - top;
  const filled = interpolate(progress, [0, 1], [0, trackHeight]);
  return (
    <div style={{ position: "absolute", left: layout.railX, top, width: 10, height: trackHeight }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 10, background: `${color.line}99` }}>
        <div
          style={{
            width: "100%",
            height: `${Math.max(0, Math.min(1, progress)) * 100}%`,
            borderRadius: 10,
            background: `linear-gradient(180deg, ${color.brand}, ${color.cyan})`,
            boxShadow: `0 0 20px ${color.brand}99`,
          }}
        />
      </div>
      {markers.map((m) => (
        <div
          key={m.label}
          style={{
            position: "absolute",
            left: -6,
            top: m.at * trackHeight,
            width: 22,
            height: 3,
            background: progress >= m.at ? color.cyan : `${color.textFaint}66`,
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: filled - 5,
          width: 10,
          height: 10,
          borderRadius: 10,
          background: color.cyan,
          boxShadow: `0 0 24px ${color.cyan}`,
        }}
      />
    </div>
  );
};
