// 시험용 도구: index.html의 본 스크립트와 Code.js를 node vm 안에서 가짜 브라우저/GAS 환경으로 실행한다.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
export const CODE_JS = fs.readFileSync(path.join(ROOT, 'Code.js'), 'utf8');
export const APPSSCRIPT = JSON.parse(fs.readFileSync(path.join(ROOT, 'appsscript.json'), 'utf8'));

function mainScript() {
  const blocks = [...INDEX_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  return blocks[blocks.length - 1];
}

function makeElement(id) {
  const classes = new Set();
  return {
    id, innerHTML: '', textContent: '', value: '', style: {}, className: '',
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c), toggle: c => (classes.has(c) ? classes.delete(c) : classes.add(c)) },
    getContext: () => ({}), appendChild() {}, addEventListener() {}, click() {}, reset() {}, setAttribute() {},
    querySelectorAll: () => [], querySelector: () => null,
  };
}

/**
 * 브라우저 흉내 환경을 만든다.
 * opts.localData: localStorage 초기값(객체) / opts.fetch: fetch 대체 함수 / opts.google: google.script.run 흉내
 */
export function loadClient(opts = {}) {
  const els = new Map();
  const store = new Map();
  if (opts.localData !== undefined) store.set('MY_STOCK_APP_DATA_V3', JSON.stringify(opts.localData));
  const toasts = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout: () => 0, clearTimeout() {},
    confirm: () => true, alert() {},
    JSON, Math, Date, Number, String, Array, Object, Set, Map, Promise, isNaN, parseFloat, parseInt, encodeURIComponent,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
    document: {
      getElementById: id => { if (!els.has(id)) els.set(id, makeElement(id)); return els.get(id); },
      createElement: () => makeElement('_new'),
      querySelectorAll: () => [], querySelector: () => null, addEventListener() {},
    },
    fetch: opts.fetch || (() => new Promise(() => {})),
    Chart: class { destroy() {} },
  };
  if (opts.lucide !== false) ctx.lucide = { createIcons() {} };
  if (opts.google) ctx.google = opts.google;
  ctx.window = ctx;
  ctx.window.addEventListener = () => {};
  vm.createContext(ctx);
  vm.runInContext(mainScript(), ctx, { filename: 'index.html<script>' });
  // showToast 기록
  vm.runInContext('(function(){ const orig = showToast; showToast = function(m,t){ __toasts.push(String(m)); return orig(m,t); }; })()', Object.assign(ctx, { __toasts: toasts }));
  return {
    ctx, els, store, toasts,
    run: code => vm.runInContext(code, ctx),
    el: id => ctx.document.getElementById(id),
    saved: () => JSON.parse(store.get('MY_STOCK_APP_DATA_V3') || 'null'),
  };
}

/** google.script.run 흉내. handlers[name](args) 가 {ok:value} 또는 {fail:error}를 돌려준다. */
export function fakeGoogle(handlers) {
  const calls = [];
  const make = () => {
    const runner = { _s: null, _f: null };
    runner.withSuccessHandler = fn => { const r = make(); r._s = fn; r._f = runner._f; return r; };
    runner.withFailureHandler = fn => { const r = make(); r._f = fn; r._s = runner._s; return r; };
    return new Proxy(runner, {
      get(t, prop) {
        if (prop in t) return t[prop];
        return (...args) => {
          calls.push({ name: prop, args });
          const out = handlers[prop] ? handlers[prop](...args) : { ok: undefined };
          if (out && 'fail' in out) { if (t._f) t._f(out.fail); }
          else if (t._s) t._s(out ? out.ok : undefined);
        };
      },
    });
  };
  return { google: { script: { run: make() } }, calls };
}

/** Code.js를 GAS 흉내 환경에서 불러온다. */
export function loadServer(opts = {}) {
  const props = new Map(Object.entries(opts.props || {}));
  const fetches = [];
  const ctx = {
    JSON, Math, Date, Number, String, Array, Object, isNaN, parseFloat, parseInt,
    Logger: { log() {} },
    PropertiesService: {
      getUserProperties: () => ({
        getProperty: k => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => {
          if (opts.limitBytes && Buffer.byteLength(String(v), 'utf8') > opts.limitBytes) throw new Error('Argument too large: value');
          props.set(k, String(v));
        },
      }),
    },
    UrlFetchApp: {
      fetch: url => {
        fetches.push(url);
        if (opts.urlFetch) return opts.urlFetch(url);
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ closePrice: '10,000', compareToPreviousClosePrice: '100', fluctuationsRatio: '1.0', stockName: 'X' }) };
      },
      fetchAll: reqs => reqs.map(r => ctx.UrlFetchApp.fetch(r.url || r)),
    },
    ContentService: { createTextOutput: s => ({ text: s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    HtmlService: { createTemplateFromFile: () => ({ evaluate: () => ({ setTitle() { return this; }, addMetaTag() { return this; }, setXFrameOptionsMode() { return this; } }) }), XFrameOptionsMode: { ALLOWALL: 1 } },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {}, getAll: () => ({}), putAll() {} }) },
  };
  vm.createContext(ctx);
  vm.runInContext(CODE_JS, ctx, { filename: 'Code.js' });
  return { ctx, props, fetches, run: code => vm.runInContext(code, ctx) };
}

export const flush = () => new Promise(r => setImmediate(r));

export function decodeAttr(s) {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
