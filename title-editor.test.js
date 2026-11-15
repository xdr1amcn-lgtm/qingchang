const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('selected character styles affect the full-size export canvas', () => {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'title-editor.js'), 'utf8'), sandbox);
  const draws = [];
  const transforms = [];
  const ctx = {
    save() {}, restore() {}, clearRect() {}, translate() {}, rotate() {},
    transform(...args) { transforms.push(args); },
    getTransform() { return { transformPoint: ({ x, y }) => ({ x, y }) }; },
    measureText() { return { width: 50 }; },
    strokeText() {}, fillRect() {},
    fillText(char) { draws.push({ char, font: this.font, color: this.fillStyle }); }
  };
  const canvas = { width: 1400, height: 500, getContext: () => ctx };
  const title = {
    text: '甲乙', font: 0, size: 88, spacing: 8, weight: 900,
    colors: ['#111111', '#ff0000'], charStyles: [null, { font: 2, italic: true, outline: 4 }]
  };
  const glyphs = vm.runInContext('drawTitleCanvas', sandbox)(canvas, vm.runInContext('ensureTitleSettings', sandbox)(title));
  assert.equal(draws.length, 2);
  assert.match(draws[0].font, /Qingchang Smiley Sans/);
  assert.match(draws[1].font, /Qingchang Noto Serif SC/);
  assert.equal(draws[1].color, '#ff0000');
  assert.equal(transforms.length, 1);
  assert.deepEqual(Array.from(glyphs, g => g.index), [0, 1]);
});

test('mouse hit testing maps the enlarged preview back to character positions', () => {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'title-editor.js'), 'utf8'), sandbox);
  const hit = vm.runInContext('titleGlyphAtDetailPoint', sandbox);
  const geometry = {
    sx: 200, sy: 100, cropWidth: 1000,
    glyphs: [
      { index: 0, bounds: { left: 300, right: 360, top: 180, bottom: 270 } },
      { index: 1, bounds: { left: 370, right: 430, top: 180, bottom: 270 } }
    ]
  };
  assert.equal(hit(geometry, 1400, 180, 180), 0);
  assert.equal(hit(geometry, 1400, 270, 180), 1);
  assert.equal(hit(geometry, 1400, 1200, 340), -1);
});
