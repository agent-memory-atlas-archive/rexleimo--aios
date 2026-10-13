import React from "react";
import { interpolate } from "remotion";
import { color, font, layout, size } from "../theme";

export type DiffLine = {
  text: string;
  kind: "add" | "del" | "ctx";
};

const kindTone: Record<DiffLine["kind"], { color: string; gutter: string; bg: string }> = {
  add: { color: color.green, gutter: "+", bg: `${color.green}14` },
  del: { color: color.red, gutter: "−", bg: `${color.red}12` },
  ctx: { color: color.textDim, gutter: " ", bg: "transparent" },
};

/**
 * 代码界面：文件标签 + 逐行揭开的 diff。
 * 竖版宽度固定为内容区宽度，场景不再传 width，避免出现横版残留尺寸。
 */
export const MockIde: React.FC<{
  tabs: string[];
  activeTab: number;
  lines: DiffLine[];
  localFrame: number;
  /** 第一行 diff 出现的本地帧 */
  start?: number;
  /** 每行揭开间隔帧数 */
  step?: number;
  height?: number;
}> = ({ tabs, activeTab, lines, localFrame, start = 10, step = 3, height = 640 }) => {
  const CONTENT_W = layout.width - layout.padX * 2;
  return (
    <div
      style={{
        width: CONTENT_W,
        borderRadius: 20,
        overflow: "hidden",
        background: "#0B101C",
        border: `1px solid ${color.line}`,
        boxShadow: `0 40px 80px -34px #000000, 0 0 0 1px ${color.brand}1F`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          height: 62,
          background: "#0E1524",
          borderBottom: `1px solid ${color.line}`,
        }}
      >
        {tabs.map((tab, i) => (
          <div
            key={tab}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "0 24px",
              fontFamily: font.mono,
              fontSize: size.mono - 8,
              color: i === activeTab ? color.text : color.textFaint,
              background: i === activeTab ? `${color.brand}26` : "transparent",
              borderRight: `1px solid ${color.line}66`,
            }}
          >
            {tab}
          </div>
        ))}
      </div>
      <div style={{ height, overflow: "hidden", padding: "18px 0" }}>
        {lines.map((line, i) => {
          const t = interpolate(localFrame, [start + i * step, start + i * step + 6], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          const tone = kindTone[line.kind];
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                padding: "0 26px",
                height: 52,
                background: tone.bg,
                opacity: t,
                transform: `translateX(${(1 - t) * -26}px)`,
              }}
            >
              <span style={{ width: 22, fontFamily: font.mono, fontSize: size.mono - 10, color: tone.color }}>
                {tone.gutter}
              </span>
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: size.mono - 10,
                  color: line.kind === "ctx" ? color.textDim : color.text,
                  whiteSpace: "pre",
                }}
              >
                {line.text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** 测试计数：数字滚动到目标值，越过阈值才转绿，用来画「真的在跑测试」。 */
export const TestCounter: React.FC<{
  target: number;
  localFrame: number;
  start?: number;
  ramp?: number;
  label?: string;
  width?: number;
}> = ({ target, localFrame, start = 8, ramp = 44, label = "passing", width }) => {
  const value = Math.round(interpolate(localFrame, [start, start + ramp], [0, target], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  }));
  const done = value >= target;
  const tone = done ? color.green : color.amber;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 18,
        padding: "16px 28px",
        borderRadius: 16,
        background: `${tone}14`,
        border: `1.5px solid ${tone}88`,
        width,
      }}
    >
      <div style={{ fontFamily: font.display, fontSize: size.body - 8, color: color.textFaint, opacity: done ? 1 : 0.3 }}>✓</div>
      <div style={{ fontFamily: font.mono, fontSize: size.headline - 20, fontWeight: 700, color: tone }}>
        {value}
      </div>
      <div style={{ fontFamily: font.display, fontSize: size.body - 8, color: color.textDim, whiteSpace: "nowrap" }}>
        {label}
      </div>
    </div>
  );
};
