const crypto = require('node:crypto');

function decryptPayload(password, salt, iv, tag, ciphertext) {
  const key = crypto.scryptSync(String(password), salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function encryptBackup(data, password) {
  if (typeof password !== 'string' || password.length < 8) throw new Error('备份密码至少需要 8 位');
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(password, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return JSON.stringify({ format: 'qingchang-backup-v1', salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: ciphertext.toString('base64') });
}

function decryptBackup(raw, password) {
  const parsed = JSON.parse(raw);
  if (parsed.format !== 'qingchang-backup-v1') throw new Error('这不是轻场的加密备份文件');
  const clear = decryptPayload(password, Buffer.from(parsed.salt, 'base64'), Buffer.from(parsed.iv, 'base64'), Buffer.from(parsed.tag, 'base64'), Buffer.from(parsed.data, 'base64'));
  const data = JSON.parse(clear.toString('utf8'));
  if (!data || data.version !== 1 || !Array.isArray(data.accounts) || !Array.isArray(data.orders)) throw new Error('备份内容不完整或版本不支持');
  return data;
}

module.exports = { encryptBackup, decryptBackup };
