# SEO 사이트 분석기

URL을 입력하면 콘텐츠 SEO / 테크니컬 SEO / 검색엔진 친화도 / 속도 최적화 / 보안 권장사항을 점검해주고, 브랜드 키워드로 네이버 블로그·뉴스·카페 발행 현황과 검색량·연관 키워드·검색 트렌드를 조회할 수 있는 웹사이트입니다.

## 배포 방법 (요약)

1. 이 폴더 전체를 GitHub 새 저장소(New repository)에 업로드합니다. ("Add file" → "Upload files"로 드래그 앤 드롭하면 됩니다. `node_modules` 폴더는 없으니 그대로 올리면 됩니다.)
2. https://vercel.com 에서 GitHub 계정으로 로그인 후 "Add New..." → "Project" → 방금 만든 저장소 선택 → "Deploy" 클릭.
3. (브랜드 콘텐츠 발행 현황 / 키워드 분석 기능을 쓰려면) 아래 환경변수 설정 안내대로 Vercel에 네이버 API 키를 등록합니다. 2그룹 중 필요한 것만 등록해도 되고, 등록 안 한 그룹은 해당 기능에서만 안내 문구가 표시돼요.
4. 몇 분 후 생성되는 주소로 접속하면 바로 사용할 수 있습니다.

## 환경변수 설정 — 2개의 서로 다른 네이버 API

이 사이트는 성격이 다른 네이버 API 2가지를 사용해요. **서로 발급 방법이 다르니** 그룹별로 따로 신청해야 합니다.

| 그룹 | 사용하는 기능 | 발급처 |
|---|---|---|
| ① 네이버 API HUB | 브랜드 콘텐츠 발행 현황, 키워드 분석의 콘텐츠 발행량 / 검색 추이(월별 PC·모바일 / 월별 / 요일별 건수) | 네이버 클라우드 플랫폼(NCP) |
| ② 검색광고 API | 키워드 분석의 월간 검색량 · 연관 키워드 | searchad.naver.com |

### ① 네이버 API HUB (검색 API + Search Trend)

브랜드 키워드로 블로그/뉴스/카페 발행 현황을 조회하고, 키워드 분석의 검색 추이(월별 PC·모바일 / 월별 / 요일별 건수)를 조회하는 기능은 모두 이 키 하나로 동작합니다.

⚠️ 네이버가 검색 API를 예전 "네이버 개발자센터"에서 **NAVER API HUB(네이버 클라우드 플랫폼)** 로 옮겼기 때문에, 개발자센터(`developers.naver.com`)에서는 더 이상 "검색" API를 신규로 등록할 수 없습니다. 아래처럼 API HUB에서 발급받아야 합니다.

1. https://www.ncloud.com/product/applicationService/naverApiHub 에서 네이버 클라우드 플랫폼(NCP) 계정으로 로그인/가입합니다. (일반 네이버 아이디와는 별도 가입입니다.)
2. NAVER API HUB 상품을 이용 신청하고, Application 생성 화면에서 블로그/뉴스/카페글 검색 API를 선택합니다.
3. **검색 추이**까지 쓰려면, 같은 Application에서 **Search Trend** 상품도 함께 이용 신청해주세요. 별도의 키가 필요 없이 아래 키 하나로 두 상품이 다 동작해요. (호출 주소: `https://naverapihub.apigw.ntruss.com/search-trend/v1/search`)
4. 발급되는 **Key ID**와 **Key(Secret)** 값을 복사해둡니다.
5. Vercel 프로젝트 → Settings → Environment Variables 에서 아래 두 개를 추가합니다.
   - `NAVER_CLIENT_ID` = 위에서 복사한 Key ID
   - `NAVER_CLIENT_SECRET` = 위에서 복사한 Key(Secret)
   - Environment는 Production/Preview/Development 전부 체크해두면 편해요.
6. 환경변수를 추가한 뒤에는 Deployments 탭 → 가장 최근 배포 옆 "..." 메뉴 → **Redeploy**를 눌러야 반영됩니다. (환경변수만 추가하고 Redeploy를 안 하면 이전 값 그대로 동작해요.)

키를 등록하지 않아도 사이트 자체는 정상 동작하며, 해당 분석 시도 시에만 안내 메시지가 표시됩니다. Search Trend 상품만 빼놓았다면 검색 추이 부분만 안내 문구로 표시되고 나머지는 정상 동작해요.

**검색 추이를 실제 건수로 보여주는 방법**: Search Trend API는 절대 검색량이 아니라 "구간 내 최고치를 100으로 한 상대 비율"만 주기 때문에, 검색광고 API가 주는 절대 검색량(최근 한 달 PC/모바일 건수)을 기준점으로 삼아 같은 요청의 시계열 안에서만 비율을 실제 건수로 환산합니다. 두 API 키가 모두 등록되어 있어야 검색 추이가 "건수"로 표시되고, 검색광고 키가 없으면 이 부분만 안내 문구로 표시돼요.

### ② 검색광고 API (키워드 분석 — 검색량/연관 키워드)

1. https://searchad.naver.com 에 로그인합니다. (검색광고 계정이 없다면 먼저 만들어야 해요. 별도 심사 없이 약관 동의만으로 가입돼요.)
2. 상단 메뉴 **도구 → API 사용 관리**로 들어가 약관에 동의하면 즉시 발급됩니다.
3. 발급되는 **API License(Key)**, **SECRET KEY**, 그리고 화면에 표시되는 **CUSTOMER ID**(광고주 계정 번호, 6~8자리 숫자)를 복사해둡니다.
4. Vercel 프로젝트 → Settings → Environment Variables 에서 아래 세 개를 추가합니다.
   - `NAVER_AD_API_KEY` = API License(Key)
   - `NAVER_AD_SECRET_KEY` = SECRET KEY
   - `NAVER_AD_CUSTOMER_ID` = CUSTOMER ID
5. 추가 후 Redeploy를 눌러야 반영됩니다.

이 키가 없으면 키워드 분석 페이지에서 "월간 검색량"과 "연관 키워드" 부분만 안내 문구로 표시되고, 나머지 기능은 정상 동작해요.

## 키워드 분석 기능에서 제공하지 않는 항목

- **인기 급상승 키워드** — 실시간 급상승 검색어 서비스가 2021년에 종료된 뒤로 관련 공식 API가 없습니다.
- **연령별 · 성별 검색 비율** — Search Trend API가 주는 `ratio`는 "한 번의 요청 안에서" 최고값을 100으로 정규화한 상대값이에요. 연령대나 성별을 나눠 각각 따로 요청한 뒤 그 비율을 합치면 서로 다른 기준(100)을 더하는 셈이라 수치가 틀리게 나옵니다. 검색광고 키워드 도구 화면에는 성별·연령대별 검색 비율이 표시되지만, 이는 공개 API로는 제공되지 않는 내부 데이터로 보입니다. 공개된 API 중에는 여러 그룹을 같은 기준으로 비교할 방법이 없어서, 부정확한 값을 보여주는 대신 이 항목은 제외했습니다.
- **검색결과 웹사이트 영역 TOP10 콘텐츠/사이트 정보**, **PC/모바일 섹션 배치 순서** — 검색결과 화면 자체를 가져오는 공식 API가 없고, 실제 검색결과 페이지를 직접 스크래핑해야 하는데 이는 이용약관 위반 소지가 있고 화면 구조가 바뀌면 바로 깨지기 때문에 제외했습니다.

## 알아두면 좋은 한계

- **월간 콘텐츠 발행량(최근 30일)**: 블로그 검색 API는 한 키워드당 최대 1,000건까지만 페이지를 넘겨 확인할 수 있어요(네이버 검색 API 자체 한도). 최근 30일 이내 발행 건수를 세다가 1,000건까지 다 확인했는데도 30일 경계를 찾지 못하면 "1,000건+"로 표시돼요 — 실제로는 더 많을 수 있지만, API 한도상 그 이상은 정확히 셀 수 없습니다.

## 로컬에서 실행하고 싶다면 (선택, 개발자용)

```bash
npm install
npm run dev
```

http://localhost:3000 에서 확인할 수 있습니다.

## 플레이스 순위 기능 — 설정 방법

"플레이스 순위" 탭은 매장/키워드를 등록하면 매일 한 번씩 네이버 플레이스 검색 결과에서의 순위를 측정해서 기록하는 기능이에요. 등록된 키워드마다 "지금 측정하기" 버튼도 있어서, 하루 배치를 기다리지 않고 그 자리에서 한 번 더 측정을 요청할 수도 있어요. 아래 세 가지를 준비해야 완전히 동작해요.

### 1. Supabase 프로젝트 준비

1. [supabase.com](https://supabase.com)에서 새 프로젝트를 만듭니다 (무료 플랜으로 충분해요).
2. 프로젝트 대시보드의 **SQL Editor**에서 `supabase/schema.sql` 파일 내용을 그대로 붙여넣고 실행하세요. `places`, `place_keywords`, `rank_checks` 테이블과 `place_keyword_latest` 뷰가 만들어져요.
3. 프로젝트 설정(Project Settings → API)에서 다음 값을 확인하세요.
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** (anon key 아님! service role key는 비공개 키예요) → `SUPABASE_SERVICE_ROLE_KEY`

### 2. GitHub Personal Access Token 발급 (「지금 측정하기」 버튼 전용)

매일 자동 측정만 쓸 거라면 이 단계는 건너뛰어도 되지만, 웹 화면의 "지금 측정하기" 버튼을 쓰려면 Vercel이 GitHub Actions 워크플로를 대신 실행시켜 줄 토큰이 필요해요.

1. GitHub 우측 상단 프로필 → **Settings** → 좌측 메뉴 맨 아래 **Developer settings** → **Fine-grained tokens** → **Generate new token**으로 이동합니다.
2. **Repository access**에서 "Only select repositories"를 선택하고, 이 프로젝트 저장소만 선택합니다.
3. **Permissions → Repository permissions**에서 **Actions**를 찾아 **Read and write**로 설정합니다. (다른 권한은 필요 없어요.)
4. 생성된 토큰 값을 복사해둡니다. (한 번만 보여주니 꼭 복사해두세요.)
5. 저장소 이름도 `owner/repo` 형식으로 적어둡니다. (예: 저장소 주소가 `https://github.com/dawoori/seo-geo-analyzer`라면 `dawoori/seo-geo-analyzer`)

### 3. 환경변수 등록

**Vercel** (웹 화면 — 매장/키워드 등록, 결과 조회, 지금 측정하기 버튼용):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` ← 꼭 추가하세요. 이게 없으면 Vercel이 배포할 때마다 필요 없는 Chromium 브라우저를 수백 MB씩 내려받으려고 시도해서 배포가 느려지거나 실패할 수 있어요. (실제 순위 측정은 Vercel이 아니라 GitHub Actions에서 하기 때문에 Vercel에는 브라우저가 필요 없어요.)
- `GITHUB_TOKEN` ← 위 2단계에서 발급한 토큰. **"지금 측정하기" 버튼에만 필요해요.** 등록하지 않아도 매일 자동 측정은 정상 동작하고, 버튼을 눌렀을 때만 안내 메시지가 표시돼요.
- `GITHUB_REPO` ← 위 2단계에서 적어둔 `owner/repo` 값.
- `GITHUB_WORKFLOW_REF` (선택) ← 기본값은 `main`이에요. 배포 기준 브랜치 이름이 다르면 등록하세요.

**GitHub 저장소** (Settings → Secrets and variables → Actions — 실제 크롤링 실행용):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

저장소 Settings → Actions → General에서 Actions 실행이 허용되어 있는지도 확인해주세요.

### 4. 동작 확인

- `.github/workflows/place-rank-check.yml`이 매일 한국시간 오전 6시에 자동으로 등록된 전체 키워드를 실행해요. GitHub 저장소의 **Actions** 탭에서 `place-rank-check` 워크플로를 열어 **Run workflow** 버튼으로 지금 바로 한 번 실행해볼 수도 있어요 (이때는 입력값을 비워두면 전체 키워드가 측정돼요).
- 웹 화면(`/place`)에서 매장을 등록(네이버 플레이스 URL 입력)하고 키워드를 추가한 뒤, 워크플로가 한 번 돌고 나면 현재 순위/전일 순위/변화가 채워져요.
- 키워드 행의 **"지금 측정하기"** 버튼을 누르면 그 키워드 하나만 즉시 측정하도록 GitHub Actions에 요청하고, 화면이 결과를 기다리면서 자동으로 새로고침돼요. **처음 실행**은 캐시가 없어서 `npm install`과 Playwright 브라우저 설치를 새로 하느라 3~5분 정도 걸릴 수 있어요 — 정상이에요. 워크플로에 캐시를 넣어뒀기 때문에 **두 번째 실행부터는 1~2분 정도**로 훨씬 빨라져요. 화면은 최대 8분까지 기다리고, 그래도 결과가 안 오면 "시간 초과"로 표시되는데, 이 경우 GitHub 저장소의 **Actions** 탭에서 실행 로그를 직접 확인해보시면 돼요(에러로 멈췄는지, 아직 큐에서 대기 중인지 알 수 있어요).

### 알아두어야 할 한계 (중요)

- 이 기능은 네이버가 공식적으로 제공하는 API가 아니라 브라우저 자동화(Playwright)로 검색 결과 화면을 직접 읽어오는 방식이에요. **캡차 우회, IP 우회, 자동화 탐지 우회 로직은 의도적으로 넣지 않았어요.** 네이버가 접근을 제한하면 그대로 "접근 제한(blocked)" 상태로 기록되고, 다음 예정된 시간(또는 다음 "지금 측정하기" 요청)에 다시 시도해요.
- `lib/placeRank/PlaywrightPlaceRankProvider.js` 안의 CSS 선택자(`RESULT_ITEM_SELECTOR` 등)는 네이버 플레이스 검색 결과 페이지의 구조를 참고해 작성했지만, 실제 라이브 페이지로 검증하지 못한 상태예요. 처음 실행했을 때 계속 `error` 상태(결과 목록을 못 찾음)가 나온다면, 브라우저 개발자도구로 실제 페이지 구조를 확인하고 이 선택자들을 맞춰주세요. 네이버가 마크업을 바꿀 때마다 다시 손봐야 하는 건 비공식 스크래핑의 구조적인 한계예요.
- "지금 측정하기"는 GitHub Actions 워크플로를 호출만 할 뿐, 실제 측정 자체는 여전히 별도 실행 환경(GitHub Actions)에서 이루어져요. Playwright를 Vercel 요청 안에서 직접 실행하지 않는 이유는 서버리스 환경의 실행시간 제한·콜드스타트 문제 때문이에요 — 그래서 버튼을 눌러도 "즉시"가 아니라 "수십 초~분 단위로 빠르게" 결과가 나오는 구조예요.
- GitHub Actions 무료 플랜은 분당 실행 시간에 한도가 있어요("지금 측정하기"를 아주 자주 누르면 소진될 수 있어요). 개인 프로젝트 수준의 사용량이면 보통 문제 없어요.
- 지금은 로그인/회원 시스템이 없는 1인 전용 도구로 설계했어요. 여러 사용자가 쓰는 서비스로 확장하려면 `places`/`place_keywords` 테이블에 `user_id`를 추가하고 Supabase Row Level Security를 켜야 해요 (스키마 파일에 자리를 잡아뒀어요).
