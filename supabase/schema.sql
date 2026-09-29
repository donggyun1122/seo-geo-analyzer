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
  created_at timestamptz not null default now()
);

create index if not exists idx_rank_checks_keyword_time
  on rank_checks (place_keyword_id, measured_at desc);

create index if not exists idx_place_keywords_active
  on place_keywords (is_active);

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
