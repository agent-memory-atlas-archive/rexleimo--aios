import React from "react";
import { interpolate, spring, useVideoConfig } from "remotion";
import { color, font, size } from "../theme";

/**
 * 连线在局部盒子里画：场景给 width/height，端点用同一套局部坐标。
 * pathLength 归一到 1，因此描边动画不依赖真实路径测量，逐帧确定。
 */
export const Connector: React.FC<{
  box: [number, number];
  from: [number, number];
  to: [number, number];
  localFrame: number;
  delay?: number;
  tone?: string;
  bend?: number;
  width?: number;
  style?: React.CSSProperties;
}> = ({ box, from, to, localFrame, delay = 0, tone = color.brand, bend = 0, width = 4, style }) => {
  const progress = interpolate(localFrame, [delay, delay + 20], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const [x1, y1] = from;
  const [x2, y2] = to;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 + bend;
  const d = `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
  return (
    <svg
      width={box[0]}
      height={box[1]}
      viewBox={`0 0 ${box[0]} ${box[1]}`}
      style={{ position: "absolute", left: 0, top: 0, overflow: "visible", ...style }}
    >
      <path
        d={d}
        stroke={tone}
        strokeWidth={width}
        fill="none"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={progress}
      />
    </svg>
  );
};

/** 沿连线跑动的光点，表达事实→能力→证据、任务→闸门的流向。 */
export const Traveller: React.FC<{
  box: [number, number];
  from: [number, number];
  to: [number, number];
  localFrame: number;
  period: number;
  tone?: string;
  delay?: number;
}> = ({ box, from, to, localFrame, period, tone = color.cyan, delay = 0 }) => {
  const local = Math.max(0, localFrame - delay);
  const p = (local % period) / period;
  const x = interpolate(p, [0, 1], [from[0], to[0]]);
  const y = interpolate(p, [0, 1], [from[1], to[1]]);
  return (
    <svg width={box[0]} height={box[1]} viewBox={`0 0 ${box[0]} ${box[1]}`} style={{ position: "absolute", left: 0, top: 0 }}>
      <circle cx={x} cy={y} r={12} fill={tone} />
      <circle cx={x} cy={y} r={26} fill={tone} opacity={0.2} />
    </svg>
  );
};

/** 节点盒：能力面、子代理、路由档位的最小单元。 */
export const FlowNode: React.FC<{
  title: string;
  sub?: string;
  tone?: string;
  localFrame: number;
  width?: number;
  active?: boolean;
  dim?: boolean;
}> = ({ title, sub, tone = color.brand, localFrame, width = 300, active = false, dim = false }) => {
  const t = interpolate(localFrame, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        width,
        padding: "20px 24px",
        borderRadius: 18,
        background: active ? `${tone}26` : `${color.bgRaised}F2`,
        border: `1.5px solid ${tone}${active ? "" : "66"}`,
        boxShadow: active ? `0 0 38px ${tone}55` : "none",
        opacity: t * (dim ? 0.42 : 1),
        transform: `translateY(${(1 - t) * 18}px)`,
      }}
    >
      <div style={{ fontFamily: font.mono, fontSize: size.body - 12, color: active ? tone : color.text, letterSpacing: 0.4 }}>
        {title}
      </div>
      {sub ? (
        <div style={{ fontFamily: font.display, fontSize: size.micro - 2, color: color.textDim, marginTop: 6 }}>{sub}</div>
      ) : null}
    </div>
  );
};

export type TrackBreak = { at: number; label: string };

/**
 * 竖版断点轨道：自上而下填充，红=进程中断，绿环=检查点，青=从检查点续跑。
 * `at` 是轨道长度比例（0..1），场景用它表达「跑到 78% 断掉」这类事实。
 */
export const BreakTrack: React.FC<{
  localFrame: number;
  height: number;
  /** 竖条粗细 */
  thickness?: number;
  /** 轨道占位宽度，标签文字不要超出它 */
  containerWidth?: number;
  /** 进度推进到的比例上限（断点之前） */
  runTo?: number;
  breaks: TrackBreak[];
  checkpoints: number[];
  resumedLabel: string;
  resumeFrom?: number;
}> = ({
  localFrame,
  height,
  thickness = 14,
  containerWidth = 300,
  runTo = 0.78,
  breaks,
  checkpoints,
  resumedLabel,
  resumeFrom = 0.6,
}) => {
  const { fps } = useVideoConfig();
  const fill = interpolate(localFrame, [0, 34], [0, runTo], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const diedAt = 36;
  const resume = interpolate(localFrame, [diedAt + 14, diedAt + 50], [resumeFrom, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const labelIn = spring({ frame: localFrame - (diedAt + 52), fps, config: { damping: 200, stiffness: 120 } });
  const broken = localFrame >= diedAt;
  return (
    <div style={{ position: "relative", height, width: containerWidth }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: thickness,
          height,
          borderRadius: thickness,
          background: `${color.line}88`,
        }}
      />
      {/* 断点之前跑到的位置：断裂后转暗红，表示这一段作废了 */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: thickness,
          borderRadius: thickness,
          height: fill * height,
          background: broken
            ? `linear-gradient(180deg, ${color.brand}, ${color.red})`
            : `linear-gradient(180deg, ${color.brand}, ${color.cyan})`,
          opacity: broken ? 0.45 : 1,
        }}
      />
      {/* 续接：从最后一个检查点重新推进，覆盖断点之前的已完成段并继续往后 */}
      {broken ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: resumeFrom * height,
            width: thickness,
            height: Math.max(0, resume - resumeFrom) * height,
            borderRadius: thickness,
            background: `linear-gradient(180deg, ${color.cyan}, ${color.green})`,
            boxShadow: `0 0 26px ${color.cyan}88`,
          }}
        />
      ) : null}

      {breaks.map((br) => (
        <div key={br.at} style={{ position: "absolute", left: -18, top: br.at * height, opacity: fill >= br.at ? 1 : 0 }}>
          <div style={{ width: 52, height: 6, background: color.red, borderRadius: 6, boxShadow: `0 0 22px ${color.red}` }} />
          <div
            style={{
              marginLeft: 62,
              marginTop: -16,
              fontFamily: font.display,
              fontSize: size.body - 12,
              fontWeight: 700,
              color: color.red,
              whiteSpace: "nowrap",
            }}
          >
            {br.label}
          </div>
        </div>
      ))}

      {checkpoints.map((at, i) => {
        const on = fill >= at || resume >= at;
        return (
          <div key={at} style={{ position: "absolute", left: -13, top: at * height - 13, opacity: on ? 1 : 0.3 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 40,
                background: on ? `${color.green}33` : color.line,
                border: `2.5px solid ${color.green}`,
                boxShadow: on ? `0 0 26px ${color.green}88` : "none",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 54,
                top: 6,
                fontFamily: font.mono,
                fontSize: size.micro - 6,
                color: on ? color.green : color.textFaint,
                whiteSpace: "nowrap",
              }}
            >
              ckpt-{i + 1}
            </div>
          </div>
        );
      })}

      <div
        style={{
          position: "absolute",
          left: 74,
          top: Math.min(resume, 0.94) * height,
          fontFamily: font.mono,
          fontSize: size.body - 14,
          color: color.cyan,
          opacity: labelIn,
          transform: `translateX(${(1 - labelIn) * 20}px)`,
          whiteSpace: "nowrap",
        }}
      >
        {resumedLabel}
      </div>
    </div>
  );
};

/** 证据盖章：一行主张 + 一个弹入的绿勾，用来把「说完了」变成「验过了」。 */
export const CheckStamp: React.FC<{
  text: string;
  meta?: string;
  localFrame: number;
  delay?: number;
  tone?: string;
}> = ({ text, meta, localFrame, delay = 0, tone = color.green }) => {
  const { fps } = useVideoConfig();
  const line = interpolate(localFrame, [delay, delay + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const stamp = spring({ frame: localFrame - (delay + 10), fps, config: { damping: 16, stiffness: 220 } });
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        width: "100%",
        padding: "26px 30px",
        borderRadius: 16,
        background: stamp > 0.6 ? `${tone}14` : `${color.bgRaised}E6`,
        border: `1px solid ${stamp > 0.6 ? `${tone}88` : `${color.line}`}`,
        opacity: line,
        transform: `translateY(${(1 - line) * 18}px)`,
      }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 46,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: `2px solid ${tone}`,
          color: tone,
          fontFamily: font.mono,
          fontSize: size.body - 8,
          transform: `scale(${0.4 + stamp * 0.6})`,
          opacity: Math.min(1, stamp * 1.6),
          boxShadow: stamp > 0.8 ? `0 0 26px ${tone}66` : "none",
        }}
      >
        ✓
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: font.display, fontSize: size.body - 4, fontWeight: 700, color: color.text }}>{text}</div>
        {meta ? (
          <div style={{ fontFamily: font.mono, fontSize: size.micro - 8, color: color.textDim, marginTop: 6 }}>{meta}</div>
        ) : null}
      </div>
    </div>
  );
};
