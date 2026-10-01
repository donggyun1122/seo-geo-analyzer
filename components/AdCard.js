import { isPlaceLanding } from "../lib/searchAd/siteMatch";

// 검색광고(파워링크) 광고 1건을 카드로 보여주는 공용 컴포넌트.
// "노출 광고 현황"(pages/search-ad.js)과 "키워드 노출분석"(pages/search-ad-rank.js)에서 함께 써요.
//
// 광고 링크(ader.naver.com 추적 링크)는 열면 광고주에게 클릭 비용이 청구될 수 있어서 쓰지 않고,
// 광고의 실제 사이트 주소로만 연결해요.

// 이미지 소재가 있는 광고: PC 단일 썸네일(imageUrl) 또는 모바일 이미지형 서브링크(imageSublinks)
// 이미지 소재가 있는 광고: PC 단일 썸네일(imageUrl), 모바일 이미지형 서브링크(imageSublinks),
// 플레이스형 광고의 업체 사진(placeImages)
export function hasImage(ad) {
  return (
    !!ad.imageUrl ||
    (Array.isArray(ad.imageSublinks) && ad.imageSublinks.length > 0) ||
    (Array.isArray(ad.placeImages) && ad.placeImages.length > 0)
  );
}

// 광고가 나온 위치 표시 — PC "2페이지", 모바일 "첫 화면" / "더보기 2회"
export function pageLabelOf(ad) {
  if (ad.pageLabel) return ad.pageLabel;
  return ad.page ? `${ad.page}페이지` : null;
}

export function hostOf(url) {
  try {
    return new URL(url).host;
  } catch (e) {
    return url;
  }
}

export default function AdCard({ ad, highlight = false }) {
  return (
    <article className={`ad-card${highlight ? " ad-card-highlight" : ""}`}>
      <div className="ad-card-rank" aria-label={`${ad.rank}위`}>
        {ad.rank}
      </div>

      <div className="ad-card-body">
        <div className="ad-card-advertiser">
          {ad.favicon && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="ad-card-favicon" src={ad.favicon} alt="" width={16} height={16} referrerPolicy="no-referrer" loading="lazy" />
          )}
          <span className="ad-card-advertiser-name">{ad.advertiser || "(광고주명 없음)"}</span>
          {ad.landingUrl ? (
            <a className="ad-card-url" href={ad.landingUrl} target="_blank" rel="noopener noreferrer" title="광고 추적 링크가 아니라 실제 사이트 주소로 열려요">
              {ad.displayUrl || hostOf(ad.landingUrl)}
            </a>
          ) : (
            ad.displayUrl && <span className="ad-card-url">{ad.displayUrl}</span>
          )}
        </div>

        <h3 className="ad-card-headline">{ad.headline || "-"}</h3>
        {ad.subtitles && ad.subtitles.length > 0 && (
          <p className="ad-card-subtitles">
            {ad.subtitles.map((s, i) => (
              <span key={i} className="ad-card-subtitle">
                {s}
              </span>
            ))}
          </p>
        )}
        {ad.description && <p className="ad-card-desc">{ad.description}</p>}

        {ad.extension && (
          <div className="ad-card-ext">
            {ad.extension.label && <span className="ad-card-ext-label">{ad.extension.label}</span>}
            <span>{ad.extension.text}</span>
          </div>
        )}

        {ad.placeInfo && (
          <div className="ad-card-placeinfo">
            {ad.placeInfo.price && <strong>{ad.placeInfo.price}</strong>}
            {(ad.placeInfo.items || []).map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>
        )}

        {ad.placeImages && ad.placeImages.length > 0 && (
          <div className="ad-card-placeimgs">
            {ad.placeImages.map((src, i) => (
              <a key={i} href={src} target="_blank" rel="noopener noreferrer" title="업체 사진 크게 보기">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="플레이스 사진" referrerPolicy="no-referrer" loading="lazy" />
              </a>
            ))}
          </div>
        )}

        {ad.imageSublinks && ad.imageSublinks.length > 0 && (
          <div className="ad-card-imgsubs">
            {ad.imageSublinks.map((x, i) =>
              x.imageUrl ? (
                <a key={i} className="ad-card-imgsub" href={x.imageUrl} target="_blank" rel="noopener noreferrer" title="이미지 소재 크게 보기">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={x.imageUrl} alt={x.text || ""} referrerPolicy="no-referrer" loading="lazy" />
                  {x.text && <span>{x.text}</span>}
                </a>
              ) : (
                <div key={i} className="ad-card-imgsub">
                  {x.text && <span>{x.text}</span>}
                </div>
              )
            )}
          </div>
        )}

        {ad.sublinks && ad.sublinks.length > 0 && (
          <div className="ad-card-chips">
            {ad.sublinks.map((s, i) => (
              <span key={i} className="ad-card-chip">
                {s}
              </span>
            ))}
          </div>
        )}

        <div className="ad-card-meta">
          {pageLabelOf(ad) && <span className="ad-card-page">{pageLabelOf(ad)}</span>}
          {ad.adPeriod && (
            <span>
              광고집행기간 <strong>{ad.adPeriod}</strong>
            </span>
          )}
          {(ad.badges || []).map((b, i) => (
            <span key={i} className="ad-card-badge">
              {b}
            </span>
          ))}
          {ad.imageUrl && <span className="ad-card-badge ad-card-badge-soft">이미지 소재</span>}
          {ad.imageSublinks && ad.imageSublinks.length > 0 && <span className="ad-card-badge ad-card-badge-soft">이미지형 서브링크</span>}
          {isPlaceLanding(ad) && <span className="ad-card-badge ad-card-badge-soft">플레이스 랜딩</span>}
          {ad.subtitles && ad.subtitles.length > 0 && <span className="ad-card-badge ad-card-badge-soft">서브타이틀</span>}
        </div>

        {/* 같은 광고주가 다른 문안으로 또 나온 경우(페이지를 넘기는 사이 문안이 바뀌어 노출됨) — 순위는
            처음 나온 자리 기준이고, 나머지 문안은 여기서 펼쳐볼 수 있어요. */}
        {ad.otherCreatives && ad.otherCreatives.length > 0 && (
          <details className="ad-card-others">
            <summary>같은 광고주의 다른 문안 {ad.otherCreatives.length}개</summary>
            <ul>
              {ad.otherCreatives.map((o, i) => (
                <li key={o.adId || i}>
                  <strong>{o.headline || "-"}</strong>
                  {o.subtitles && o.subtitles.length > 0 && <span className="ad-card-others-sub"> · {o.subtitles.join(" · ")}</span>}
                  {o.description && <p>{o.description}</p>}
                  {(o.pageLabel || o.page) && <span className="ad-card-others-page">{o.pageLabel || `${o.page}페이지`}에서 발견</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {ad.imageUrl && (
        <a className="ad-card-thumb" href={ad.imageUrl} target="_blank" rel="noopener noreferrer" title="이미지 소재 크게 보기">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ad.imageUrl} alt={`${ad.advertiser || ""} 광고 이미지`} referrerPolicy="no-referrer" loading="lazy" />
        </a>
      )}
    </article>
  );
}

