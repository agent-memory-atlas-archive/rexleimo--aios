#!/usr/bin/env node
import { main } from './lib/memory/contextdb/shell-bridge/entry/main.mjs';

main().catch((err) => {
  console.error(`[contextdb-shell-bridge] fatal: ${err.message}`);
  process.exit(1);
});
