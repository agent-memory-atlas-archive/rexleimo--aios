// 品牌基线：docs-site 的视觉契约（DESIGN.md）用 #1a73e8 作主色，视频延用同一主色保持识别一致，
// 深色底是为动态画面服务（浅色底在压缩后发灰）。
export const color = {
  bg: "#080B14",
  bgRaised: "#101625",
  bgPanel: "#141C2E",
  line: "#243049",
  brand: "#1A73E8",
  brandSoft: "#6FB0FF",
  cyan: "#34D3EB",
  green: "#3DDC97",
  amber: "#F5A623",
  red: "#FF6B6B",
  violet: "#9B7DFF",
  text: "#EAF0F8",
  textDim: "#93A2B8",
  textFaint: "#5C6B82",
} as const;

// 不加载 webfont：纯代码绘制要求离线可复现。CJK 依赖本机字体，Linux 渲染需装 Noto Sans SC。
export const font = {
  display:
    "'Microsoft YaHei UI','Microsoft YaHei','PingFang SC','Noto Sans SC','Helvetica Neue',sans-serif",
  mono: "'Cascadia Mono','Consolas','Noto Sans Mono',monospace",
} as const;

// 竖版 9:16 的字号按 1080 宽度定：字幕要在手机上不放大也能读，所以比横版大一档。
export const size = {
  display: 116,
  headline: 88,
  title: 60,
  body: 46,
  /** 字幕按 15 个全角字一行算：15 * (52 + 1) < 852，再大会折行留下孤字。 */
  caption: 52,
  mono: 36,
  micro: 32,
  kicker: 32,
} as const;

// 竖版短视频有平台遮挡：顶部约 200px 是搜索/关注栏，底部约 260px 是文案与进度条。
// 内容只放在 safeTop..(height - safeBottom) 之间，字幕再往上抬一档。
export const layout = {
  width: 1080,
  height: 1920,
  /** 左侧留给进度轨，内容从这条线开始，否则光晕会压到文字上 */
  padX: 96,
  /** 画面内容区：顶部避开平台栏，底部避开字幕带 */
  contentTop: 250,
  contentBottom: 1330,
  /** 硬字幕居中基线（静音播放时字幕承载全部信息） */
  captionCenterY: 1420,
  chromeTop: 150,
  railX: 34,
} as const;
