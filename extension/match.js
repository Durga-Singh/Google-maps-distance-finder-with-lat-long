/* match.js — compares sheet values with text read from Business Manager.
   Pure functions; used by worker.js (importScripts) and testable in Node. */
(function (root) {
  'use strict';
  const STATES = {
    an: 'andaman nicobar islands', ap: 'andhra pradesh', ar: 'arunachal pradesh', as: 'assam', br: 'bihar', ch: 'chandigarh',
    cg: 'chhattisgarh', dl: 'delhi', ga: 'goa', gj: 'gujarat', hr: 'haryana', hp: 'himachal pradesh', jk: 'jammu kashmir',
    jh: 'jharkhand', ka: 'karnataka', kl: 'kerala', la: 'ladakh', mp: 'madhya pradesh', mh: 'maharashtra', mn: 'manipur',
    ml: 'meghalaya', mz: 'mizoram', nl: 'nagaland', od: 'odisha', or: 'odisha', py: 'puducherry', pb: 'punjab', rj: 'rajasthan',
    sk: 'sikkim', tn: 'tamil nadu', tg: 'telangana', ts: 'telangana', tr: 'tripura', up: 'uttar pradesh', uk: 'uttarakhand',
    ut: 'uttarakhand', wb: 'west bengal'
  };
  const WORDS = { rd: 'road', st: 'street', ave: 'avenue', nr: 'near', opp: 'opposite', bldg: 'building', apt: 'apartment',
    no: 'number', sec: 'sector', hwy: 'highway', blk: 'block', flr: 'floor', orissa: 'odisha', pondicherry: 'puducherry',
    bengaluru: 'bangalore', mumbai: 'bombay', chennai: 'madras', kolkata: 'calcutta', gurugram: 'gurgaon', uttaranchal: 'uttarakhand' };
  const STOP = new Set(['the', 'of', 'and', 'in', 'at', 'a']);

  function cleanStateDisplay(value) {
    return String(value ?? '').trim().replace(/^(?:(?:state|province|administrative area|region)\s*(?::|\s)\s*)+/i,'').trim();
  }
  function normalizeState(value) {
    const s = cleanStateDisplay(value);
    return /^(?:n\.?\s*c\.?\s*t\.?\s*(?:of\s+)?delhi|national capital territory(?:\s+of)?\s+delhi)$/i.test(s) ? 'Delhi' : s;
  }
  function tokens(text, opts = {}) {
    if (opts.state) text = normalizeState(text);
    let s = String(text ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ').replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim();
    let t = s ? s.split(' ') : [];
    if (opts.state && t.length === 1 && STATES[t[0]]) t = STATES[t[0]].split(' ');
    t = t.map(w => WORDS[w] || w).filter(w => !STOP.has(w));
    return t.flatMap(w => w.split(' '));
  }
  // Returns 'blank' | 'match' | 'partial' | 'mismatch' for one sheet value vs the observed text.
  function compare(sheetValue, observed, opts = {}) {
    const want = tokens(sheetValue, opts);
    if (!want.length) return 'blank';
    const have = new Set(tokens(observed, { state: !!opts.state }));
    // Allow observed state abbreviations too (e.g. page shows "TN" and sheet says "Tamil Nadu").
    if (opts.state) for (const w of tokens(observed).slice()) if (STATES[w]) STATES[w].split(' ').forEach(x => have.add(x));
    if (opts.digits) { // postal code: digits only, allow "600 001" style spacing
      const d = String(sheetValue).replace(/\D/g, '');
      if (!d) return 'blank';
      const re = new RegExp('(^|\\D)' + (d.length > 3 ? d.slice(0, 3) + '\\s?' + d.slice(3) : d) + '(\\D|$)');
      return re.test(String(observed)) ? 'match' : 'mismatch';
    }
    const hit = want.filter(w => have.has(w)).length, ratio = hit / want.length;
    if (ratio === 1) return 'match';
    return ratio >= (opts.partial ?? 0.6) ? 'partial' : 'mismatch';
  }
  // True when two values are the same after normalising case, punctuation, Rd/Road, TN/Tamil Nadu etc.
  function same(a, b, opts = {}) {
    if (opts.digits) return String(a ?? '').replace(/\D/g, '') === String(b ?? '').replace(/\D/g, '');
    const x = tokens(a, opts), y = tokens(b, opts);
    return x.length === y.length && x.every((w, i) => w === y[i]);
  }
  const RANK = { match: 4, partial: 3, mismatch: 2, not_found: 1, blank: 0 };
  const best = (a, b) => (RANK[a] ?? -1) >= (RANK[b] ?? -1) ? a : b;

  // sources: array of observed-text strings (list row, editor fields). Empty -> 'not_found'.
  function checkProfile(row, sources) {
    const texts = sources.filter(s => s && s.trim());
    const one = (value, opts) => {
      if (!String(value ?? '').trim()) return 'blank';
      if (!texts.length) return 'not_found';
      return texts.map(t => compare(value, t, opts)).reduce(best, 'mismatch');
    };
    return {
      name: one(row.name, { partial: 0.6 }),
      address: one(row.address, { partial: 0.6 }),
      locality: one(row.locality, { partial: 0.99 }),
      admin: one(row.admin, { state: true, partial: 0.99 }),
      postal: one(row.postal, { digits: true })
    };
  }
  // Street address lines: line 1 is used alone while it fits in `limit` characters. Only when line 1 is longer
  // does the overflow move into line 2 and then line 3 (breaking at a comma or space, never mid-word where avoidable).
  // Text already in the sheet's line 2 / line 3 is kept after the overflow. Returns {lines:[l1,l2,l3], tooLong, overflowed}.
  function splitAddress(a1, a2, a3, limit = 80, maxLines = 3) {
    const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
    const lines = [clean(a1), clean(a2), clean(a3)];
    while(lines.length<maxLines) lines.push('');
    let overflowed = false;
    for (let i = 0; i < maxLines-1; i++) {
      const s = lines[i];
      if (s.length <= limit) continue;
      overflowed = true;
      const win = s.slice(0, limit + 1);
      let end = win.lastIndexOf(' ');
      if (end <= 0) return {lines, tooLong:true, overflowed}; // never split or lose a word
      const head = s.slice(0, end).trimEnd(); // retain every comma unless Google rejects it
      const tail = s.slice(end).trimStart();
      lines[i] = head;
      lines[i + 1] = lines[i + 1] ? tail + ' ' + lines[i + 1] : tail;
    }
    return { lines, tooLong: lines.some(line=>line.length > limit), overflowed };
  }
  function commaFreeAddress(a1, a2, a3, limit = 79) {
    const text = [a1,a2,a3].map(v=>String(v ?? '').replace(/,/g,' ')).join(' ');
    return splitAddress(text,'','',limit);
  }
  // Applied only after Google's specific validation rejection, never to ordinary addresses.
  function fiveItemAddress(a1, a2, a3, limit = 79) {
    const parts = [a1,a2,a3].map(v=>String(v ?? '').trim()).filter(Boolean)
      .join(', ').split(',').map(v=>v.replace(/\s+/g,' ').trim()).filter(Boolean);
    return {...splitAddress(parts.slice(0,5).join(', '),'','',limit), removed:parts.slice(5)};
  }
  function fullAddressRetry(source, limit = 79) {
    return splitAddress(source.map(v=>String(v??'').replace(/,/g,' ')).join(' '),'','',limit,5);
  }
  function lastResortAddress(source, limit = 79) {
    const parts=source.map(v=>String(v??'').trim()).filter(Boolean).join(', ')
      .split(',').map(v=>v.replace(/\s+/g,' ').trim()).filter(Boolean);
    const kept=parts.slice(0,5), removed=parts.slice(5);
    let plan=fullAddressRetry(kept,limit);
    // Drop trailing whole parts only if the first five still exceed the field capacity.
    while(plan.tooLong && kept.length>1) {
      removed.unshift(kept.pop());plan=fullAddressRetry(kept,limit);
    }
    return {...plan,removed};
  }
  root.ProfileMatch = { compare, checkProfile, tokens, same, splitAddress, normalizeState, cleanStateDisplay, commaFreeAddress, fiveItemAddress, fullAddressRetry, lastResortAddress };
  if (typeof module !== 'undefined') module.exports = root.ProfileMatch;
})(typeof globalThis !== 'undefined' ? globalThis : self);
