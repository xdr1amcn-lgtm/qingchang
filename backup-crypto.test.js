const test = require('node:test');
const assert = require('node:assert/strict');
const { encryptBackup, decryptBackup } = require('./backup-crypto');

test('encrypted backups preserve local credentials and screenshot data', () => {
  const data = { version: 1, accounts: [{ account: 'demo', password: 'local-secret' }], orders: [{ screenshot: 'data:image/png;base64,c2NyZWVuc2hvdA==' }] };
  const encrypted = encryptBackup(data, 'strong-pass-123');
  assert.equal(encrypted.includes('local-secret'), false);
  assert.deepEqual(decryptBackup(encrypted, 'strong-pass-123'), data);
});

test('encrypted backups reject incorrect passwords and weak passwords', () => {
  const encrypted = encryptBackup({ version: 1, accounts: [], orders: [] }, 'strong-pass-123');
  assert.throws(() => decryptBackup(encrypted, 'wrong-password'));
  assert.throws(() => encryptBackup({}, 'short'));
});
