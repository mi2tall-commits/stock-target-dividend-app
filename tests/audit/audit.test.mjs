// 2026-11-06 점검에서 확인한 문제를 재현하는 시험. 실행: node --test tests/audit/
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadClient, loadServer, fakeGoogle, flush, decodeAttr, INDEX_HTML, CODE_JS, APPSSCRIPT } from './harness.mjs';

const stock = (over = {}) => ({ id: 's1', name: '테스트', code: '111111', buyPrice: 10000, quantity: 10, target1Price: 0, target2Price: 0, dividendMonths: [], ...over });

// ---------- 1. 저장형 XSS (onclick 속성) / 클라이언트에서 부를 수 있는 초기화 함수 ----------
test('[F1] 종목 id에 따옴표가 있어도 onclick에서 스크립트가 실행되지 않는다', () => {
  const evil = "x');__pwned=1;//";
  const c = loadClient({ localData: { stocks: [stock({ id: evil })], journals: [{ id: evil, date: '2026-01-01', content: 'a' }], watchlist: [{ id: evil, name: 'w', code: '222222' }] } });
  c.run('loadLocalData()');
  const html = [...c.els.values()].map(e => e.innerHTML).join('\n');
  const handlers = [...html.matchAll(/onclick="([^"]*)"/g)].map(m => decodeAttr(m[1]))
    .filter(h => /^(editStock|deleteStock|openMinuteChartModal|openJournalModalForStock|deleteWatchlist|deleteJournal)\(/.test(h));
  assert.ok(handlers.length >= 6, 'onclick 핸들러를 찾지 못함: ' + handlers.length);
  for (const h of handlers) {
    const got = [];
    const sandbox = { __pwned: 0 };
    for (const fn of ['editStock', 'deleteStock', 'openMinuteChartModal', 'openJournalModalForStock', 'deleteWatchlist', 'deleteJournal']) sandbox[fn] = a => got.push(a);
    try { vm.runInNewContext(h, sandbox); } catch { /* 문법 오류면 실행되지 않은 것으로 본다 */ }
    assert.equal(sandbox.__pwned, 0, '주입된 코드가 실행됨: ' + h);
    assert.equal(got[0], evil, '인자가 원래 id와 다름: ' + h);
  }
});

test('[F1] 전체 초기화 함수는 클라이언트(google.script.run)에서 부를 수 없다(이름 끝 _)', () => {
  const s = loadServer();
  assert.equal(typeof s.ctx.resetAllAppData, 'undefined', 'resetAllAppData가 공개 함수로 남아 있음');
  assert.equal(typeof s.ctx.resetAllAppData_, 'function');
});

test('[F1] (주인 결정 필요) 웹앱이 로그인 없이 소유자 권한으로 열리지 않는다', { todo: '접근 설정 변경은 GitHub Pages 시세 기능에 영향 — 주인 결정 대기' }, () => {
  assert.notEqual(APPSSCRIPT.webapp.access, 'ANYONE_ANONYMOUS');
});

// ---------- 2. 클라우드 저장 실패인데 "저장되었습니다" ----------
test('[F2] GitHub Pages에서 클라우드 저장이 실패하면 실패 경고를 보여 준다', async () => {
  const fetch = () => Promise.resolve({ json: () => Promise.reject(new SyntaxError('Unexpected token <')) });
  const c = loadClient({ localData: { stocks: [stock()], journals: [], watchlist: [] }, fetch });
  c.run('loadLocalData(); persistData()');
  await flush(); await flush();
  const last = c.toasts[c.toasts.length - 1];
  assert.match(last, /클라우드.*실패|이 기기에만/, '마지막 알림: ' + last);
});

test('[F2] GAS 화면에서 saveAppData가 서버 오류로 실패하면 실패 경고를 보여 준다', () => {
  const g = fakeGoogle({ loadAppData: () => ({ ok: null }), saveAppData: () => ({ fail: new Error('Argument too large') }) });
  const c = loadClient({ localData: { stocks: [stock()], journals: [], watchlist: [] }, google: g.google });
  c.run('loadLocalData(); persistData()');
  const last = c.toasts[c.toasts.length - 1];
  assert.match(last, /클라우드.*실패|이 기기에만/, '마지막 알림: ' + last);
});

test('[회귀] GAS 화면에서 클라우드 저장이 성공하면 성공으로 알린다', () => {
  const g = fakeGoogle({ saveAppData: () => ({ ok: { success: true } }) });
  const c = loadClient({ localData: { stocks: [stock()], journals: [], watchlist: [] }, google: g.google });
  c.run('loadLocalData(); persistData()');
  assert.ok(g.calls.some(x => x.name === 'saveAppData'));
  assert.doesNotMatch(c.toasts[c.toasts.length - 1], /실패/);
});

test('[F2] (주인 결정 필요) Code.js에 doPost가 있다', { todo: 'doPost는 인증 방식(토큰) 결정 후 추가' }, () => {
  assert.match(CODE_JS, /function doPost\s*\(/);
});

// ---------- 3. 종목 0개면 일지·관심종목까지 샘플로 덮어씀 ----------
test('[F3] 보유 종목을 모두 지워도 저장된 매매일지·관심종목이 그대로 남는다', () => {
  const journals = Array.from({ length: 5 }, (_, i) => ({ id: 'j' + i, date: '2026-10-0' + (i + 1), content: '내 일지 ' + i }));
  const watchlist = [{ id: 'w1', name: '내관심', code: '333333' }];
  const c = loadClient({ localData: { stocks: [], journals, watchlist } });
  c.run('loadLocalData()');
  const d = c.run('JSON.parse(JSON.stringify(appData))');
  assert.equal(d.stocks.length, 0, '지운 종목이 샘플로 되살아남');
  assert.equal(d.journals.length, 5, '일지가 샘플로 바뀜');
  assert.equal(d.watchlist[0].name, '내관심');
});

test('[회귀] 처음 실행(저장값 없음)이면 기본 데이터를 보여 준다', () => {
  const c = loadClient();
  c.run('loadLocalData()');
  assert.ok(c.run('appData.stocks.length') > 0);
});

test('[F3] 빠진 배열은 빈 배열로 채운다', () => {
  const c = loadClient({ localData: { stocks: [stock()] } });
  c.run('loadLocalData()');
  assert.equal(c.run('Array.isArray(appData.journals) && Array.isArray(appData.watchlist)'), true);
});

// ---------- 4. 오래된 클라우드 값이 새 로컬 값을 덮어씀 ----------
test('[F4] 서버 값이 로컬보다 오래되었으면 로컬 값을 유지한다', () => {
  const local = { stocks: [stock({ name: '새로운' })], journals: [{ id: 'jn', content: '최근 일지' }], watchlist: [], updatedAt: 2000 };
  const server = { stocks: [stock({ name: '예전' })], journals: [], watchlist: [], updatedAt: 1000 };
  const g = fakeGoogle({ loadAppData: () => ({ ok: server }) });
  const c = loadClient({ localData: local, google: g.google });
  c.run('loadData()');
  assert.equal(c.run('appData.stocks[0].name'), '새로운');
  assert.equal(c.saved().journals.length, 1);
});

test('[F4] 서버 값이 더 새로우면 서버 값으로 바꾼다', () => {
  const local = { stocks: [stock({ name: '예전' })], journals: [], watchlist: [], updatedAt: 1000 };
  const server = { stocks: [stock({ name: '새로운' })], journals: [], watchlist: [], updatedAt: 2000 };
  const g = fakeGoogle({ loadAppData: () => ({ ok: server }) });
  const c = loadClient({ localData: local, google: g.google });
  c.run('loadData()');
  assert.equal(c.run('appData.stocks[0].name'), '새로운');
});

test('[회귀] 둘 다 시각 정보가 없는 예전 데이터면 지금처럼 서버 값을 쓴다', () => {
  const local = { stocks: [stock({ name: '로컬' })], journals: [], watchlist: [] };
  const server = { stocks: [stock({ name: '서버' })], journals: [], watchlist: [] };
  const g = fakeGoogle({ loadAppData: () => ({ ok: server }) });
  const c = loadClient({ localData: local, google: g.google });
  c.run('loadData()');
  assert.equal(c.run('appData.stocks[0].name'), '서버');
});

test('[F4] 저장할 때 시각(updatedAt)을 기록하고 서버도 그 시각을 돌려준다', () => {
  const c = loadClient({ localData: { stocks: [stock()], journals: [], watchlist: [] } });
  c.run('loadLocalData(); persistData()');
  assert.ok(Number(c.saved().updatedAt) > 0, '로컬에 updatedAt 없음');
  const s = loadServer();
  s.ctx.saveAppData({ stocks: [stock()], journals: [], watchlist: [], updatedAt: 12345 });
  assert.equal(s.ctx.loadAppData().updatedAt, 12345);
});

test('[F4] 서버 저장이 9KB 한도에 걸리면 성공으로 보고하지 않고 시각도 올리지 않는다', () => {
  const s = loadServer({ limitBytes: 9 * 1024 });
  s.ctx.saveAppData({ stocks: [stock()], journals: [], watchlist: [], updatedAt: 1 });
  const journals = Array.from({ length: 30 }, (_, i) => ({ id: 'j' + i, content: '가'.repeat(150) }));
  let res, threw = false;
  try { res = s.ctx.saveAppData({ stocks: [stock()], journals, watchlist: [], updatedAt: 2 }); } catch { threw = true; }
  assert.ok(threw || (res && res.success === false), '실패를 성공으로 보고함');
  assert.equal(s.ctx.loadAppData().updatedAt, 1, '실패했는데 서버 시각이 올라감');
});

// ---------- 5. 시세 실패 시 가짜 가격 ----------
test('[F5] 시세 조회가 실패하면 관심종목에 가짜 50,000원을 보여 주지 않는다', async () => {
  const c = loadClient({ localData: { stocks: [stock()], journals: [], watchlist: [{ id: 'w', name: '삼성', code: '005930' }] }, fetch: () => Promise.reject(new Error('network')) });
  c.run('loadLocalData()');
  await flush(); await flush();
  const html = c.el('watchlist-card-container').innerHTML;
  assert.doesNotMatch(html, /50,000원/);
  assert.match(html, /조회 실패/);
});

test('[F5] 서버가 종목별 success:false를 주면 보유종목 현재가를 평단가로 꾸미지 않는다', async () => {
  const fetch = () => Promise.resolve({ json: () => Promise.resolve({ '111111': { success: false, symbol: '111111' } }) });
  const c = loadClient({ localData: { stocks: [stock()], journals: [], watchlist: [] }, fetch });
  c.run('loadLocalData()');
  await flush(); await flush();
  assert.match(c.el('stock-card-container').innerHTML, /조회 실패/);
});

test('[회귀] 시세가 정상이면 현재가·손익을 계산해 보여 준다', async () => {
  const fetch = () => Promise.resolve({ json: () => Promise.resolve({ '111111': { success: true, currentPrice: 12000, todayChangePrice: 500, todayChangeRate: 4.3, prevClosePrice: 11500 } }) });
  const c = loadClient({ localData: { stocks: [stock()], journals: [], watchlist: [] }, fetch });
  c.run('loadLocalData()');
  await flush(); await flush();
  const html = c.el('stock-card-container').innerHTML;
  assert.match(html, /12,000원/);
  assert.match(html, /\+20,000원/); // (12000-10000)*10
  assert.doesNotMatch(html, /조회 실패/);
});

// ---------- 6. 시세 프록시 종목 수 제한 없음 ----------
test('[F6] 시세 요청 한 번에 처리하는 종목 수를 제한하고 중복을 없앤다', () => {
  const s = loadServer();
  const symbols = Array.from({ length: 1000 }, (_, i) => String(100000 + (i % 500)));
  s.ctx.doGet({ parameter: { action: 'price', symbols: symbols.join(',') } });
  assert.ok(s.fetches.length <= 200, 'UrlFetch 호출 수: ' + s.fetches.length);
});

test('[회귀] 시세 요청은 보낸 종목코드를 키로 결과를 돌려준다', () => {
  const s = loadServer();
  const out = JSON.parse(s.ctx.doGet({ parameter: { action: 'price', symbols: '005930,000660,005930' } }).text);
  assert.deepEqual(Object.keys(out).sort(), ['000660', '005930']);
  assert.equal(out['005930'].success, true);
});

test('[회귀] 정상 종목 시세를 읽어 하락 부호를 맞게 계산한다', () => {
  const s = loadServer({ urlFetch: url => ({ getResponseCode: () => 200, getContentText: () => url.includes('integration') ? JSON.stringify({ totalInfos: [{ code: 'accumulatedTradingVolume', value: '1,234' }] }) : JSON.stringify({ closePrice: '9,900', compareToPreviousClosePrice: '100', fluctuationsRatio: '1.0', compareToPreviousPrice: { name: 'FALLING' }, stockName: '가' }) }) });
  const r = s.ctx.fetchStockPrice('005930');
  assert.equal(r.success, true);
  assert.equal(r.currentPrice, 9900);
  assert.equal(r.todayChangePrice, -100);
  assert.equal(r.prevClosePrice, 10000);
  assert.equal(r.todayVolume, '1,234');
});

// ---------- 7. 영문 섞인 종목코드 ----------
test('[F7] 영문이 섞인 6자리 종목코드(0091C0)도 시세를 조회한다', () => {
  const s = loadServer();
  assert.equal(s.ctx.fetchStockPrice('0091C0').success, true);
  assert.equal(s.ctx.fetchStockPrice('0091c0').success, true);
  assert.ok(s.fetches.some(u => u.includes('/0091C0/')));
});

test('[회귀] 잘못된 종목코드는 외부 호출 없이 실패한다', () => {
  const s = loadServer();
  assert.equal(s.ctx.fetchStockPrice('12345').success, false);
  assert.equal(s.fetches.length, 0);
});

// ---------- 8. 실제 보유 내역 하드코딩 ----------
test('[F8] (주인 결정 필요) 공개 코드에 실제 평단가·수량이 없다', { todo: '기본 데이터 교체는 주인 결정 대기' }, () => {
  assert.doesNotMatch(INDEX_HTML, /buyPrice: 19760/);
});

// ---------- 9. CDN 버전 고정 ----------
test('[F9] 외부 라이브러리 주소에 버전이 고정되어 있다', () => {
  assert.doesNotMatch(INDEX_HTML, /lucide@latest/);
  assert.match(INDEX_HTML, /cdn\.jsdelivr\.net\/npm\/chart\.js@\d+\.\d+\.\d+/);
});

test('[F9] 아이콘 라이브러리가 안 불러와져도 화면 그리기가 멈추지 않는다', () => {
  const c = loadClient({ localData: { stocks: [stock()], journals: [], watchlist: [] }, lucide: false });
  assert.doesNotThrow(() => c.run('loadLocalData()'));
  assert.match(c.el('stock-card-container').innerHTML, /테스트/);
});

// ---------- 기본 동작 회귀 ----------
test('[회귀] 금액·퍼센트·HTML 이스케이프 형식', () => {
  const c = loadClient();
  assert.equal(c.run('formatKRW(1234567.4)'), '1,234,567원');
  assert.equal(c.run('formatPercent(3.456)'), '+3.46%');
  assert.equal(c.run(`escapeHtml('<a href="x">\\'</a>')`), '&lt;a href=&quot;x&quot;&gt;&#39;&lt;/a&gt;');
});

test('[회귀] 서버 저장 후 불러오면 같은 데이터가 나온다', () => {
  const s = loadServer();
  const data = { stocks: [stock()], journals: [{ id: 'j', content: '일지' }], watchlist: [{ id: 'w', code: '005930' }] };
  s.ctx.saveAppData(data);
  const back = s.ctx.loadAppData();
  assert.deepEqual(JSON.parse(JSON.stringify([back.stocks, back.journals, back.watchlist])), [data.stocks, data.journals, data.watchlist]);
});
