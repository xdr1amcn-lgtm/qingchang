const test = require('node:test');
const assert = require('node:assert/strict');
const { buildNip } = require('./nvidia-integration');

function decode(options) {
  const buffer = buildNip({ executable: 'C:\\Games\\DeltaForceClient-Win64-Shipping.exe', ...options });
  assert.equal(buffer[0], 0xff);
  assert.equal(buffer[1], 0xfe);
  return buffer.subarray(2).toString('utf16le');
}

test('主播方案将驱动全局配置和游戏专用 K 模型分开', () => {
  const xml = decode({ preset: 'clarity', model: 'K' });
  const [global, game] = [...xml.matchAll(/<Profile>[\s\S]*?<\/Profile>/g)].map(x => x[0]);
  assert.match(global, /<ProfileName>Base Profile<\/ProfileName>/);
  assert.match(global, /<SettingID>13510289<\/SettingID><SettingValue>0<\/SettingValue>/);
  assert.doesNotMatch(global, /283385345/);
  assert.match(game, /<ProfileName>Delta Force<\/ProfileName>/);
  assert.match(game, /DeltaForceClient-Win64-Shipping\.exe/);
  assert.match(game, /<SettingID>283385345<\/SettingID><SettingValue>1<\/SettingValue>/);
  assert.match(game, /<SettingID>283385331<\/SettingID><SettingValue>11<\/SettingValue>/);
});

test('陪玩方案写入性能优先目标值和 C 模型', () => {
  const xml = decode({ preset: 'performance', model: 'C' });
  assert.match(xml, /<SettingID>13510289<\/SettingID><SettingValue>20<\/SettingValue>/);
  assert.match(xml, /<SettingID>283385331<\/SettingID><SettingValue>3<\/SettingValue>/);
});

test('不接受未知预设或游戏程序', () => {
  assert.throws(() => buildNip({ preset: 'unknown', model: 'K', executable: 'C:\\game.exe' }));
  assert.throws(() => buildNip({ preset: 'clarity', model: 'K', executable: 'C:\\game.txt' }));
});
