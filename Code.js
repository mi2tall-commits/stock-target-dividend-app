/**
 * 내 평단가 맞춤형 '목표가 매도 & 배당 캘린더' 대시보드 백엔드
 * Google Apps Script Web App
 */

function doGet(e) {
  // GitHub Pages 등 외부 웹에서 실시간 시세 API로 호출 시 JSON 응답 반환
  if (e && e.parameter && e.parameter.action === 'price') {
    var symbols = normalizeSymbolList_(e.parameter.symbols || '');
    var results = fetchBatchStockPrices(symbols);
    return ContentService.createTextOutput(JSON.stringify(results))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // GitHub Pages 등 외부 웹에서 당일 분봉 차트 데이터 조회 시 JSON 응답 반환
  if (e && e.parameter && e.parameter.action === 'minutechart') {
    var result = fetchMinuteChartData(e.parameter.symbol || '');
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var template = HtmlService.createTemplateFromFile('index');
  var htmlOutput = template.evaluate()
    .setTitle('내 평단가 맞춤형 목표가 매도 & 배당 캘린더')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return htmlOutput;
}

// 네이버 금융 모바일 API를 통한 국내 주식 실시간/최신 시세 조회
function fetchStockPrice(symbol) {
  if (!symbol) return { success: false, message: '종목 코드가 없습니다.' };
  var cleanSymbol = symbol.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');

  // KRX 단축코드는 숫자 6자리 외에 영문이 섞인 6자리(예: 0091C0)도 있다
  if (/^[0-9A-Z]{6}$/.test(cleanSymbol)) {
    try {
      var url = 'https://m.stock.naver.com/api/stock/' + cleanSymbol + '/basic';
      var response = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      
      if (response.getResponseCode() === 200) {
        var data = JSON.parse(response.getContentText());
        var priceStr = (data.closePrice || '0').replace(/,/g, '');
        var price = parseFloat(priceStr) || 0;
        
        var diffStr = (data.compareToPreviousClosePrice || '0').replace(/,/g, '');
        var diff = parseFloat(diffStr) || 0;
        var rate = parseFloat(data.fluctuationsRatio || '0') || 0;
        
        var sign = 1;
        if (data.compareToPreviousPrice && data.compareToPreviousPrice.name === 'FALLING') {
          sign = -1;
        } else if (data.compareToPreviousPrice && data.compareToPreviousPrice.name === 'RISING') {
          sign = 1;
        } else if (diff < 0 || rate < 0) {
          sign = -1;
        }
        
        var changePrice = Math.abs(diff) * sign;
        var changeRate = Math.abs(rate) * sign;
        var prevClose = price - changePrice;

        // 당일 누적 거래량 / 거래대금 조회 (실패해도 시세 조회 자체는 성공 처리)
        var todayVolume = '';
        var todayTradingValue = '';
        try {
          var infoUrl = 'https://m.stock.naver.com/api/stock/' + cleanSymbol + '/integration';
          var infoResponse = UrlFetchApp.fetch(infoUrl, {
            muteHttpExceptions: true,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
          });
          if (infoResponse.getResponseCode() === 200) {
            var infoData = JSON.parse(infoResponse.getContentText());
            var totalInfos = infoData.totalInfos || [];
            for (var i = 0; i < totalInfos.length; i++) {
              if (totalInfos[i].code === 'accumulatedTradingVolume') {
                todayVolume = totalInfos[i].value;
              } else if (totalInfos[i].code === 'accumulatedTradingValue') {
                todayTradingValue = totalInfos[i].value;
              }
            }
          }
        } catch (e2) {
          Logger.log('Naver integration fetch error for ' + cleanSymbol + ': ' + e2);
        }

        return {
          success: true,
          symbol: cleanSymbol,
          name: data.stockName || cleanSymbol,
          currentPrice: price,
          todayChangePrice: changePrice, // 오늘 전일대비 변동금액 (+/-)
          todayChangeRate: changeRate,   // 오늘 전일대비 등락률 (%)
          prevClosePrice: prevClose,     // 전일 종가
          marketStatus: data.marketStatus || 'OPEN',
          todayVolume: todayVolume,             // 당일 누적 거래량 (주, 콤마 포맷 문자열)
          todayTradingValue: todayTradingValue, // 당일 누적 거래대금 (콤마/조·억 포맷 문자열)
          updatedAt: new Date().toLocaleTimeString('ko-KR')
        };
      }
    } catch (e) {
      Logger.log('Naver stock fetch error for ' + cleanSymbol + ': ' + e);
    }
  }

  return { success: false, symbol: cleanSymbol, message: '시세를 불러올 수 없습니다.' };
}

// 당일 1분봉(분 단위 체결가/거래량) 조회 - 네이버 fchart API 활용
function fetchMinuteChartData(symbol) {
  if (!symbol) return { success: false, message: '종목 코드가 없습니다.' };
  var cleanSymbol = symbol.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');

  if (!/^[0-9A-Z]{6}$/.test(cleanSymbol)) {
    return { success: false, symbol: cleanSymbol, message: '유효하지 않은 종목 코드입니다.' };
  }

  try {
    var url = 'https://fchart.stock.naver.com/sise.nhn?symbol=' + cleanSymbol + '&timeframe=minute&count=1000&requestType=0';
    var response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });

    if (response.getResponseCode() !== 200) {
      return { success: false, symbol: cleanSymbol, message: '분봉 데이터를 불러올 수 없습니다.' };
    }

    var xml = response.getContentText();
    var itemRegex = /<item data="([^"]+)"\s*\/>/g;
    var match;
    var rows = [];
    while ((match = itemRegex.exec(xml)) !== null) {
      var parts = match[1].split('|');
      var dateTime = parts[0]; // YYYYMMDDHHmm
      var close = parseFloat(parts[4]);
      var cumVolume = parseFloat(parts[5]);
      if (dateTime && !isNaN(close)) {
        rows.push({ dateTime: dateTime, close: close, cumVolume: isNaN(cumVolume) ? 0 : cumVolume });
      }
    }

    if (rows.length === 0) {
      return { success: false, symbol: cleanSymbol, message: '분봉 데이터가 없습니다.' };
    }

    // 가장 최근 데이터의 날짜(=최근 거래일, 당일) 기준으로 필터링
    var latestDate = rows[rows.length - 1].dateTime.substring(0, 8);
    var todayRows = rows.filter(function(r) { return r.dateTime.substring(0, 8) === latestDate; });

    var items = [];
    var prevCum = 0;
    for (var j = 0; j < todayRows.length; j++) {
      var r = todayRows[j];
      var hh = r.dateTime.substring(8, 10);
      var mm = r.dateTime.substring(10, 12);
      var minuteVolume = Math.max(0, r.cumVolume - prevCum);
      prevCum = r.cumVolume;
      items.push({
        time: hh + ':' + mm,
        price: r.close,
        volume: minuteVolume
      });
    }

    return {
      success: true,
      symbol: cleanSymbol,
      date: latestDate,
      items: items
    };
  } catch (e) {
    Logger.log('Naver minute chart fetch error for ' + cleanSymbol + ': ' + e);
    return { success: false, symbol: cleanSymbol, message: '분봉 데이터를 불러오는 중 오류가 발생했습니다.' };
  }
}

// 로그인 없이 부를 수 있는 시세 주소이므로, 한 번에 처리하는 종목 수를 제한한다.
// (종목 1개당 UrlFetch 2회. 제한이 없으면 요청 한 번으로 일일 할당량·6분 실행 한도를 다 쓸 수 있다)
var MAX_PRICE_SYMBOLS = 60;

function normalizeSymbolList_(raw) {
  var seen = {};
  var out = [];
  var parts = String(raw).split(',');
  for (var i = 0; i < parts.length && out.length < MAX_PRICE_SYMBOLS; i++) {
    var s = parts[i].trim();
    if (!s || seen[s]) continue;
    seen[s] = true;
    out.push(s);
  }
  return out;
}

// 여러 종목 일괄 시세 갱신
function fetchBatchStockPrices(symbols) {
  var results = {};
  if (!symbols || !Array.isArray(symbols)) return results;
  
  for (var i = 0; i < symbols.length; i++) {
    var s = symbols[i];
    results[s] = fetchStockPrice(s);
  }
  return results;
}

// 데이터 영구 저장 키
var STORAGE_KEY_PORTFOLIO = 'STOCK_APP_PORTFOLIO_V3';
var STORAGE_KEY_JOURNAL = 'STOCK_APP_JOURNAL_V3';
var STORAGE_KEY_WATCHLIST = 'STOCK_APP_WATCHLIST_V3';
var STORAGE_KEY_UPDATED_AT = 'STOCK_APP_UPDATED_AT_V3';
// PropertiesService 값 1개당 한도는 9KB. 넘으면 아무것도 쓰지 않고 실패를 알린다.
var MAX_PROPERTY_BYTES = 9000;

function utf8Bytes_(str) {
  return encodeURIComponent(str).replace(/%[0-9A-F]{2}/g, 'x').length;
}

function getInitialSampleData() {
  return {
    stocks: [
      {
        id: 'stock_1',
        name: '금호건설',
        code: '002990',
        currency: 'KRW',
        buyPrice: 19760,     // 내 실제 매수 평단가
        quantity: 660,        // 내 실제 보유 수량
        target1Price: 19500,  // 1차 목표가 (본전 탈출)
        target2Price: 22000,  // 2차 목표가 (익절)
        target1Memo: '평단가 19,500원 본전 탈출 (50% 분할 매도)',
        target2Memo: '전고점 22,000원 도달 시 전량 익절 마무리',
        dividendPerShare: 500,
        dividendMonths: [4],
        memo: '저평가 건설주 배당 및 수주 반등 기대'
      },
      {
        id: 'stock_2',
        name: '제이엘케이',
        code: '322510',
        currency: 'KRW',
        buyPrice: 6617,       // 내 실제 매수 평단가
        quantity: 286,        // 내 실제 보유 수량
        target1Price: 8000,   // 1차 목표가
        target2Price: 12000,  // 2차 목표가
        target1Memo: '1차 저항선 8,000원 도달 시 원금 회수 절반 매도',
        target2Memo: 'AI 의료 FDA 승인 모멘텀 12,000원 전량 익절',
        dividendPerShare: 0,
        dividendMonths: [],
        memo: 'AI 의료 뇌졸중 솔루션 해외 진출 모멘텀'
      }
    ],
    watchlist: [
      { id: 'watch_1', name: '삼성전자', code: '005930', memo: '반도체 대표 대장주' },
      { id: 'watch_2', name: 'SK하이닉스', code: '000660', memo: 'HBM AI 메모리 선도주' },
      { id: 'watch_3', name: '현대차', code: '005380', memo: '완성차 대표 / 밸류업 & 배당' }
    ],
    journals: [
      {
        id: 'j_1',
        date: '2026-08-20',
        stockName: '금호건설',
        code: '002990',
        type: 'BUY',
        price: 16500,
        quantity: 50,
        reason: '바닥 지지 확인 후 평단가(19,760원) 낮추기 위한 분할 매수',
        sentiment: 'GOOD'
      },
      {
        id: 'j_2',
        date: '2026-08-10',
        stockName: '제이엘케이',
        code: '322510',
        type: 'BUY',
        price: 6617,
        quantity: 286,
        reason: '의료 AI 급락 후 60일선 지지라인 반등 매수',
        sentiment: 'GOOD'
      }
    ]
  };
}

function loadAppData() {
  var props = PropertiesService.getUserProperties();
  var rawPortfolio = props.getProperty(STORAGE_KEY_PORTFOLIO);
  var rawJournal = props.getProperty(STORAGE_KEY_JOURNAL);
  var rawWatchlist = props.getProperty(STORAGE_KEY_WATCHLIST);
  
  if (!rawPortfolio) {
    var initial = getInitialSampleData();
    props.setProperty(STORAGE_KEY_PORTFOLIO, JSON.stringify(initial.stocks));
    props.setProperty(STORAGE_KEY_JOURNAL, JSON.stringify(initial.journals));
    props.setProperty(STORAGE_KEY_WATCHLIST, JSON.stringify(initial.watchlist));
    return initial;
  }
  
  return {
    stocks: JSON.parse(rawPortfolio || '[]'),
    watchlist: JSON.parse(rawWatchlist || '[]'),
    journals: JSON.parse(rawJournal || '[]'),
    updatedAt: Number(props.getProperty(STORAGE_KEY_UPDATED_AT)) || 0
  };
}

function saveAppData(data) {
  var props = PropertiesService.getUserProperties();
  var writes = [];
  if (data.stocks) writes.push([STORAGE_KEY_PORTFOLIO, JSON.stringify(data.stocks), '보유 종목']);
  if (data.watchlist) writes.push([STORAGE_KEY_WATCHLIST, JSON.stringify(data.watchlist), '관심 종목']);
  if (data.journals) writes.push([STORAGE_KEY_JOURNAL, JSON.stringify(data.journals), '매매 일지']);

  // 쓰기 전에 크기부터 확인한다(일부만 저장되는 일을 줄이기 위해)
  for (var i = 0; i < writes.length; i++) {
    var size = utf8Bytes_(writes[i][1]);
    if (size > MAX_PROPERTY_BYTES) {
      throw new Error(writes[i][2] + ' 데이터가 클라우드 저장 한도(9KB)를 넘었습니다: ' + size + ' bytes');
    }
  }
  for (var j = 0; j < writes.length; j++) {
    props.setProperty(writes[j][0], writes[j][1]);
  }
  // 모든 값이 저장된 뒤에만 저장 시각을 올린다
  var updatedAt = Number(data.updatedAt) || new Date().getTime();
  props.setProperty(STORAGE_KEY_UPDATED_AT, String(updatedAt));
  return { success: true, updatedAt: updatedAt, timestamp: new Date().toISOString() };
}

// 전체 초기 데이터 리셋 함수
// 이름 끝의 '_' 때문에 google.script.run(브라우저)에서는 부를 수 없고, 편집기에서만 실행할 수 있다.
function resetAllAppData_() {
  var initial = getInitialSampleData();
  var props = PropertiesService.getUserProperties();
  props.setProperty(STORAGE_KEY_PORTFOLIO, JSON.stringify(initial.stocks));
  props.setProperty(STORAGE_KEY_JOURNAL, JSON.stringify(initial.journals));
  props.setProperty(STORAGE_KEY_WATCHLIST, JSON.stringify(initial.watchlist));
  return initial;
}

