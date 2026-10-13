import React from "react";
import { interpolate } from "remotion";
import { color, font, layout, size } from "../theme";

/** 竖版内容区宽度，所有面板/终端共用，避免各场景写死横版尺寸。 */
export const CONTENT_W = layout.width - layout.padX * 2;

export const Panel: React.FC<{
  title: string;
  body?: string;
  tone?: string;
  localFrame: number;
  width?: number;
  note?: string;
  noteTone?: string;
  badge?: string;
}> = ({ title, body, tone = color.brand, localFrame, width = CONTENT_W, note, noteTone, badge }) => {
  const t = interpolate(localFrame, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        width,
        padding: "26px 30px",
        borderRadius: 20,
        background: `linear-gradient(180deg, ${color.bgPanel}, ${color.bgRaised})`,
        border: `1px solid ${tone}66`,
        boxShadow: `0 26px 56px -30px ${tone}77, inset 0 1px 0 #ffffff0d`,
        opacity: t,
        transform: `translateY(${(1 - t) * 24}px)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 14, height: 14, borderRadius: 14, background: tone, boxShadow: `0 0 18px ${tone}` }} />
        <div style={{ fontFamily: font.display, fontSize: size.title - 6, fontWeight: 700 }}>{title}</div>
        {badge ? (
          <div
            style={{
              marginLeft: "auto",
              fontFamily: font.mono,
              fontSize: size.micro - 10,
              color: tone,
              background: `${tone}1F`,
              borderRadius: 999,
              padding: "6px 16px",
            }}
          >
            {badge}
          </div>
        ) : null}
      </div>
      {body ? (
        <div style={{ fontFamily: font.display, fontSize: size.body - 8, color: color.textDim, marginTop: 14, lineHeight: 1.5 }}>
          {body}
        </div>
      ) : null}
      {note ? (
        <div style={{ marginTop: 14, fontFamily: font.mono, fontSize: size.micro - 6, color: noteTone ?? color.textFaint, letterSpacing: 0.6 }}>
          {note}
        </div>
      ) : null}
    </div>
  );
};

export const Chip: React.FC<{
  label: string;
  tone?: string;
  localFrame: number;
  filled?: boolean;
  mono?: boolean;
}> = ({ label, tone = color.cyan, localFrame, filled = false, mono = true }) => {
  const t = interpolate(localFrame, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        padding: filled ? "12px 26px" : "11px 24px",
        borderRadius: 999,
        border: `1.5px solid ${tone}${filled ? "" : "88"}`,
        background: filled ? tone : `${tone}18`,
        color: filled ? "#08101E" : tone,
        fontFamily: mono ? font.mono : font.display,
        fontSize: size.micro - 2,
        fontWeight: 600,
        letterSpacing: mono ? 1 : 0,
        opacity: t,
        transform: `scale(${0.88 + t * 0.12})`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </div>
  );
};

/** 横向条形进度：用于 diff 行数、覆盖项等可数事实。 */
export const Bar: React.FC<{
  label: string;
  value: number;
  localFrame: number;
  tone?: string;
  caption?: string;
  width?: number;
}> = ({ label, value, localFrame, tone = color.brand, caption, width = CONTENT_W }) => {
  const grow = interpolate(localFrame, [4, 34], [0, value], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ width }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontFamily: font.display, fontSize: size.body - 4, color: color.text }}>{label}</div>
        <div style={{ fontFamily: font.mono, fontSize: size.micro - 2, color: tone }}>{caption ?? `${Math.round(grow * 100)}%`}</div>
      </div>
      <div style={{ marginTop: 10, height: 16, borderRadius: 16, background: `${color.line}99`, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${Math.max(0, Math.min(100, grow * 100))}%`,
            background: `linear-gradient(90deg, ${tone}, ${tone}aa)`,
            boxShadow: `0 0 22px ${tone}88`,
          }}
        />
      </div>
    </div>
  );
};

export const Row: React.FC<{ children: React.ReactNode[]; gap?: number; align?: "center" | "start" }> = ({
  children,
  gap = 18,
  align = "center",
}) => (
  <div style={{ display: "flex", gap, alignItems: align, flexWrap: "wrap", marginTop: 18 }}>{children}</div>
);
