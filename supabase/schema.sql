-- 네이버 플레이스 순위 추적 기능 — Supabase 스키마
-- Supabase 대시보드의 SQL Editor에서 이 파일 내용을 그대로 실행하면 테이블이 생성됩니다.
--
-- 설계 메모:
--  - 이 프로젝트는 현재 로그인/회원 시스템이 없는 단일 사용자(본인) 도구를 전제로 설계했습니다.
--    나중에 여러 사용자가 쓰는 서비스로 확장하려면 각 테이블에 user_id 컬럼과
--    Row Level Security(RLS) 정책을 추가하면 됩니다. (아래에 자리만 잡아뒀어요.)
--  - place_id는 업체명 문자열이 아니라, 네이버 플레이스 URL에서 추출한 고유 식별자입니다.
--    (예: https://m.place.naver.com/restaurant/1234567890/home → "1234567890")
--    동명 매장이 여러 개 있어도 이 값으로 정확히 구분합니다.

create extension if not exists "pgcrypto";

-- 등록된 매장(내 매장)
create table if not exists places (
  id uuid primary key default gen_random_uuid(),
  -- user_id uuid references auth.users(id), -- 다중 사용자로 확장 시 사용
  name text not null,                -- 사용자가 붙인 매장 이름 (예: "OO식당")
  naver_place_id text not null,      -- 네이버 플레이스 고유 식별자 (문자열 매칭 금지, 이 값으로만 매칭)
  naver_place_url text,              -- 참고용 원본 URL
  created_at timestamptz not null default now(),
  unique (naver_place_id)
);

-- 추적할 키워드 (매장 1개에 여러 키워드 등록 가능)
create table if not exists place_keywords (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references places(id) on delete cascade,
  keyword text not null,             -- 예: "강남역 맛집"
  search_location text,              -- 검색 기준 위치(좌표 또는 지역명). null이면 기본 위치 사용
  device text not null default 'mobile' check (device in ('mobile', 'pc')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (place_id, keyword, device)
);

-- 순위 측정 이력 (매일 누적 — 절대 덮어쓰지 않고 계속 insert)
create table if not exists rank_checks (
  id uuid primary key default gen_random_uuid(),
  place_keyword_id uuid not null references place_keywords(id) on delete cascade,
  place_id uuid not null references places(id) on delete cascade, -- 조회 편의를 위한 비정규화
  keyword text not null,             -- 측정 시점의 키워드 스냅샷 (나중에 키워드 텍스트가 바뀌어도 이력이 안 깨지도록)
  search_location text,
  device text not null,
  measured_at timestamptz not null default now(),
  status text not null check (status in ('ok', 'not_found', 'blocked', 'error')),
  rank integer,                      -- status='ok'일 때만 값이 있음. 순위를 못 찾았거나 오류면 null
  max_rank_checked integer,          -- 몇 위까지 확인했는지 (not_found일 때 "적어도 이 순위 밖" 의미로 사용)
  error_message text,                -- status가 blocked/error일 때 원인 기록
  raw_top_results jsonb,             -- 디버깅용: 확인한 상위 결과 스냅샷 [{placeId, name, rank}, ...]
  request_id text,                   -- "지금 측정하기" 버튼이 보낸 요청의 고유 ID. 이 값으로 어느 요청의
                                      -- 결과인지 정확히 매칭한다(측정 시각 비교 방식은 쓰지 않음).
                                      -- 매일 자동 배치처럼 버튼 요청이 아닌 경우는 null.
  created_at timestamptz not null default now()
);

create index if not exists idx_rank_checks_keyword_time
  on rank_checks (place_keyword_id, measured_at desc);

create index if not exists idx_rank_checks_request_id
  on rank_checks (request_id);

create index if not exists idx_place_keywords_active
  on place_keywords (is_active);

-- ⚠️ 이미 스키마를 실행해서 테이블이 만들어져 있는 상태라면(기존 사용자),
-- 위 "create table if not exists"는 이미 있는 테이블을 건드리지 않으므로 request_id 컬럼이
-- 추가되지 않습니다. 그런 경우 아래 한 줄만 SQL Editor에서 따로 실행해주세요:
--   alter table rank_checks add column if not exists request_id text;
--   create index if not exists idx_rank_checks_request_id on rank_checks (request_id);

-- 특정 키워드의 "현재 순위"와 "전일 순위"를 바로 조회할 수 있는 뷰.
-- (measured_at 기준 가장 최근 값 = 현재, 그 이전 값 = 전일로 취급합니다.
--  정확히 "어제 날짜"가 아니라 "그 이전 측정값"이라는 점에 주의하세요 — 측정이 하루에 한 번이라는
--  전제(GitHub Actions 매일 실행)에서는 사실상 동일합니다.)
create or replace view place_keyword_latest as
select
  pk.id as place_keyword_id,
  pk.place_id,
  pk.keyword,
  pk.search_location,
  pk.device,
  pk.is_active,
  latest.rank as current_rank,
  latest.status as current_status,
  latest.measured_at as current_measured_at,
  prev.rank as previous_rank,
  prev.status as previous_status,
  prev.measured_at as previous_measured_at
from place_keywords pk
left join lateral (
  select rank, status, measured_at
  from rank_checks rc
  where rc.place_keyword_id = pk.id
  order by measured_at desc
  limit 1
) latest on true
left join lateral (
  select rank, status, measured_at
  from rank_checks rc
  where rc.place_keyword_id = pk.id
  order by measured_at desc
  offset 1 limit 1
) prev on true;

-- RLS는 기본적으로 꺼둡니다(단일 사용자 전제). 다중 사용자로 확장할 때 아래처럼 켜고
-- user_id 기반 정책을 추가하세요.
-- alter table places enable row level security;
-- alter table place_keywords enable row level security;
-- alter table rank_checks enable row level security;

-- ============================================================================
-- "키워드 분석" 기능 — 키워드 하나로 노출되는 업체 목록을 순위/이름/카테고리/주소로
-- 보여주는 기능(경쟁사 "애드로그"의 키워드 분석 화면 참고, 2026-09-30 추가)
--
-- 위의 place_keywords/rank_checks(특정 매장을 매일 추적)와는 성격이 달라서 —
-- "키워드를 검색하면 그 자리에서 결과를 보여주는" 온디맨드 조회예요 — 별도 테이블로
-- 뒀습니다. 요청 1건 = 결과 스냅샷 1행입니다.
--
-- 방문자수/블로그 수/저장수는 업체마다 상세페이지를 하나씩 열어야 확인 가능한 정보라
-- (목록 페이지에는 없음) 이번 버전에서는 의도적으로 제외했습니다 — 필요해지면 나중에
-- results jsonb 안에 필드를 추가하는 방식으로 확장할 수 있어요.
create table if not exists keyword_place_lists (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,          -- 이 값으로 어느 요청의 결과인지 정확히 매칭 (place_rank_check와 동일한 방식)
  keyword text not null,
  device text not null check (device in ('mobile', 'pc')),
  max_rank integer not null,         -- 사용자가 선택한 조회 개수 (50/100/200)
  status text not null check (status in ('ok', 'blocked', 'error')),
  error_message text,
  results jsonb,                     -- [{rank, placeId, name, category, address, isAd}, ...]
  requested_at timestamptz not null default now()
);

create index if not exists idx_keyword_place_lists_request_id
  on keyword_place_lists (request_id);

-- alter table keyword_place_lists enable row level security; -- 다중 사용자로 확장 시

-- ============================================================================
-- "네이버 쇼핑 분석" 기능 (2026-09-30 추가)
--
-- 두 가지 하위 기능을 지원합니다:
--  1) 네이버 쇼핑 키워드 분석 — 등록한 키워드를 매일 자동으로 검사해서 노출 상품
--     스냅샷을 계속 쌓고, 최신 스냅샷과 그 이전 스냅샷을 비교해 순위/가격 변동
--     화살표(▲▼)를 보여줍니다(플레이스 순위 기능과 동일한 "등록 + 매일 자동 실행" 방식).
--  2) 네이버 쇼핑 순위 체크 — 키워드와 특정 상품(URL/ID)을 입력하면 그 자리에서 1회
--     조회해서 광고 영역/광고 제외 영역 중 선택한 쪽에서 몇 위인지 보여줍니다
--     (등록 없이 매번 온디맨드로 조회 — keyword_place_lists와 동일한 방식).

-- 매일 자동으로 추적할 쇼핑 키워드
create table if not exists shopping_keywords (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  max_rank integer not null default 50 check (max_rank in (50, 100, 200)),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (keyword)
);

-- 쇼핑 키워드 분석 스냅샷 (매일 누적 — 절대 덮어쓰지 않고 계속 insert).
-- 상품 하나하나가 아니라 "그 시점의 전체 노출 목록"을 결과 하나(jsonb)로 저장합니다 —
-- 전일 대비 순위/가격 변동은 화면에서 최신 스냅샷과 그 이전 스냅샷을 상품 ID 기준으로
-- 매칭해서 계산합니다(rank_checks의 place_keyword_latest 뷰와 같은 아이디어를, 상품이
-- 여러 개인 목록이라 SQL 뷰 대신 API 코드에서 처리합니다).
create table if not exists shopping_keyword_snapshots (
  id uuid primary key default gen_random_uuid(),
  shopping_keyword_id uuid not null references shopping_keywords(id) on delete cascade,
  keyword text not null,              -- 측정 시점의 키워드 스냅샷
  max_rank integer not null,
  measured_at timestamptz not null default now(),
  status text not null check (status in ('ok', 'blocked', 'error')),
  error_message text,
  results jsonb,                      -- [{rank, isAd, contentsGrp, name, image, price, category,
                                       --   mallName, sellerCount, rating, reviewCount, zzimCount,
                                       --   purchaseText, productUrl, catalogNvMid, nvMid, chnlProdNo}, ...]
  request_id text,                    -- "지금 분석하기" 버튼 요청과 매칭 (매일 자동 배치는 null)
  created_at timestamptz not null default now()
);

create index if not exists idx_shopping_keyword_snapshots_kw_time
  on shopping_keyword_snapshots (shopping_keyword_id, measured_at desc);

create index if not exists idx_shopping_keyword_snapshots_request_id
  on shopping_keyword_snapshots (request_id);

create index if not exists idx_shopping_keywords_active
  on shopping_keywords (is_active);

-- 등록된 쇼핑 키워드의 "최신 분석 상태"를 바로 조회하는 뷰 (place_keyword_latest와 같은 역할).
-- 상품별 순위/가격 변동(전일 대비)은 상품이 여러 개인 배열(jsonb)이라 SQL 뷰가 아니라
-- API 코드(pages/api/shopping-keyword/results.js)에서 최신·이전 스냅샷을 상품 ID 기준으로
-- 매칭해서 계산합니다 — 이 뷰는 등록 목록 화면에 보여줄 요약 정보만 제공합니다.
create or replace view shopping_keyword_latest as
select
  sk.id as shopping_keyword_id,
  sk.keyword,
  sk.max_rank,
  sk.is_active,
  latest.status as current_status,
  latest.measured_at as current_measured_at,
  latest.error_message as current_error_message,
  case when latest.results is not null then jsonb_array_length(latest.results) else null end as current_item_count
from shopping_keywords sk
left join lateral (
  select status, measured_at, error_message, results
  from shopping_keyword_snapshots s
  where s.shopping_keyword_id = sk.id
  order by measured_at desc
  limit 1
) latest on true;

-- 쇼핑 순위 체크 (등록 없이 요청마다 1행 — keyword_place_lists와 동일한 온디맨드 방식)
create table if not exists shopping_rank_checks (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  keyword text not null,
  product_id_input text not null,     -- 사용자가 붙여넣은 원본 URL/ID 문자열
  product_id_value text,              -- extractShoppingProductId.js가 뽑아낸 숫자 ID
  product_id_space text,              -- 'nv_mid' | 'catalog_nv_mid' | 'chnl_prod_no' | 'unknown'
  area_mode text not null check (area_mode in ('ad', 'organic')),
  max_rank integer not null,
  status text not null check (status in ('ok', 'not_found', 'blocked', 'error')),
  error_message text,
  rank integer,                       -- status='ok'일 때만 값이 있음
  max_rank_checked integer,
  matched_item jsonb,                 -- status='ok'일 때 찾은 상품의 상세 정보
  requested_at timestamptz not null default now()
);

create index if not exists idx_shopping_rank_checks_request_id
  on shopping_rank_checks (request_id);

-- alter table shopping_keywords enable row level security; -- 다중 사용자로 확장 시
-- alter table shopping_keyword_snapshots enable row level security;
-- alter table shopping_rank_checks enable row level security;

-- ============================================================================
-- "검색광고 분석" 기능 (2026-10-01 추가)
--
-- 키워드를 검색하면 그 키워드로 노출되는 네이버 파워링크 광고(광고 업체, 광고 문안, 이미지,
-- 확장소재, 서브링크, 광고집행기간 등)를 정리해서 보여줍니다. 등록 없이 검색할 때마다 1회
-- 조회하는 온디맨드 방식이에요(keyword_place_lists와 같은 구조 — 요청 1건 = 결과 1행).
create table if not exists search_ad_lists (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  keyword text not null,
  device text not null default 'pc' check (device in ('pc', 'mobile')),
  pages_fetched integer,              -- 광고가 실제로 나온 마지막 페이지 번호(&pagingIndex 기준)
  status text not null check (status in ('ok', 'empty', 'blocked', 'error')),
  error_message text,
  results jsonb,                      -- [{rank, adId, advertiser, displayUrl, landingUrl, favicon, headline,
                                       --   subtitles[], description, imageUrl, extension{label,text},
                                       --   sublinks[], badges[], adPeriod, promotion, adFormats[], page}, ...]
  requested_at timestamptz not null default now()
);

-- 이미 search_ad_lists 테이블을 만들어둔 경우(2026-10-01 첫 버전)에도 안전하게 컬럼이 추가되도록:
alter table search_ad_lists add column if not exists device text not null default 'pc';
alter table search_ad_lists add column if not exists pages_fetched integer;
-- 순위 번호 기준("naver" = 네이버가 광고에 붙인 순위 번호 / "sequence" = 화면에 나온 순서)과,
-- 같은 광고주가 다른 문안으로 또 나와서 하나로 합친 횟수 (2026-10-01 중복/순위 보정)
alter table search_ad_lists add column if not exists rank_source text;
alter table search_ad_lists add column if not exists merged_duplicates integer;
-- 모바일에서 광고를 어떻게 모았는지(예: "첫 화면 → 더보기 2번 → 페이지 이동으로 새 광고 3페이지 추가")
alter table search_ad_lists add column if not exists load_summary text;

create index if not exists idx_search_ad_lists_request_id
  on search_ad_lists (request_id);

create index if not exists idx_search_ad_lists_keyword_time
  on search_ad_lists (keyword, requested_at desc);

-- alter table search_ad_lists enable row level security; -- 다중 사용자로 확장 시

-- ============================================================================
-- "검색광고 분석 > 키워드 노출분석" (2026-10-01 추가)
--
-- 우리 사이트 URL + 키워드를 입력하면, 우리 파워링크 광고가 PC/모바일 각각 몇 위에 노출되는지
-- 확인합니다. 요청 1건 = 결과 1행(온디맨드). results에 기기별 결과가 들어있어요:
--   { pc: { status: found|not_found|empty|blocked|error, rank, page, rankSource, pagesFetched,
--           scannedAds, ad{...찾은 광고 소재}, errorMessage, note },
--     mobile: { ...같은 형식 } }
create table if not exists search_ad_rank_checks (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  keyword text not null,
  site_url text not null,
  status text not null check (status in ('ok', 'error')),
  error_message text,
  results jsonb,
  requested_at timestamptz not null default now()
);

-- (2026-10-01) 광고주명으로도 찾을 수 있게 — 모바일 플레이스 랜딩 광고는 주소에 업체 ID가 없어서
-- 광고주명으로만 우리 광고를 특정할 수 있어요.
alter table search_ad_rank_checks add column if not exists advertiser_name text;

create index if not exists idx_search_ad_rank_checks_request_id
  on search_ad_rank_checks (request_id);

create index if not exists idx_search_ad_rank_checks_site_kw_time
  on search_ad_rank_checks (site_url, keyword, requested_at desc);

-- alter table search_ad_rank_checks enable row level security; -- 다중 사용자로 확장 시

-- ============================================================================
-- "뉴스 클리핑" — 고객사 모니터링 목록 (2026-10-01 추가)
--
-- 기사 자체는 저장하지 않아요. 화면을 열 때마다 네이버 뉴스 검색 API(공식)로 최근 기사를 바로 모아요.
-- 이 테이블은 "어떤 기업을, 어떤 검색어로 볼지"만 저장해요. 테이블이 없거나 비어 있으면
-- 코드에 들어있는 기본 22곳(lib/news/defaultClients.js)을 써요.
--   keywords          검색어(기사 제목/요약에 이 중 하나가 들어있어야 인정)
--   require_any       문맥 단어(선택) — 이름이 흔한 단어일 때 이 중 하나가 함께 나와야 인정
--   exclude_keywords  제외 단어(선택) — 이 단어가 들어간 기사는 제외
--   ignore_terms      키워드를 품은 다른 단어(선택) — 예: 하이브 ↔ 하이브리드
--   match_scope       'title' = 제목에 있을 때만 / 'title_desc' = 제목 또는 요약(기본)
create table if not exists news_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  keywords text[] not null default '{}',
  require_any text[] not null default '{}',
  exclude_keywords text[] not null default '{}',
  ignore_terms text[] not null default '{}',
  match_scope text not null default 'title_desc' check (match_scope in ('title', 'title_desc')),
  domain text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_news_clients_sort on news_clients (sort_order, created_at);

-- 기본 22곳 넣기 (이미 같은 이름이 있으면 건너뜀 — 여러 번 실행해도 안전해요)
insert into news_clients (name, keywords, require_any, exclude_keywords, ignore_terms, match_scope, domain, sort_order) values
  ('교원', array['교원그룹','교원투어','교원라이프','교원웰스','교원 빨간펜'], '{}', '{}', '{}', 'title_desc', 'kyowon.co.kr', 0),
  ('BIGHIT MUSIC', array['빅히트뮤직','BIGHIT MUSIC'], '{}', '{}', '{}', 'title_desc', 'ibighit.com', 1),
  ('삼성자산운용', array['삼성자산운용'], '{}', '{}', '{}', 'title_desc', 'samsungfund.com', 2),
  ('고려은단', array['고려은단'], '{}', '{}', '{}', 'title_desc', null, 3),
  ('하이브', array['하이브','HYBE'], '{}', '{}', array['하이브리드'], 'title', 'hybecorp.com', 4),
  ('구몬', array['구몬'], '{}', '{}', '{}', 'title_desc', null, 5),
  ('LG전자', array['LG전자'], '{}', '{}', '{}', 'title', 'lge.co.kr', 6),
  ('DB손해보험', array['DB손해보험','DB손보'], '{}', '{}', '{}', 'title_desc', 'idbins.com', 7),
  ('아고다', array['아고다'], '{}', '{}', '{}', 'title_desc', 'agoda.com', 8),
  ('이투스', array['이투스'], '{}', '{}', '{}', 'title_desc', 'etoos.com', 9),
  ('레뷰', array['레뷰코퍼레이션','레뷰'], '{}', '{}', '{}', 'title_desc', 'revu.net', 10),
  ('부킹닷컴', array['부킹닷컴'], '{}', '{}', '{}', 'title_desc', 'booking.com', 11),
  ('디클래시', array['디클래시'], '{}', '{}', '{}', 'title_desc', null, 12),
  ('스카이스캐너', array['스카이스캐너'], '{}', '{}', '{}', 'title_desc', 'skyscanner.co.kr', 13),
  ('KOZ 엔터테인먼트', array['KOZ엔터테인먼트','KOZ 엔터'], '{}', '{}', '{}', 'title_desc', null, 14),
  ('쌤소나이트', array['쌤소나이트'], '{}', '{}', '{}', 'title_desc', 'samsonite.com', 15),
  ('미소페', array['미소페'], '{}', '{}', '{}', 'title_desc', null, 16),
  ('와이어바알리', array['와이어바알리'], '{}', '{}', '{}', 'title_desc', 'wirebarley.com', 17),
  ('브람스', array['브람스'], '{}', array['교향곡','협주곡','작곡가','소나타','피아니스트','바이올리니스트','오케스트라','브람스를 좋아하세요'], '{}', 'title_desc', null, 18),
  ('카약', array['카약'], array['KAYAK','여행','항공','호텔','숙소','항공권','앱','플랫폼','검색'], '{}', array['카약킹'], 'title_desc', 'kayak.co.kr', 19),
  ('호텔스컴바인', array['호텔스컴바인'], '{}', '{}', '{}', 'title_desc', 'hotelscombined.co.kr', 20),
  ('스카이라이프', array['스카이라이프'], '{}', '{}', '{}', 'title_desc', 'skylife.co.kr', 21)
on conflict (name) do nothing;

-- alter table news_clients enable row level security; -- 다중 사용자로 확장 시
