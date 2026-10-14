'use strict';
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = resolve(__dirname, '../..');
const approvedHash = 'f41fd8338988c42fdfdba341da6b26ee487d710776a68ab136e233f403ab6a5c';
const hook = 'node scripts/security/verify-rules.cjs';
function verify(source, config) {
  const hash = createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex');
  assert.equal(hash, approvedHash, 'STOP: rules differ from the approved account release. Separate review is required.');
  assert.equal(config.firestore?.rules, 'firestore.rules', 'STOP: alternate rules path.');
  assert.ok(Array.isArray(config.firestore?.predeploy) && config.firestore.predeploy.includes(hook), 'STOP: deployment guard missing.');
  return hash;
}
if (require.main === module) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--staged'), 'Unsupported arguments.');
  const get = (path) => args.length
    ? execFileSync('git', ['show', ':' + path], { cwd: root, encoding: 'utf8' })
    : readFileSync(resolve(root, path), 'utf8');
  console.log('Safe containment verified: ' + verify(get('firestore.rules'), JSON.parse(get('firebase.json'))));
}
module.exports = { verify, approvedHash, hook };
