# HealthManage

파일 실행 방법

.\start-server.cmd

## Supabase 데이터베이스 준비

이 저장소에는 [초기 DB 마이그레이션](supabase/migrations/20260916000000_initial_schema.sql)과 [CLI 설정](supabase/config.toml)이 포함되어 있습니다. SQL은 Supabase Auth 사용자에 연결된 `public.profiles`(이름, 아이디, 성별, 생년월일, 알레르기, 키, 몸무게)와 `public.search_history`(수술/복용약 검색어, AI 결과, 검색 시각)를 생성합니다. 두 테이블은 RLS로 로그인한 본인 데이터만 읽고 수정할 수 있습니다. 이메일과 비밀번호는 이 테이블에 저장하지 않고 Supabase Auth에서 관리합니다.

[전체 스키마 SQL](supabase/schemas/schema.sql)은 현재 DB의 목표 구조를 선언한 파일입니다. 처음 배포할 때는 마이그레이션만 `supabase db push`로 적용하세요. 같은 DB에 스키마 SQL을 별도로 한 번 더 실행하면 객체 중복 오류가 납니다. 이후 구조를 바꿀 때는 `schema.sql`을 먼저 수정하고 `supabase db diff -f <change_name>`으로 새 마이그레이션을 만들어 검토·배포합니다.

현재 `script.js`는 아직 브라우저 `localStorage`로 계정과 기록을 관리합니다. 따라서 **SQL을 올리기만 해서는 기존 로그인·프로필·조회 기록이 Supabase로 자동 전환되지 않습니다.** 실제 연동 단계에서는 Supabase Auth 이메일/비밀번호 가입·로그인, `profiles` 조회·수정, `search_history` 저장·조회·삭제로 프런트엔드를 교체해야 합니다. 기존 `홍길동/1234` 데모 계정도 Supabase Auth에는 자동 생성되지 않습니다. 브라우저에 저장된 기존 비밀번호를 그대로 DB에 복사하지 마세요.

### 처음 업로드하기

1. [Supabase Dashboard](https://supabase.com/dashboard)에서 **새 프로젝트**를 만듭니다. 이미 테이블을 만든 프로젝트라면 먼저 `supabase db pull`로 기존 스키마를 확인하고 마이그레이션 충돌을 검토하세요.
2. [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)를 설치합니다. 이 프로젝트에는 `supabase/` 폴더가 이미 있으므로 `supabase init`을 다시 실행할 필요가 없습니다.
3. 프로젝트 폴더에서 다음을 실행합니다. `<project-ref>`는 Dashboard의 프로젝트 URL `.../project/<project-ref>`에 있는 값입니다.

   ```powershell
   supabase login --agent no --output-format text
   supabase link --project-ref btcifwjabsqobftikbht
   supabase migration list
   supabase db push --dry-run
   supabase db push
   ```

   로그인은 브라우저에서 받은 일회성 확인 코드를 **본인의 터미널에만** 입력하세요. 채팅·Git에 코드를 올리지 마세요. 설치 직후 `supabase` 명령을 찾지 못하면 PowerShell을 새로 열어 다시 시도하세요. 연결된 원격 프로젝트의 기존 테이블·마이그레이션 내역을 `supabase migration list`와 `--dry-run` 결과로 먼저 확인한 후 실제 `db push`를 실행하세요.

4. Supabase Table Editor에서 `profiles`, `search_history`가 생성되었는지 확인합니다. 실제 계정 등록 후에만 프로필 행이 생깁니다. SQL을 Dashboard SQL Editor에서 직접 실행하는 방법도 가능하지만, 이후 CLI 마이그레이션 이력과 어긋날 수 있으므로 한 가지 방식만 사용하세요.

### GitHub에 올리고 Supabase와 연결하기

Supabase와 GitHub에서 같은 이메일/아이디를 사용하는 것만으로 프로젝트가 연결되지는 않습니다. 현재 폴더를 Git 저장소로 만들고 GitHub에 원격 저장소를 만든 후 연결해야 합니다. Git이 설치되어 있지 않다면 먼저 [Git for Windows](https://git-scm.com/downloads/win)를 설치하세요.

```powershell
git init
git add .
git commit -m "Add caring app and Supabase schema"
git branch -M main
git remote add origin https://github.com/<github-user>/<repository>.git
git push -u origin main
```

Supabase Dashboard의 **Project Settings → Integrations → GitHub Integration**에서 GitHub 권한을 승인하고 해당 저장소를 선택하세요. `supabase/`가 저장소 최상위에 있으므로 Working directory는 `.`입니다. 원하면 *Deploy to production*을 켜서 `main`의 새 마이그레이션을 자동 배포할 수 있습니다. 자동 배포를 켜기 전에 기존 DB 상태와 마이그레이션을 확인하세요. GitHub에 코드를 올리는 것과 DB 스키마를 배포하는 것은 별개입니다.

`.env`에는 실제 API 키가 들어갈 수 있으므로 Git에 포함하지 않습니다. `.env.example`만 올리세요. 향후 프런트엔드 Supabase 연결에는 프로젝트 URL과 **publishable key**를 사용하며, `service_role`/secret key는 브라우저 코드나 Git에 넣지 마세요. 이메일 변경과 비밀번호 변경은 `profiles` 테이블을 직접 수정하는 대신 Supabase Auth API로 처리해야 합니다.
