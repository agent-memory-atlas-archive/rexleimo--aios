import { buildMemoryReport, renderMemoryReport } from '../../../care/report.mjs';
import { usageError } from '../../core/shared.mjs';

export async function handleMemoReportCommand({ rest = [], workspaceRoot, io }) {
  const usage = 'Usage: memo report [--json]';
  let json = false;
  for (const arg of rest) {
    if (arg === '--json') json = true;
    else throw usageError(usage);
  }
  const report = await buildMemoryReport(workspaceRoot, { now: new Date(), env: process.env });
  io.log(json ? JSON.stringify(report, null, 2) : renderMemoryReport(report));
  return true;
}
