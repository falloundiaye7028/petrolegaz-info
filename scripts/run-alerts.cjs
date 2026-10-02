'use strict';
const { dispatchOne } = require('../server/alert-dispatch.cjs');
const { sources } = require('../server/alert-sources.cjs');
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--send') || args.length > 1) {
  console.error('Usage: node scripts/run-alerts.cjs [--send]');
  process.exitCode = 1;
} else {
  dispatchOne({ ...sources(), send: args[0] === '--send' }).then(result => {
    console.log(JSON.stringify(result)); // State/count only, never email, token or credentials.
    if (['not_configured', 'unavailable', 'reconciliation_required'].includes(result.state)) process.exitCode = 1;
  }).catch(() => { console.error('Dispatch unavailable'); process.exitCode = 1; });
}
