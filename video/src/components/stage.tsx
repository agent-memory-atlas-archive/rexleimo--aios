import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { color, font, layout } from "../theme";

const ENTER_FRAMES = 10;
const EXIT_FRAMES = 8;

/**
 * 竖版场景外壳：硬切进场（短推近）+ 快速退场，全片持续缓慢推镜。
 * durationInFrames 由场景从 timeline 传入，Stage 自己不知道总时长。
 */
export const Stage: React.FC<{
  children: React.ReactNode;
  localFrame: number;
  durationInFrames: number;
  glow?: string;
  /** 进场动效：cut=硬切闪白、rise=上推、slide=横移 */
  enter?: "cut" | "rise" | "slide";
}> = ({ children, localFrame, durationInFrames, glow = color.brand, enter = "rise" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const inT = interpolate(localFrame, [0, ENTER_FRAMES], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const exitStart = durationInFrames - EXIT_FRAMES;
  const outT = interpolate(localFrame, [exitStart, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const opacity = Math.min(inT, 1 - outT * 0.92);

  const entryShift =
    enter === "slide"
      ? `translateX(${(1 - inT) * 90}px)`
      : `translateY(${(1 - inT) * 64}px)`;
  const entryScale = enter === "cut" ? 0.9 + inT * 0.1 : 1;
  // 闪白只在硬切场用：0 帧亮、7 帧灭
  const flash =
    enter === "cut"
      ? interpolate(localFrame, [0, 7], [0.5, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : interpolate(localFrame, [0, 5], [0.26, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // 每个场景内部做一次缓慢推镜：手机小屏上 4% 的推进就足够“活”
  const push = interpolate(localFrame, [0, durationInFrames], [1, 1.042], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.linear,
  });
  const drift = Math.sin(frame / (fps * 1.8)) * 26;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: color.bg,
        overflow: "hidden",
        fontFamily: font.display,
        color: color.text,
      }}
    >
      <Backdrop drift={drift} glow={glow} />
      <div
        style={{
          position: "absolute",
          left: layout.padX,
          right: layout.padX,
          top: layout.contentTop,
          height: layout.contentBottom - layout.contentTop,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          opacity,
          transform: `${entryShift} scale(${entryScale * push})`,
          transformOrigin: "50% 42%",
        }}
      >
        {children}
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "#FFFFFF",
          opacity: flash,
          mixBlendMode: "overlay",
        }}
      />
    </div>
  );
};

const Backdrop: React.FC<{ drift: number; glow: string }> = ({ drift, glow }) => {
  const grid = 90;
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(${color.line}40 1px, transparent 1px), linear-gradient(90deg, ${color.line}40 1px, transparent 1px)`,
          backgroundSize: `${grid}px ${grid}px`,
          opacity: 0.22,
          maskImage: "radial-gradient(100% 70% at 50% 40%, rgba(0,0,0,0.8), transparent 78%)",
          WebkitMaskImage: "radial-gradient(100% 70% at 50% 40%, rgba(0,0,0,0.8), transparent 78%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 1400,
          height: 1400,
          left: -160 + drift,
          top: 120,
          background: `radial-gradient(circle, ${glow}50, transparent 62%)`,
          filter: "blur(70px)",
          opacity: 0.5,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 1200,
          height: 1200,
          right: -420 + drift * -0.6,
          bottom: -180,
          background: `radial-gradient(circle, ${color.violet}44, transparent 65%)`,
          filter: "blur(80px)",
          opacity: 0.4,
        }}
      />
      {/* 竖版标尺刻度：贴在左边缘，给画面一点工程感又不与内容争位 */}
      {[300, 620, 940, 1260].map((y) => (
        <div
          key={y}
          style={{
            position: "absolute",
            left: 52,
            top: y,
            width: 18,
            height: 2,
            background: `${color.textFaint}44`,
          }}
        />
      ))}
    </div>
  );
};
