/* 中文注释：plan 命令参数解析 */
import { Command } from 'commander';
import { isHelpDisplay, toUsageError } from '../../commander/passthrough.mjs';

function collectOptionValue(value, previous = []) {
  return [...(Array.isArray(previous) ? previous : []), String(value || '')];
}

const PLAN_CLI = new Command()
  .name('plan')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(false)
  .allowExcessArguments(true)
  .option('--title <text>', 'Plan title')
  .option('--task <text>', 'Task / objective text')
  .option('--objective <text>', 'Objective text')
  .option('--status <status>', 'Plan/task status')
  .option('--note <text>', 'Optional status note')
  .option('--client <id>', 'Client id', 'all')
  .option('--session <id>', 'Client session id for continuation matching')
  .option('--policy-mode <adaptive|strict>', 'Workflow policy mode')
  .option('--dry-run', 'Evaluate without persisting a planned artifact')
  // 中文注释：双账声明。已有非终态活动计划时，planned 默认复用那本账；要开新工单必须显式声明。
  .option('--new-work-item', 'Declare a distinct new work item instead of reusing the active plan')
  // 中文注释：`plan start --work-item <id>` 是“同一个工单只建一本账”的身份声明；
  // 身份按规范化 id 比较，绝不比较 objective 文本。
  .option('--work-item <id>', 'Canonical work-item id for plan start; an existing ledger is reused, not duplicated')
  .option('--source <text>', 'Source label')
  .option('--force', 'Force (e.g. force done / replace links)')
  .option('--message <text>', 'User message for auto-gate')
  // 中文注释：声明通道。策略层绝不从文本推断 intent，因此这里只负责把用户的显式声明原样传下去；
  // 未知取值由 workflow-policy 以 explicit-intent-unknown 拒绝（fail closed），本层不维护白名单副本。
  .option('--explicit-intent <value>', 'Explicit workflow disposition declaration for auto-gate')
  .option('--task-id <id>', 'Task id for plan task')
  .option('--acceptance <text>', 'Task acceptance criteria')
  .option('--context <ref[:reason]>', 'Required context declaration; repeat to add more', collectOptionValue, [])
  .option('--target <path>', 'Declared task target; repeat to add more', collectOptionValue, [])
  .option('--allow-write <glob>', 'Allowed write glob; repeat to add more', collectOptionValue, [])
  .option('--propose-context', 'Derive context candidates from task targets and codemap')
  .option('--confirm-context-candidates', 'Human-confirm the current context candidate proposal')
  .option('--candidate-ref <ref>', 'Candidate ref to confirm; repeat to select a subset', collectOptionValue, [])
  .option('--confirmed-by <text>', 'Human confirmation label')
  .option('--kind <command|path|test|note>', 'Evidence kind')
  .option('--value <text>', 'Evidence value')
  .option('--activation <id>', 'Rex capability activation id')
  .option('--command-token <token>', 'Current Rex Provider Command execution token')
  .option('--evidence-kind <kind>', 'Rex capability evidence kind')
  .option('--evidence-ref <ref>', 'Rex capability evidence artifact or command ref')
  .option('--testability-file <path>', 'Typed Rex testability decision JSON file')
  .option('--requirements-file <path>', 'Typed Rex requirements decision JSON file')
  .option('--wayfinder-file <path>', 'Typed Rex Wayfinder artifact JSON file')
  .option('--planning-file <path>', 'Typed Rex Delivery Ticket JSON file')
  .option('--workspace <path>', 'Workspace root')
  .option('--html', 'Also write HTML plan review board')
  .option('--json', 'JSON output')
  .option('--format <text|json|html|both>', 'Output format');

export function parsePlanArgs(argv) {
  const rest = argv.slice(1);
  const help = rest.includes('-h') || rest.includes('--help');
  // 中文注释：第一个非 flag 参数就是子命令名，未识别的名字保留原样，由 ops 层的
  // `unknown plan subcommand` 拒绝。旧代码把它悄悄换成 status，于是
  // `plan status --status done`（写入口其实是 set-status）与拼错的子命令都会
  // 读到只读视图并 exit 0：写请求被静默丢弃，账目状态停在 executing 无人发现。
  // 声明通道不猜语义——未知输入 fail closed。
  const firstPositional = rest[0];
  const declaresSubcommand = Boolean(firstPositional) && !String(firstPositional).startsWith('-');
  const subcommand = declaresSubcommand ? String(firstPositional) : 'status';
  // 中文注释：不再在本层维护子命令白名单副本——词汇表归 owner（ops 层的分支集），
  // 本层只负责把声明的子命令名原样传下去。
  const sub = subcommand;
  if (help) {
    return {
      mode: 'help',
      help: true,
      command: 'plan',
      options: { subcommand: sub },
    };
  }
  let parseArgv = declaresSubcommand ? rest.slice(1) : rest;
  // plan task <id> --status done
  let positionalTaskId = '';
  if (sub === 'task' && parseArgv[0] && !String(parseArgv[0]).startsWith('-')) {
    positionalTaskId = String(parseArgv[0]);
    parseArgv = parseArgv.slice(1);
  }

  try {
    const parsed = PLAN_CLI.parse(parseArgv, { from: 'user' });
    const flags = parsed.opts();
    return {
      mode: help ? 'help' : 'command',
      help,
      command: 'plan',
      options: {
        subcommand: sub,
        title: flags.title,
        task: flags.task || flags.message,
        taskId: flags.taskId || positionalTaskId,
        taskTitle: flags.title,
        objective: flags.objective,
        message: flags.message || flags.task,
        status: flags.status,
        note: flags.note,
        acceptance: flags.acceptance,
        contextRequirements: Array.isArray(flags.context) ? flags.context : [],
        targets: Array.isArray(flags.target) ? flags.target : [],
        allowedWrites: Array.isArray(flags.allowWrite) ? flags.allowWrite : [],
        proposeContext: Boolean(flags.proposeContext),
        confirmContextCandidates: Boolean(flags.confirmContextCandidates),
        candidateRefs: Array.isArray(flags.candidateRef) ? flags.candidateRef : [],
        confirmedBy: flags.confirmedBy ? String(flags.confirmedBy).trim() : '',
        kind: flags.kind,
        value: flags.value,
        activationId: flags.activation,
        commandToken: flags.commandToken,
        evidenceKind: flags.evidenceKind,
        evidenceRef: flags.evidenceRef,
        testabilityFile: flags.testabilityFile ? String(flags.testabilityFile).trim() : '',
        requirementsFile: flags.requirementsFile ? String(flags.requirementsFile).trim() : '',
        wayfinderFile: flags.wayfinderFile ? String(flags.wayfinderFile).trim() : '',
        planningFile: flags.planningFile ? String(flags.planningFile).trim() : '',
        client: flags.client,
        sessionId: flags.session,
        policyMode: flags.policyMode,
        dryRun: Boolean(flags.dryRun),
        newWorkItem: Boolean(flags.newWorkItem),
        workItem: typeof flags.workItem === 'string' ? flags.workItem : null,
        source: flags.source,
        explicitIntent: flags.explicitIntent ? String(flags.explicitIntent).trim() : '',
        workspaceRoot: flags.workspace ? String(flags.workspace).trim() : '',
        force: Boolean(flags.force),
        html: Boolean(flags.html),
        json: Boolean(flags.json),
        format: flags.format || (flags.json ? 'json' : ''),
      },
    };
  } catch (error) {
    // 中文注释（2026-10-27 P0）：裸 catch 会把 commander 对未知 option 的拒绝也降级成 help，
    // 于是「报错了但退 0」。只有 help/version 展示能当 help；其余一律当用法错误上传。
    if (!isHelpDisplay(error)) throw toUsageError(error, { command: 'plan' });
    return {
      mode: 'help',
      help: true,
      command: 'plan',
      options: { subcommand: 'status' },
    };
  }
}
