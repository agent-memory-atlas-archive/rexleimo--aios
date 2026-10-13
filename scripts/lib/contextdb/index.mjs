/* 中文注释：ContextDB barrel，集中导出连续性、交接、门面等跨域消费的能力。 */
export {
  extractTouchedFilesFromText,
  readContinuitySummary,
  writeContinuitySummary,
} from './registry/continuity.mjs';

export {
  evaluateHandoffLineage,
  normalizeHandoffPacket,
  readHandoffPacket,
  renderHandoffInjection,
  writeHandoffPacket,
} from './runtime/handoff.mjs';

export {
  generateFacadeFromSession,
  loadFacade,
} from './runtime/facade.mjs';

export {
  buildExecutionContextPacket,
  evaluateExecutionContextPreflight,
  isExecutionContextMutationDeclared,
  projectContextItems,
  resolveExecutionContextPaths,
  updateExecutionContextExpectedHash,
} from './runtime/execution-context.mjs';
