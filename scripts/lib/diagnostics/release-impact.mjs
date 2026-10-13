/*
 * 发布影响规则（单一事实源）。
 *
 * 仓库约定，已对发布历史核验：特性发布（minor/major——patch 段为 0）用四种语言各一篇
 * 发布博文宣告自己；维护发布（patch > 0）只写 changelog——v5.17.0 到 v5.17.4 就完全没有
 * 博文。patch 也**可以**带博文（v6.0.1 就有），门禁只是不再强制要求，免得一个修 stale
 * pin 的小修复被逼去写营销文案。若某个 patch 实际携带了面向用户的功能工作，就应当改按
 * minor 发布。版本号形态未知时，默认要求博文（fail 向更严格的检查）。
 *
 * 这条规则同时被两处消费：scripts/check-site-sync.mjs（要求当前版本有发布帖）与
 * scripts/generate-llms-txt.mjs（对外机读索引不能宣称一篇不存在的帖子）。此前它只写在
 * check-site-sync.mjs 内部，llms.txt 的守卫于是按"永远有帖"断言，与维护发布相撞——
 * v6.2.1 发版时被 release-preflight 抓出。规则只留一份，两个消费方共用。
 */

/** 判定是否为维护发布：仅看 patch 段是否大于 0，不做任何语义猜测。 */
export function isMaintenanceRelease(version) {
  const patch = Number(String(version ?? '').split('.')[2]);
  return Number.isFinite(patch) && patch > 0;
}
