# 📈 내 평단가 맞춤형 목표가 매도 & 배당 캘린더 (Stock Target & Dividend Tracker)

> **실시간 국내 주식 시세 연동**, **내 매수 평단가 기반 탈출/익절 목표가 트래커**, **12개월 월별 배당금 캘린더 & 차트**, **뇌동매매 방지 매매 일지**를 제공하는 모던 다크 테마 웹 대시보드입니다.
> **GitHub Pages**를 통해 별도 서버 비용 없이 100% 무료로 배포하고 모바일/PC 어디서나 접속할 수 있습니다.

---

## ✨ 주요 기능

### 1. 💼 내 보유 주식 & 평단가 탈출/익절 관리 (포트폴리오)
- **내 매수 평단가 & 보유 수량 입력**: 총 투자 원금, 현재 평가금, 누적 평가손익 실시간 계산
- **오늘 1일 손익 분리 표시**: 오늘 하루 동안 내 주식으로 벌거나 잃은 금액/등락률 직관적 확인
- **1차(탈출/본전) / 2차(최종 익절) 목표가 도달 트래커**: 목표가 도달 시 화려한 펄스 알림 및 프로그레스 바 게이지
- **분할 매도 전략 메모**: 목표가별 매도 원칙(예: 본전 도달 시 50% 매도 등) 메모 기록

### 2. 📊 오늘 주요 시장 시세 (관심 종목 / Market Watch)
- **금일 실시간 현재가 & 전일 대비 등락률**: 삼성전자, SK하이닉스, 현대차 등 관심 종목의 금일 시세를 평단가와 분리하여 깔끔하게 모니터링
- **장중 실시간 상태 & 네이버 증권 바로가기**

### 3. 📅 12개월 월별 배당 캘린더 & 차트 (Cash Flow)
- **Chart.js 기반 월별 예상 배당금 흐름 그래프**
- **월평균 배당금 & 투자원금 대비 배당수익률(YoC) 자동 계산**
- **1월~12월 배당 타임라인 카드** 및 연중 최고 배당 수령월 하이라이트

### 4. 📝 뇌동매매 방지 매매 일지 & 차트 복기
- **매수 / 매도 / 관망 일지 작성**: 매매 사유, 지지/저항선 차트 복기, 심리 태그(#원칙매매, #뇌동주의 등)
- **매매 유형별 필터링**

### 5. 🔒 데이터 안전 백업 & 복원
- **로컬 스토리지(LocalStorage)** 기반 영구 저장
- **JSON 원클릭 백업 다운로드 & 복원**: 기기를 변경하거나 브라우저 캐시를 삭제해도 데이터 완벽 보존

---

## 🚀 GitHub Pages 배포 방법 (30초 완료)

1. **GitHub 저장소(Repository) 생성**:
   - GitHub(https://github.com)에서 **`New repository`** 클릭
   - 저장소 이름 입력 (예: `stock-target-dividend-app`) -> **Public** 선택 후 `Create repository` 클릭

2. **코드 업로드 (Push)**:
   ```bash
   git init
   git add .
   git commit -m "feat: 첫 배포 - 주식 평단가 목표가 매도 & 배당 대시보드"
   git branch -M main
   git remote add origin https://github.com/<YOUR_GITHUB_ID>/<REPO_NAME>.git
   git push -u origin main
   ```

3. **GitHub Pages 활성화**:
   - GitHub 저장소 상단 **`Settings`** -> 좌측 메뉴 **`Pages`** 클릭
   - **Branch**를 `main` / `/(root)` 로 선택 후 **`Save`** 클릭
   - 1~2분 후 생성되는 **`https://<YOUR_GITHUB_ID>.github.io/<REPO_NAME>/`** 주소로 접속하면 즉시 실행됩니다!

---

## 🛠 기술 스택
- **Frontend**: HTML5, Tailwind CSS (CDN), Lucide Icons, Chart.js
- **API**: Google Apps Script & Naver Finance Real-time Batch Proxy API
- **Deployment**: GitHub Pages (Static Web Hosting)
