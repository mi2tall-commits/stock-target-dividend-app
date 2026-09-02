/**
 * 내 평단가 맞춤형 '목표가 매도 & 배당 캘린더' 대시보드 백엔드
 * Google Apps Script Web App
 */

function doGet(e) {
  // GitHub Pages 등 외부 웹에서 실시간 시세 API로 호출 시 JSON 응답 반환
  if (e && e.parameter && e.parameter.action === 'price') {
    var symbols = (e.parameter.symbols || '').split(',').filter(function(s) { return s.trim(); });
    var results = fetchBatchStockPrices(symbols);
    return ContentService.createTextOutput(JSON.stringify(results))
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
  var cleanSymbol = symbol.trim().replace(/[^0-9a-zA-Z]/g, '');
  
  if (/^\d{6}$/.test(cleanSymbol)) {
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
        
        return {
          success: true,
          symbol: cleanSymbol,
          name: data.stockName || cleanSymbol,
          currentPrice: price,
          todayChangePrice: changePrice, // 오늘 전일대비 변동금액 (+/-)
          todayChangeRate: changeRate,   // 오늘 전일대비 등락률 (%)
          prevClosePrice: prevClose,     // 전일 종가
          marketStatus: data.marketStatus || 'OPEN',
          updatedAt: new Date().toLocaleTimeString('ko-KR')
        };
      }
    } catch (e) {
      Logger.log('Naver stock fetch error for ' + cleanSymbol + ': ' + e);
    }
  }
  
  return { success: false, symbol: cleanSymbol, message: '시세를 불러올 수 없습니다.' };
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

function getInitialSampleData() {
  return {
    stocks: [
      {
        id: 'stock_1',
        name: '금호건설',
        code: '002990',
        currency: 'KRW',
        buyPrice: 19500,     // 내 평단가 (19,500원)
        quantity: 300,        // 보유 수량 (300주)
        target1Price: 19500,  // 1차 목표가 (본전 탈출)
        target2Price: 22000,  // 2차 목표가 (익절 목표)
        target1Memo: '평단가 19,500원 본전 탈출 (보유 비중 50% 분할 매도)',
        target2Memo: '전고점 22,000원 도달 시 전량 익절 마무리',
        dividendPerShare: 500, // 주당 배당금 (원)
        dividendMonths: [4],   // 4월 배당
        memo: '저평가 건설주 배당 및 수주 반등 기대'
      },
      {
        id: 'stock_2',
        name: '제이엘케이',
        code: '322510',
        currency: 'KRW',
        buyPrice: 6600,       // 내 평단가 (6,600원)
        quantity: 1000,       // 보유 수량 (1000주)
        target1Price: 7500,   // 1차 목표가 (+13.6%)
        target2Price: 9000,   // 2차 목표가 (+36.4%)
        target1Memo: '1차 저항선 7,500원 도달 시 원금 회수 절반 매도',
        target2Memo: 'AI 의료 FDA 승인 모멘텀 9,000원 전량 익절',
        dividendPerShare: 0,
        dividendMonths: [],
        memo: 'AI 의료 뇌졸중 솔루션 해외 진출 모멘텀'
      }
    ],
    watchlist: [
      {
        id: 'watch_1',
        name: '삼성전자',
        code: '005930',
        memo: '반도체 대장주 / 시장 지수 영향'
      },
      {
        id: 'watch_2',
        name: 'SK하이닉스',
        code: '000660',
        memo: 'HBM AI 메모리 선도주'
      },
      {
        id: 'watch_3',
        name: '현대차',
        code: '005380',
        memo: '자동차 대표주 / 밸류업 & 배당'
      }
    ],
    journals: [
      {
        id: 'j_1',
        date: '2026-08-20',
        stockName: '금호건설',
        code: '002990',
        type: '매수',
        price: 16500,
        quantity: 50,
        reason: '바닥 지지 확인 후 평단가(19,500원) 낮추기 위한 3차 분할 매수',
        chartMemo: '일봉상 쌍바닥 형성, 거래량 점증 추세 확인. 16,000원 손절선 잡고 진입.',
        sentiment: '원칙매매'
      },
      {
        id: 'j_2',
        date: '2026-08-10',
        stockName: '제이엘케이',
        code: '322510',
        type: '매수',
        price: 6600,
        quantity: 500,
        reason: '의료 AI 급락 후 60일선 지지라인 반등 매수',
        chartMemo: '60일 이평선 지지 확인 후 양봉 전환 시점에 분할 매수.',
        sentiment: '계획진입'
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
    journals: JSON.parse(rawJournal || '[]')
  };
}

function saveAppData(data) {
  var props = PropertiesService.getUserProperties();
  if (data.stocks) {
    props.setProperty(STORAGE_KEY_PORTFOLIO, JSON.stringify(data.stocks));
  }
  if (data.watchlist) {
    props.setProperty(STORAGE_KEY_WATCHLIST, JSON.stringify(data.watchlist));
  }
  if (data.journals) {
    props.setProperty(STORAGE_KEY_JOURNAL, JSON.stringify(data.journals));
  }
  return { success: true, timestamp: new Date().toISOString() };
}

// 전체 초기 데이터 리셋 함수
function resetAllAppData() {
  var initial = getInitialSampleData();
  var props = PropertiesService.getUserProperties();
  props.setProperty(STORAGE_KEY_PORTFOLIO, JSON.stringify(initial.stocks));
  props.setProperty(STORAGE_KEY_JOURNAL, JSON.stringify(initial.journals));
  props.setProperty(STORAGE_KEY_WATCHLIST, JSON.stringify(initial.watchlist));
  return initial;
}

