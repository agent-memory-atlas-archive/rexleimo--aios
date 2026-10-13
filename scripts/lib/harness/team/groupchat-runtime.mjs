/* 中文注释：GroupChat runtime facade 只暴露稳定 API；配置、历史、选人、提示词、执行循环已拆到子模块。 */
export { DEFAULT_GROUPCHAT_CONFIG, BLOCKED_STATUSES, RE_PLAN_ROLES } from './groupchat-runtime/support/constants.mjs';
export { normalizeText } from './groupchat-runtime/support/shared.mjs';
export { ConversationHistory } from './groupchat-runtime/dialogue/history.mjs';
export { normalizeGroupChatConfig } from './groupchat-runtime/support/config.mjs';
export { resolveBlueprintRounds } from './groupchat-runtime/run/blueprint-rounds.mjs';
export { selectNextRoundSpeakers } from './groupchat-runtime/dialogue/speakers.mjs';
export { checkTermination } from './groupchat-runtime/dialogue/termination.mjs';
export { buildConversationPrompt, buildRolePrompt, buildSystemPromptForSpeaker } from './groupchat-runtime/dialogue/prompts.mjs';
export { executeRound } from './groupchat-runtime/run/execution.mjs';
export { runGroupChat } from './groupchat-runtime/run/run.mjs';
