import React from "react";
import { interpolate } from "remotion";
import { Stage } from "../components/stage";
import { Captions, Kicker } from "../components/text";
import { Chip, CONTENT_W, Panel } from "../components/panel";
import { Connector, FlowNode, Traveller } from "../components/diagram";
import { color, font, size } from "../theme";
import type { SceneProps } from "../timeline";

const CARD_W = (CONTENT_W - 24) / 2;
const GRID_TOP = 252;
const GATE_TOP = 600;

const WORKERS = [
  { title: "browser/launch", sub: "本机启动路径", tone: color.brand },
  { title: "browser/session", sub: "CDP 连接复用", tone: color.cyan },
  { title: "browser/profile", sub: "profile 配置读取", tone: color.violet },
  { title: "tests/browser", sub: "回归用例补齐", tone: color.green },
];

/** 06 团队：大任务拆成独立工作项并行派发，收口由 merge gate 判定。 */
export const TeamScene: React.FC<SceneProps> = ({
  localFrame,
  durationInFrames,
  captions,
}) => {
  const planIn = interpolate(localFrame, [4, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const gateIn = interpolate(localFrame, [54, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sealed = interpolate(localFrame, [76, 90], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Stage localFrame={localFrame} durationInFrames={durationInFrames} glow={color.violet} enter="rise">
      <Kicker text="活大了就拆开" localFrame={localFrame} tone={color.violet} />
      <div
        style={{
          marginTop: 20,
          fontFamily: font.display,
          fontSize: size.headline,
          fontWeight: 800,
          lineHeight: 1.2,
        }}
      >
        四个代理<span style={{ color: color.violet }}>同时</span>干
      </div>

      <div style={{ position: "relative", marginTop: 26, height: 790 }}>
        <div style={{ position: "absolute", top: 0, left: 0, opacity: planIn }}>
          <Panel
            title="拆成 4 个独立节点"
            body="每个节点只有一个文件 owner，互不覆盖。"
            tone={color.brandSoft}
            width={CONTENT_W}
            localFrame={localFrame}
            badge="#001"
          />
        </div>

        <Connector
          box={[CONTENT_W, GRID_TOP]}
          from={[CONTENT_W / 2, GRID_TOP - 62]}
          to={[CONTENT_W / 2, GRID_TOP - 14]}
          localFrame={localFrame}
          delay={12}
          tone={`${color.violet}AA`}
          width={4}
        />

        {WORKERS.map((w, i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          return (
            <div
              key={w.title}
              style={{
                position: "absolute",
                left: col * (CARD_W + 24),
                top: GRID_TOP + row * 148,
              }}
            >
              <FlowNode
                title={w.title}
                sub={w.sub}
                tone={w.tone}
                width={CARD_W}
                active={localFrame > 26 + i * 6 && localFrame < 70 + i * 3}
                localFrame={localFrame - (16 + i * 5)}
              />
            </div>
          );
        })}

        <Traveller
          box={[CONTENT_W, GATE_TOP]}
          from={[CONTENT_W / 2, GRID_TOP + 300]}
          to={[CONTENT_W / 2, GATE_TOP - 10]}
          localFrame={localFrame}
          period={26}
          delay={32}
          tone={color.cyan}
        />

        <div style={{ position: "absolute", top: GATE_TOP, left: 0, width: CONTENT_W, opacity: gateIn }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              padding: "24px 28px",
              borderRadius: 20,
              background: sealed > 0.5 ? `${color.green}1F` : `${color.bgRaised}F2`,
              border: `2px solid ${sealed > 0.5 ? color.green : color.amber}`,
              boxShadow: sealed > 0.5 ? `0 0 40px ${color.green}55` : "none",
            }}
          >
            <div style={{ fontFamily: font.mono, fontSize: size.body - 12, color: color.text }}>merge gate</div>
            <div style={{ fontFamily: font.display, fontSize: size.body - 10, color: color.textDim, flex: 1 }}>
              复核每个节点的产物
            </div>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: size.body - 14,
                color: sealed > 0.5 ? color.green : color.amber,
              }}
            >
              {sealed > 0.5 ? "4/4 merged" : "checking…"}
            </div>
          </div>
        </div>

        <div style={{ position: "absolute", top: GATE_TOP + 116, left: 0, display: "flex", gap: 16 }}>
          <Chip label="默认 status=simulated" tone={color.amber} localFrame={localFrame - 82} />
          <Chip label="live 需人工批准" tone={color.red} localFrame={localFrame - 88} filled />
        </div>
      </div>

      <Captions cues={captions} />
    </Stage>
  );
};
