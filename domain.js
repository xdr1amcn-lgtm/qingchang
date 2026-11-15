(function attachDomain(root) {
  function parseCoins(value) {
    const raw = String(value ?? '').trim().toUpperCase().replace(/[,_，\s]/g, '');
    const match = raw.match(/^(-?\d+(?:\.\d+)?)([MK万亿]?)$/);
    if (!match) return 0;
    const factor = ({ M: 1e6, K: 1e3, '万': 1e4, '亿': 1e8 })[match[2]] || 1;
    return Math.max(0, Number(match[1]) * factor);
  }
  function parseOcrCoins(text) {
    const normalized = String(text ?? '').toUpperCase().replace(/[，,]/g, '').replace(/[ＯОO]/g, '0').replace(/[ＭМ]/g, 'M').replace(/[ＫК]/g, 'K');
    const matches = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(M|K|万|亿)?/g)].map(match => ({ value: `${match[1]}${match[2] || ''}`, suffix: match[2] || '', number: Number(match[1]) }));
    const withUnit = matches.find(match => match.suffix && match.number > 0);
    if (withUnit) return withUnit.value;
    if (/[+＋]/.test(normalized)) return '';
    const plain = matches.filter(match => !match.suffix && match.number >= 10).sort((a, b) => b.number - a.number)[0];
    return plain?.value || '';
  }
  function segmentCost(segment) {
    const hasBalances = String(segment.startBalance ?? '').trim() !== '' && String(segment.endBalance ?? '').trim() !== '';
    const usedCoins = hasBalances ? Math.max(0, parseCoins(segment.startBalance) - parseCoins(segment.endBalance)) : 0;
    const coinPerYuan = Math.max(0, Number(segment.coinPerYuan) || 0);
    const coinCost = hasBalances && coinPerYuan ? usedCoins / coinPerYuan : 0;
    const hasSuits = segment.suitUnused!==true && String(segment.suitStart ?? '').trim() !== '' && String(segment.suitEnd ?? '').trim() !== '';
    const hasAmmo = segment.ammoUnused!==true && String(segment.ammoStart ?? '').trim() !== '' && String(segment.ammoEnd ?? '').trim() !== '';
    const suits = hasSuits ? Math.max(0, Number(segment.suitStart) - Number(segment.suitEnd)) : 0;
    const ammo = hasAmmo ? Math.max(0, Number(segment.ammoStart) - Number(segment.ammoEnd)) : 0;
    const suitCost = hasSuits ? suits * Math.max(0, Number(segment.suitPrice) || 0) : 0;
    const ammoCost = hasAmmo ? ammo * Math.max(0, Number(segment.ammoPrice) || 0) : 0;
    return { usedCoins, coinCost, suits, suitCost, ammo, ammoCost, total: coinCost + suitCost + ammoCost };
  }
  function netIncome(order) {
    return (Number(order.income) || 0)
      - (Number(order.expenses) || 0)
      - (order.billingMode==='none'?0:(order.segments || []).reduce((total, segment) => total + segmentCost(segment).total, 0));
  }
  function ratioFromWan(value) { const raw=String(value??'').trim(), n=Number(raw); if(!raw||!Number.isFinite(n)||n<=0||!Number.isFinite(n*10000))throw Error('请输入有效比例，例如 45 表示 1 元兑换 45 万哈夫币'); return Math.round(n*10000*1000000)/1000000; }
  function ratioToWan(value) { return Number(value)>0?Number((Number(value)/10000).toFixed(8)):''; }
  const api = { parseCoins, parseOcrCoins, segmentCost, netIncome, ratioFromWan, ratioToWan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.qingchangDomain = api;
})(typeof window !== 'undefined' ? window : null);
