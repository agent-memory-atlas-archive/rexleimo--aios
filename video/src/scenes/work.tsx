import React from "react";
import { interpolate } from "remotion";
import { Stage } from "../components/stage";
import { Captions, Kicker } from "../components/text";
import { MockIde, TestCounter, type DiffLine } from "../components/ide";
import { CONTENT_W } from "../components/panel";
import { color, font, size } from "../theme";
import type { SceneProps } from "../timeline";

const TABS = ["launcher.ts", "health.ts", "navigate.ts"];

const DIFF: DiffLine[] = [
  { kind: "ctx", text: "  const executablePath = resolveExecutablePath(p);" },
  { kind: "ctx", text: "  if (p.cdpUrl || p.cdpPort) {" },
  { kind: "del", text: "    browser = await chromium.launch();" },
  { kind: "add", text: "    browser = await chromium.connectOverCDP(ep);" },
  { kind: "add", text: "    if (!browser.isConnected()) {" },
  { kind: "add", text: "      return attachAgain(ep, retry + 1);" },
  { kind: "ctx", text: "    }" },
  { kind: "ctx", text: "  } else {" },
  { kind: "add", text: "    context = await launchPersistent(dir, opts);" },
  { kind: "ctx", text: "  }" },
];

/** 05 干活：把镜头对准真实界面——代码在改，测试在跑。 */
export const WorkScene: React.FC<SceneProps> = ({
  localFrame,
  durationInFrames,
  captions,
}) => {
  const ideIn = interpolate(localFrame, [4, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const testIn = interpolate(localFrame, [58, 72], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Stage localFrame={localFrame} durationInFrames={durationInFrames} glow={color.brand} enter="cut">
      <div style={{ opacity: ideIn }}>
        <Kicker text="改代码，不是写文案" localFrame={localFrame} />
        <div style={{ marginTop: 26 }}>
          <MockIde tabs={TABS} activeTab={0} lines={DIFF} localFrame={localFrame} start={12} step={4} height={556} />
        </div>
      </div>

      <div
        style={{
          marginTop: 34,
          opacity: testIn,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: CONTENT_W,
        }}
      >
        <div>
          <div style={{ fontFamily: font.mono, fontSize: size.mono - 6, color: color.green }}>$ npm test</div>
          <div style={{ fontFamily: font.display, fontSize: size.body - 10, color: color.textDim, marginTop: 10 }}>
            退出码是跑出来的
          </div>
        </div>
        <TestCounter target={128} localFrame={localFrame} start={64} ramp={44} label="个测试通过" />
      </div>

      <Captions cues={captions} />
    </Stage>
  );
};
