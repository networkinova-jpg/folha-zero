const test = require('node:test');
const { execFileSync } = require('child_process');
const path = require('path');

test('postgres local: migração idempotente e ataques de isolamento', () => {
  execFileSync('bash', [path.join(__dirname, 'sql', 'run.sh')], { stdio: 'inherit' });
});
