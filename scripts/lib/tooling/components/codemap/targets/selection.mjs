import { resolveClientSelection } from '../../../../foundation/clients/registry.mjs';

export function normalizeClientList(client = 'all') {
  try {
    return resolveClientSelection(client);
  } catch {
    throw new Error(`Unsupported codemap client: ${client}`);
  }
}
