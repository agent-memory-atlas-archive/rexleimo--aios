import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { color, font, layout, size } from "../theme";
import type { CaptionCue } from "../timeline";

/** 小标题：等宽、逐字进场，用作每场的 kicker。 */
export const Kicker: React.FC<{ text: string; localFrame: number; tone?: string }> = ({
  text,
  localFrame,
  tone = color.cyan,
}) => {
  const reveal = interpolate(localFrame, [2, 18], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        fontFamily: font.mono,
        fontSize: size.kicker,
        letterSpacing: 5,
        color: tone,
        opacity: reveal,
        transform: `translateX(${(1 - reveal) * -20}px)`,
      }}
    >
      {text}
    </div>
  );
};

/** 主标题：按字符错峰淡入 + 上浮，中文/英文都适用。竖版靠它承载大字。 */
export const Headline: React.FC<{
  text: string;
  localFrame: number;
  delay?: number;
  sizeOverride?: number;
  accentChars?: string;
  tone?: string;
  align?: "left" | "center";
}> = ({ text, localFrame, delay = 6, sizeOverride, accentChars = "", tone = color.text, align = "left" }) => {
  const chars = Array.from(text);
  return (
    <div
      style={{
        fontFamily: font.display,
        fontSize: sizeOverride ?? size.display,
        fontWeight: 800,
        lineHeight: 1.16,
        letterSpacing: -1,
        marginTop: 16,
        textAlign: align,
      }}
    >
      {chars.map((ch, i) => {
        const start = delay + i * 1.5;
        const t = interpolate(localFrame, [start, start + 11], [0, 1], {
          extrapolateLeft: "clamp", extrapolateRight: "clamp",
        });
        return (
          <span
            key={i}
            style={{
              opacity: t,
              transform: `translateY(${(1 - t) * 34}px)`,
              display: "inline-block",
              color: accentChars.includes(ch) ? color.brandSoft : tone,
              whiteSpace: "pre",
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
};

export const Sub: React.FC<{
  text: string;
  localFrame: number;
  delay?: number;
  tone?: string;
  sizeOverride?: number;
  align?: "left" | "center";
}> = ({ text, localFrame, delay = 24, tone = color.textDim, sizeOverride, align = "left" }) => {
  const t = interpolate(localFrame, [delay, delay + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        fontFamily: font.display,
        fontSize: sizeOverride ?? size.body,
        color: tone,
        lineHeight: 1.5,
        marginTop: 18,
        textAlign: align,
        opacity: t,
        transform: `translateY(${(1 - t) * 16}px)`,
      }}
    >
      {text}
    </div>
  );
};

/**
 * 硬字幕：抖音/小红书默认静音自动播放，字幕就是旁白。
 * 同一时刻只出一条，落在画面下三分之一（避开平台底部 UI 遮挡带）。
 */
export const Captions: React.FC<{ cues: CaptionCue[] }> = ({ cues }) => {
  const localFrame = useCurrentFrame();
  const active = cues.find((cue) => localFrame >= cue.from && localFrame < cue.to);
  if (!active) return null;
  const age = localFrame - active.from;
  const inT = interpolate(age, [0, 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: layout.captionCenterY,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          maxWidth: 920,
          padding: "16px 34px",
          borderRadius: 20,
          background: "#050810CC",
          border: `1px solid ${color.line}88`,
          fontFamily: font.display,
          fontSize: size.caption,
          fontWeight: 800,
          lineHeight: 1.34,
          letterSpacing: 1,
          textAlign: "center",
          color: color.text,
          textShadow: "0 2px 18px #000000E0",
          opacity: inT,
          transform: `translateY(${(1 - inT) * 22}px)`,
        }}
      >
        {active.text}
      </div>
    </div>
  );
};

/** 通用错峰容器：把任意子元素按索引依次推入画面。 */
export const Stagger: React.FC<{
  children: React.ReactNode[];
  localFrame: number;
  delay?: number;
  step?: number;
  gap?: number;
}> = ({ children, localFrame, delay = 16, step = 8, gap = 24 }) => (
  <div style={{ display: "flex", flexDirection: "column", gap, marginTop: 28 }}>
    {children.map((child, i) => {
      const start = delay + i * step;
      const t = interpolate(localFrame, [start, start + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      return (
        <div
          key={i}
          style={{
            opacity: t,
            transform: `translateY(${(1 - t) * 26}px) scale(${0.97 + t * 0.03})`,
          }}
        >
          {child}
        </div>
      );
    })}
  </div>
);
