# SEO 사이트 분석기

URL을 입력하면 콘텐츠 SEO / 테크니컬 SEO / 검색엔진 친화도 / 속도 최적화 / 보안 권장사항을 점검해주고, 브랜드 키워드로 네이버 블로그·뉴스·카페 발행 현황도 조회할 수 있는 웹사이트입니다.

## 배포 방법 (요약)

1. 이 폴더 전체를 GitHub 새 저장소(New repository)에 업로드합니다. ("Add file" → "Upload files"로 드래그 앤 드롭하면 됩니다. `node_modules` 폴더는 없으니 그대로 올리면 됩니다.)
2. https://vercel.com 에서 GitHub 계정으로 로그인 후 "Add New..." → "Project" → 방금 만든 저장소 선택 → "Deploy" 클릭.
3. (브랜드 콘텐츠 발행 현황 기능을 쓰려면) 아래 "브랜드 콘텐츠 기능 환경변수 설정" 안내대로 Vercel에 네이버 API 키를 등록합니다.
4. 몇 분 후 생성되는 주소로 접속하면 바로 사용할 수 있습니다.

## 브랜드 콘텐츠 기능 환경변수 설정 (NAVER API HUB)

브랜드 키워드로 블로그/뉴스/카페 발행 현황을 조회하는 기능은 네이버 검색 API 키가 있어야 동작합니다.

⚠️ 네이버가 검색 API를 예전 "네이버 개발자센터"에서 **NAVER API HUB(네이버 클라우드 플랫폼)** 로 옮겼기 때문에, 개발자센터(`developers.naver.com`)에서는 더 이상 "검색" API를 신규로 등록할 수 없습니다. 아래처럼 API HUB에서 발급받아야 합니다.

1. https://www.ncloud.com/product/applicationService/naverApiHub 에서 네이버 클라우드 플랫폼(NCP) 계정으로 로그인/가입합니다. (일반 네이버 아이디와는 별도 가입입니다.)
2. NAVER API HUB 상품을 이용 신청하고, Application 생성 화면에서 블로그/뉴스/카페글 검색 API를 선택합니다.
3. 발급되는 **Key ID**와 **Key(Secret)** 값을 복사해둡니다.
4. Vercel 프로젝트 → Settings → Environment Variables 에서 아래 두 개를 추가합니다.
   - `NAVER_CLIENT_ID` = 위에서 복사한 Key ID
   - `NAVER_CLIENT_SECRET` = 위에서 복사한 Key(Secret)
   - Environment는 Production/Preview/Development 전부 체크해두면 편해요.
5. 환경변수를 추가한 뒤에는 Deployments 탭 → 가장 최근 배포 옆 "..." 메뉴 → **Redeploy**를 눌러야 반영됩니다. (환경변수만 추가하고 Redeploy를 안 하면 이전 값 그대로 동작해요.)

키를 등록하지 않아도 사이트 자체는 정상 동작하며, 브랜드 콘텐츠 분석 시도 시에만 안내 메시지가 표시됩니다.

## 로컬에서 실행하고 싶다면 (선택, 개발자용)

```bash
npm install
npm run dev
```

http://localhost:3000 에서 확인할 수 있습니다.
