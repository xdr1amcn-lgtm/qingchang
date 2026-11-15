const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCoins, parseOcrCoins, segmentCost, netIncome } = require('./domain');

test('parses game balance suffixes without rounding away M', () => {
  assert.equal(parseCoins('116M'), 116_000_000);
  assert.equal(parseCoins('420K'), 420_000);
  assert.equal(parseCoins('1.5亿'), 150_000_000);
});

test('extracts Haufcoin values from OCR text surrounded by coin icons', () => {
  assert.equal(parseOcrCoins('0 116M 0'), '116M');
  assert.equal(parseOcrCoins('余额 1.25 М'), '1.25M');
  assert.equal(parseOcrCoins('116,000,000'), '116000000');
  assert.equal(parseOcrCoins('0 16 +'), '');
});

test('calculates consumed Haufcoins using the ratio entered by the user', () => {
  const result = segmentCost({ startBalance: '116M', endBalance: '108M', coinPerYuan: 420_000 });
  assert.equal(result.usedCoins, 8_000_000);
  assert.equal(result.coinCost, 8_000_000 / 420_000);
});

test('balance gains and increased item counts create no negative consumption', () => {
  const result = segmentCost({ startBalance: '100M', endBalance: '102M', coinPerYuan: 420_000, suitStart: 1, suitEnd: 3, suitPrice: 5, ammoStart: 100, ammoEnd: 120, ammoPrice: 0.8 });
  assert.equal(result.total, 0);
});

test('does not charge incomplete balances or item counts before the user enters both values', () => {
  const result = segmentCost({ startBalance: '116M', coinPerYuan: 420_000, suitStart: 6, suitPrice: 5, ammoStart: 50, ammoPrice: 0.8 });
  assert.equal(result.total, 0);
});

test('charges each category independently and subtracts costs from order income', () => {
  const result = netIncome({ income: 100, expenses: 3, segments: [{ startBalance: '1M', endBalance: '580K', coinPerYuan: 420_000, suitStart: 2, suitEnd: 1, suitPrice: 5, ammoStart: 10, ammoEnd: 5, ammoPrice: 0.8 }] });
  assert.equal(result, 100 - 3 - 1 - 5 - 4);
});

 test('wan-unit ratio entry preserves legacy rates and computes user supplied pricing',()=>{const D=require('./domain');assert.equal(D.ratioFromWan('45'),450000);assert.equal(D.ratioFromWan('45.5'),455000);assert.equal(D.ratioToWan(450000),45);assert.equal(D.ratioToWan(''), '');assert.throws(()=>D.ratioFromWan(''));assert.throws(()=>D.ratioFromWan('abc'));assert.throws(()=>D.ratioFromWan(0));assert.equal(D.segmentCost({startBalance:'116M',endBalance:'107M',coinPerYuan:D.ratioFromWan(45)}).coinCost,20);});
