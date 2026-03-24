# Claude Code Skills 실전 예시 모음

> 실무에서 바로 사용할 수 있는 완전한 SKILL.md 파일 9개 컬렉션

---

## 예시 1: PR 리뷰 스킬 (`/review-pr`)

PR 번호를 인자로 받아 코드 리뷰를 수행하고, GitHub에 리뷰 코멘트를 자동으로 작성한다.

**사용 시나리오**: PR이 올라왔을 때 빠르게 1차 리뷰를 수행하고 피드백을 남기고 싶을 때

**호출 예시**:
```
/review-pr 42
/review-pr 42 --focus security
/review-pr          # 현재 브랜치의 PR을 자동 탐지
```

### 완전한 SKILL.md

`.claude/skills/review-pr.md`:

```markdown
---
name: review-pr
description: PR 번호를 인자로 받아 코드 리뷰를 수행하고 GitHub에 리뷰 코멘트를 작성합니다
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(command:git *)
  - Bash(command:gh pr *)
  - Bash(command:gh api *)
---

당신은 시니어 코드 리뷰어입니다. PR을 리뷰하고 GitHub에 피드백을 남기세요.

## 입력 처리
사용자 입력: `$ARGUMENTS`

- 숫자가 있으면 PR 번호로 사용
- `--focus security` → 보안 집중 리뷰
- `--focus performance` → 성능 집중 리뷰
- 인자가 없으면 현재 브랜치의 PR을 자동 탐지:
  ```bash
  gh pr view --json number --jq '.number'
  ```

## 리뷰 절차

### 1단계: PR 정보 수집
```bash
gh pr view <NUMBER> --json title,body,files,additions,deletions,baseRefName,headRefName
gh pr diff <NUMBER>
```

### 2단계: 변경 파일 분석
각 변경 파일에 대해:
1. diff를 상세히 분석
2. 파일 전체를 Read로 읽어 컨텍스트 파악
3. 관련 파일(테스트, 타입 정의)도 확인

### 3단계: 리뷰 관점
- **정확성**: 로직 오류, 엣지 케이스
- **보안**: injection, XSS, 인증 우회
- **성능**: N+1, 메모리 누수, 불필요한 연산
- **유지보수성**: 네이밍, 복잡도, 테스트

### 4단계: GitHub에 리뷰 작성
```bash
gh pr review <NUMBER> --comment --body "리뷰 내용"
```

각 이슈에 대해 인라인 코멘트도 추가하세요:
```bash
gh api repos/{owner}/{repo}/pulls/<NUMBER>/comments \
  -f body="코멘트" \
  -f path="파일경로" \
  -f line=42 \
  -f side="RIGHT" \
  -f commit_id="$(gh pr view <NUMBER> --json headRefOid --jq '.headRefOid')"
```

## 출력
리뷰 요약을 사용자에게 보여주세요:
- 총 이슈 수
- 심각도별 분류
- 작성한 코멘트 수
```

---

## 예시 2: 배포 자동화 스킬 (`/deploy`)

환경을 선택하여 배포 전 체크와 배포를 수행하고, 롤백 계획도 포함한다.

**사용 시나리오**: staging 또는 production 환경에 배포할 때 안전한 절차를 따르고 싶을 때

**호출 예시**:
```
/deploy staging
/deploy production
/deploy staging --skip-tests
```

### 완전한 SKILL.md

`.claude/skills/deploy.md`:

```markdown
---
name: deploy
description: staging/production 환경에 안전하게 배포합니다. 배포 전 체크리스트와 롤백 계획을 포함합니다.
allowed-tools:
  - Bash(command:git *)
  - Bash(command:npm *)
  - Bash(command:docker *)
  - Bash(command:gh *)
  - Bash(command:kubectl *)
  - Read
  - Grep
  - Glob
---

안전한 배포를 수행합니다.

## 입력 처리
사용자 입력: `$ARGUMENTS`
현재 브랜치: $GIT_BRANCH

- 첫 번째 인자: 환경 (staging / production)
- `--skip-tests`: 테스트 스킵 (staging만 허용)
- 환경 미지정 시 사용자에게 확인 요청

## 배포 전 체크리스트

### 1. Git 상태 확인
```bash
git status --short
git log origin/main..HEAD --oneline
```
- 미커밋 변경이 있으면 경고 후 중단
- main 브랜치가 아닌 경우 경고

### 2. 테스트 실행
```bash
npm test 2>&1
npm run lint 2>&1
```
- 테스트 실패 시 배포 중단
- `--skip-tests`가 있고 staging이면 경고 후 계속

### 3. 빌드 확인
```bash
npm run build 2>&1
```
- 빌드 실패 시 배포 중단

### 4. 환경별 배포

#### staging
```bash
git push origin $GIT_BRANCH:staging
```

#### production
production 배포 시 추가 확인:
- "production 배포를 진행하시겠습니까?" 확인 요청
- 최근 staging 테스트 결과 확인
- 태그 생성:
  ```bash
  git tag -a v$(date +%Y%m%d.%H%M) -m "Production deploy"
  git push origin --tags
  ```

### 5. 롤백 계획
배포 후 이전 버전 정보를 기록:
```bash
# 이전 커밋 해시
git rev-parse HEAD~1
```

롤백 명령어를 안내:
```
# 롤백이 필요하면:
git revert HEAD
git push origin main
```

## 출력 형식
```
## 배포 결과

| 항목 | 상태 |
|------|------|
| 환경 | [staging/production] |
| 브랜치 | [브랜치명] |
| 커밋 | [해시] |
| 테스트 | 통과/스킵 |
| 빌드 | 성공 |
| 배포 | 완료/실패 |

### 롤백 정보
- 이전 버전: [커밋 해시]
- 롤백 명령: `git revert [현재 해시]`
```
```

---

## 예시 3: 코드 분석 스킬 (`/analyze`)

코드 복잡도, 의존성, 보안 취약점을 종합 분석하여 리포트를 생성한다.

**사용 시나리오**: 프로젝트 건강 상태를 정기 점검하거나, 리팩토링 우선순위를 정할 때

**호출 예시**:
```
/analyze
/analyze src/auth/
/analyze --security-only
```

### 완전한 SKILL.md

`.claude/skills/analyze.md`:

```markdown
---
name: analyze
description: 코드 복잡도, 의존성, 보안 취약점을 종합 분석하여 리포트를 생성합니다
allowed-tools:
  - Read
  - Grep
  - Glob
  - Task
  - Bash(command:npm audit*)
  - Bash(command:npx *)
  - Bash(command:wc *)
  - Bash(command:git *)
---

코드 종합 분석을 수행합니다.

## 입력 처리
사용자 입력: `$ARGUMENTS`

- 경로가 있으면 해당 디렉토리만 분석
- `--security-only`: 보안 분석만 수행
- 인자 없으면 전체 프로젝트 분석

## 분석 항목

### 1. 코드 복잡도 분석
각 소스 파일에 대해:
- 파일 크기 (줄 수)
- 함수/메서드 수
- 중첩 깊이 (if/for/while 중첩)
- 긴 함수 (50줄 이상) 탐지
- 긴 파일 (300줄 이상) 탐지

```bash
# 큰 파일 찾기
wc -l src/**/*.ts 2>/dev/null | sort -rn | head -20
```

### 2. 의존성 분석
```bash
npm audit 2>&1 || true
```
- 취약한 의존성 식별
- 미사용 의존성 탐지 (import 검색)
- 순환 의존성 확인

### 3. 보안 취약점 분석
Grep으로 위험 패턴 탐지:
- 하드코딩된 시크릿: `password\s*=`, `api_key\s*=`, `secret\s*=`
- SQL injection: `query\(.*\$\{`, `execute\(.*\+`
- XSS: `innerHTML`, `dangerouslySetInnerHTML`, `v-html`
- eval 사용: `eval\(`, `new Function\(`
- 안전하지 않은 정규식: 백트래킹 취약점

### 4. 코드 품질 지표
- TODO/FIXME/HACK 주석 수
- console.log/print 디버그 문 수
- any 타입 사용 수 (TypeScript)
- 테스트 커버리지 추정 (테스트 파일 비율)

## 출력 형식
```
## 코드 분석 리포트

### 종합 점수: [A/B/C/D/F]

### 코드 복잡도
| 지표 | 값 | 판정 |
|------|-----|------|
| 총 파일 수 | N | - |
| 총 코드 줄 수 | N | - |
| 300줄+ 파일 | N개 | 주의/양호 |
| 50줄+ 함수 | N개 | 주의/양호 |

### 의존성
| 지표 | 값 | 판정 |
|------|-----|------|
| 총 의존성 | N개 | - |
| 취약 의존성 | N개 | 위험/양호 |

### 보안
| 취약점 유형 | 발견 수 | 심각도 |
|------------|---------|--------|
| 하드코딩 시크릿 | N | CRITICAL |
| SQL injection | N | CRITICAL |
| XSS | N | HIGH |

### 개선 우선순위
1. [가장 긴급한 항목]
2. [두 번째]
3. [세 번째]
```
```

---

## 예시 4: 문서 생성 스킬 (`/generate-docs`)

소스 코드에서 JSDoc/TSDoc을 자동 생성하고, README와 API 문서를 업데이트한다.

**사용 시나리오**: 새 모듈을 만들었거나 API가 변경되어 문서를 업데이트해야 할 때

**호출 예시**:
```
/generate-docs src/services/auth.ts
/generate-docs --readme
/generate-docs --api
```

### 완전한 SKILL.md

`.claude/skills/generate-docs.md`:

```markdown
---
name: generate-docs
description: 소스 코드에서 JSDoc/TSDoc 자동 생성, README 업데이트, API 문서를 생성합니다
allowed-tools:
  - Read
  - Edit
  - Write
  - Grep
  - Glob
  - Bash(command:git diff*)
  - Bash(command:npx typedoc*)
---

코드 문서를 자동 생성합니다.

## 입력 처리
사용자 입력: `$ARGUMENTS`

- 파일 경로가 있으면 해당 파일의 JSDoc/TSDoc 생성
- `--readme`: README.md 업데이트
- `--api`: API 문서 생성
- 인자 없으면 최근 변경된 파일의 문서 생성

## 모드별 동작

### 모드 1: JSDoc/TSDoc 생성 (기본)

대상 파일을 Read로 읽고 다음을 추가:

1. **모듈 설명** (파일 상단):
   ```typescript
   /**
    * @module AuthService
    * @description 사용자 인증 및 권한 관리 서비스
    */
   ```

2. **함수/메서드 문서**:
   ```typescript
   /**
    * 사용자를 인증하고 JWT 토큰을 반환합니다.
    *
    * @param credentials - 로그인 자격증명
    * @param credentials.email - 이메일 주소
    * @param credentials.password - 비밀번호
    * @returns JWT 액세스 토큰과 리프레시 토큰
    * @throws {UnauthorizedError} 자격증명이 유효하지 않을 때
    *
    * @example
    * ```typescript
    * const tokens = await authService.login({
    *   email: 'user@example.com',
    *   password: 'password123'
    * });
    * ```
    */
   ```

3. **인터페이스/타입 문서**:
   ```typescript
   /**
    * 사용자 인증 자격증명
    */
   interface Credentials {
     /** 이메일 주소 */
     email: string;
     /** 비밀번호 (최소 8자) */
     password: string;
   }
   ```

### 모드 2: README 업데이트 (`--readme`)

프로젝트 구조를 분석하여 README.md를 업데이트:
- 프로젝트 설명
- 설치 방법
- 사용법
- 디렉토리 구조
- 기여 가이드

### 모드 3: API 문서 생성 (`--api`)

API 라우트 파일을 스캔하여 문서 생성:
- 엔드포인트 목록
- 요청/응답 형식
- 인증 요구사항
- 에러 코드

## 규칙
- 기존 JSDoc이 있으면 보존하고 누락된 부분만 추가
- 코드의 실제 동작에 기반하여 문서 작성 (추측 금지)
- `@example`은 실제 사용 가능한 코드로 작성
```

---

## 예시 5: 보안 스캔 스킬 (`/security-scan`)

OWASP Top 10을 기준으로 보안 취약점을 검사하고 리포트를 생성한다.

**사용 시나리오**: 보안 감사, PR 리뷰의 보안 관점 점검, 정기 보안 스캔

**호출 예시**:
```
/security-scan
/security-scan src/api/
/security-scan --owasp-only
```

### 완전한 SKILL.md

`.claude/skills/security-scan.md`:

```markdown
---
name: security-scan
description: OWASP Top 10 기반 보안 취약점 검사를 수행하고 보안 리포트를 생성합니다
context: fork
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(command:npm audit*)
  - Bash(command:git log*)
---

독립적인 보안 스캔을 수행합니다. 선입견 없이 객관적으로 분석하세요.

## 입력 처리
사용자 입력: `$ARGUMENTS`

- 경로가 있으면 해당 디렉토리만 스캔
- `--owasp-only`: OWASP Top 10만 검사
- 인자 없으면 전체 프로젝트 스캔

## OWASP Top 10 검사 항목

### A01: Broken Access Control
검색 패턴:
- 인증 미들웨어 누락된 라우트
- 직접 객체 참조 (IDOR)
- CORS 설정 오류

### A02: Cryptographic Failures
검색 패턴:
- 하드코딩된 시크릿/키
- 약한 해시 알고리즘 (MD5, SHA1)
- HTTP 사용 (HTTPS 미적용)
- 평문 비밀번호 저장

### A03: Injection
검색 패턴:
- SQL injection: 문자열 연결 쿼리
- NoSQL injection: 사용자 입력 직접 쿼리
- Command injection: exec, spawn에 사용자 입력
- XSS: innerHTML, dangerouslySetInnerHTML

### A04: Insecure Design
검색 패턴:
- Rate limiting 부재
- 입력 검증 누락
- 비즈니스 로직 취약점

### A05: Security Misconfiguration
검색 패턴:
- 디버그 모드 활성화
- 기본 자격증명 사용
- 불필요한 기능 활성화
- 에러 메시지 노출

### A06: Vulnerable Components
```bash
npm audit 2>&1 || true
```

### A07: Authentication Failures
검색 패턴:
- 약한 비밀번호 정책
- 세션 관리 취약점
- 브루트포스 방어 부재

### A08: Data Integrity Failures
검색 패턴:
- 신뢰할 수 없는 역직렬화
- CI/CD 파이프라인 보안
- 무결성 검증 부재

### A09: Logging Failures
검색 패턴:
- 로깅 부재 (인증, 접근 제어)
- 민감 데이터 로깅
- 로그 injection

### A10: SSRF
검색 패턴:
- 사용자 입력 URL로 HTTP 요청
- URL 검증 우회 가능성

## 출력 형식
```
## 보안 스캔 리포트

### 스캔 범위
- 날짜: [날짜]
- 대상: [경로]
- 스캔 파일 수: N개

### 취약점 요약
| 심각도 | 수량 |
|--------|------|
| CRITICAL | N |
| HIGH | N |
| MEDIUM | N |
| LOW | N |

### 상세 결과

#### [CRITICAL] A03-001: SQL Injection
- **파일**: `src/api/users.ts:42`
- **코드**: (문제 코드)
- **설명**: 사용자 입력이 SQL 쿼리에 직접 삽입됩니다
- **수정안**: Parameterized query 사용
- **참고**: https://owasp.org/Top10/A03_2021-Injection/

(추가 취약점...)

### 권장 조치
1. [즉시 수정 필요 항목]
2. [단기 개선 항목]
3. [장기 개선 항목]
```
```

---

## 예시 6: 마이그레이션 스킬 (`/migrate`)

데이터베이스 마이그레이션 파일을 생성하고 관리한다.

**사용 시나리오**: 스키마 변경이 필요할 때 마이그레이션 파일을 안전하게 생성하고 싶을 때

**호출 예시**:
```
/migrate create add-user-email-verified
/migrate status
/migrate rollback
```

### 완전한 SKILL.md

`.claude/skills/migrate.md`:

```markdown
---
name: migrate
description: 데이터베이스 마이그레이션 파일을 생성하고 관리합니다
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Bash(command:npx prisma*)
  - Bash(command:npx knex*)
  - Bash(command:npx typeorm*)
  - Bash(command:npm run migrate*)
  - Bash(command:ls *)
---

데이터베이스 마이그레이션을 관리합니다.

## 입력 처리
사용자 입력: `$ARGUMENTS`

- `create <name>`: 새 마이그레이션 파일 생성
- `status`: 마이그레이션 상태 확인
- `rollback`: 마지막 마이그레이션 롤백
- 인자 없으면 상태를 보여주고 다음 단계 제안

## ORM 자동 감지

프로젝트 설정 파일을 확인하여 ORM을 감지:

```bash
# Prisma
ls prisma/schema.prisma 2>/dev/null && echo "PRISMA"

# TypeORM
ls ormconfig.* 2>/dev/null && echo "TYPEORM"

# Knex
ls knexfile.* 2>/dev/null && echo "KNEX"

# Sequelize
ls .sequelizerc 2>/dev/null && echo "SEQUELIZE"
```

## ORM별 동작

### Prisma
```bash
# 마이그레이션 생성
npx prisma migrate dev --name <name>

# 상태 확인
npx prisma migrate status

# 롤백 (reset)
npx prisma migrate reset
```

### TypeORM
```bash
# 마이그레이션 생성
npx typeorm migration:create src/migrations/<Name>

# 실행
npx typeorm migration:run

# 롤백
npx typeorm migration:revert
```

### Knex
```bash
# 마이그레이션 생성
npx knex migrate:make <name>

# 상태
npx knex migrate:status

# 롤백
npx knex migrate:rollback
```

## 마이그레이션 파일 생성 규칙

1. **파일명**: 타임스탬프 + 설명적 이름
   - `20260224120000_add_user_email_verified.ts`

2. **Up 함수**: 변경 적용
3. **Down 함수**: 변경 롤백 (반드시 포함)

4. **안전한 마이그레이션 패턴**:
   - 컬럼 추가: nullable 또는 default 값 필수
   - 컬럼 삭제: 먼저 코드에서 사용 제거 후 삭제
   - 인덱스: CONCURRENTLY 옵션 고려
   - 큰 테이블: 배치 처리 고려

## 출력
마이그레이션 파일 생성 후:
- 파일 경로와 내용을 보여주기
- Up/Down 동작 설명
- 주의사항 안내
```

---

## 예시 7: 테스트 생성 스킬 (`/generate-tests`)

소스 코드를 분석하여 유닛 테스트를 자동 생성한다.

**사용 시나리오**: 새 모듈의 테스트를 빠르게 생성하거나, 테스트 커버리지를 높이고 싶을 때

**호출 예시**:
```
/generate-tests src/services/auth.ts
/generate-tests src/utils/ --framework vitest
/generate-tests --coverage-report
```

### 완전한 SKILL.md

`.claude/skills/generate-tests.md`:

```markdown
---
name: generate-tests
description: 소스 코드를 분석하여 유닛 테스트를 자동 생성합니다. 프레임워크를 자동 감지합니다.
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Bash(command:npm test*)
  - Bash(command:npx jest*)
  - Bash(command:npx vitest*)
  - Bash(command:cat package.json*)
---

테스트 코드를 자동 생성합니다.

## 입력 처리
사용자 입력: `$ARGUMENTS`

- 파일/디렉토리 경로: 해당 소스의 테스트 생성
- `--framework jest|vitest|mocha`: 프레임워크 지정
- `--coverage-report`: 커버리지 분석만 수행
- 인자 없으면 최근 변경 파일의 테스트 생성

## 테스트 프레임워크 감지

!`cat package.json 2>/dev/null | grep -E "jest|vitest|mocha" | head -5`

## 테스트 생성 절차

### 1단계: 소스 분석
대상 파일을 Read로 읽고:
- 모든 export된 함수/클래스/타입 식별
- 각 함수의 파라미터와 반환 타입 파악
- 의존성 (import) 확인
- 사이드 이펙트 확인

### 2단계: 테스트 케이스 설계
각 함수/메서드에 대해:
1. **Happy path**: 정상 입력 → 기대 출력
2. **Edge cases**: 빈 값, null, undefined, 경계값
3. **Error cases**: 예외 발생 조건
4. **의존성 모킹**: 외부 서비스, DB 등

### 3단계: 테스트 파일 생성
테스트 파일 위치 규칙:
- `src/services/auth.ts` → `src/services/__tests__/auth.test.ts`
- 또는 `tests/services/auth.test.ts` (기존 구조 따름)

### 4단계: 테스트 실행 및 검증
```bash
npx jest <test-file> --verbose 2>&1
# 또는
npx vitest run <test-file> 2>&1
```
실패하는 테스트가 있으면 수정

## 테스트 코드 규칙

1. **describe 블록**: 함수/클래스 단위
2. **it 블록**: 동작 단위, 한국어 설명 가능
3. **AAA 패턴**: Arrange → Act → Assert
4. **하나의 assert**: 테스트당 하나의 검증
5. **모킹 최소화**: 실제 동작 테스트 우선

## 테스트 템플릿

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
  });

  describe('login', () => {
    it('유효한 자격증명으로 토큰을 반환한다', async () => {
      // Arrange
      const credentials = { email: 'test@example.com', password: 'valid' };

      // Act
      const result = await service.login(credentials);

      // Assert
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('잘못된 비밀번호로 UnauthorizedError를 던진다', async () => {
      // Arrange
      const credentials = { email: 'test@example.com', password: 'wrong' };

      // Act & Assert
      await expect(service.login(credentials))
        .rejects
        .toThrow('Unauthorized');
    });
  });
});
```
```

---

## 예시 8: 커밋 메시지 스킬 (`/commit`)

Git diff를 분석하여 Conventional Commits 형식의 커밋 메시지를 자동 생성한다.

**사용 시나리오**: 변경사항을 분석하여 적절한 커밋 메시지를 자동으로 생성하고 싶을 때

**호출 예시**:
```
/commit
/commit --amend
/commit "추가 설명"
```

### 완전한 SKILL.md

`.claude/skills/commit.md`:

```markdown
---
name: commit
description: Git diff를 분석하여 Conventional Commits 형식의 커밋 메시지를 자동 생성하고 커밋합니다
allowed-tools:
  - Bash(command:git *)
  - Read
  - Grep
  - Glob
---

Git 변경사항을 분석하고 적절한 커밋 메시지로 커밋합니다.

## 컨텍스트
브랜치: $GIT_BRANCH
변경사항: $GIT_STATUS

## 절차

### 1단계: 변경사항 수집
```bash
# Staged 변경사항 확인
git diff --cached --stat
git diff --cached

# Staged가 없으면 모든 변경사항 표시
git diff --stat
git status --short
```

Staged 변경사항이 없으면:
- 변경된 파일 목록을 보여주고
- "모든 변경사항을 stage할까요?" 확인 요청

### 2단계: 변경 분석
변경사항을 분석하여:
- 어떤 기능이 추가/수정/삭제되었는지
- 어떤 파일/모듈이 영향을 받았는지
- 변경의 의도가 무엇인지

### 3단계: 커밋 메시지 생성

Conventional Commits 형식:
```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**type 결정 기준**:
| type | 조건 |
|------|------|
| feat | 새 기능 추가 |
| fix | 버그 수정 |
| refactor | 기능 변경 없는 코드 개선 |
| docs | 문서만 변경 |
| style | 포맷팅, 세미콜론 등 |
| test | 테스트 추가/수정 |
| chore | 빌드, 설정 등 |
| perf | 성능 개선 |

**scope 결정**: 변경된 주요 모듈/디렉토리

**description 규칙**:
- 영어 소문자 시작
- 명령형 (add, fix, update)
- 50자 이내
- 마침표 없음

### 4단계: 커밋 실행

메시지를 사용자에게 보여주고 확인을 받은 후:

```bash
git commit -m "$(cat <<'EOF'
type(scope): description

body (변경 이유와 상세 설명)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

## 최근 커밋 스타일 참고
!`git log --oneline -10`
```

---

## 예시 9: 온보딩 스킬 (`/onboard`)

새 팀원을 위한 프로젝트 구조 설명, 주요 패턴 가이드, 개발 환경 설정을 도와준다.

**사용 시나리오**: 새 프로젝트에 합류했거나, 팀에 새 멤버가 들어왔을 때 빠르게 프로젝트를 이해하고 싶을 때

**호출 예시**:
```
/onboard
/onboard --setup
/onboard --architecture
```

### 완전한 SKILL.md

`.claude/skills/onboard.md`:

```markdown
---
name: onboard
description: 새 팀원을 위한 프로젝트 온보딩 가이드를 제공합니다. 프로젝트 구조, 주요 패턴, 개발 환경 설정을 안내합니다.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(command:git log*)
  - Bash(command:git branch*)
  - Bash(command:node --version*)
  - Bash(command:npm --version*)
  - Bash(command:cat *)
  - Bash(command:ls *)
---

새 팀원을 위한 프로젝트 온보딩을 진행합니다.

## 입력 처리
사용자 입력: `$ARGUMENTS`

- `--setup`: 개발 환경 설정 가이드만
- `--architecture`: 아키텍처 설명만
- 인자 없으면 전체 온보딩

## 프로젝트 컨텍스트

프로젝트 설정:
!`cat package.json 2>/dev/null | head -30`

디렉토리 구조:
!`ls -la`

README:
!`head -30 README.md 2>/dev/null || echo "README 없음"`

## 온보딩 가이드

### 1. 프로젝트 개요
Read로 README.md, package.json 등을 읽고:
- 프로젝트 목적과 주요 기능
- 기술 스택 (프레임워크, 언어, DB 등)
- 핵심 비즈니스 도메인

### 2. 디렉토리 구조
```bash
ls -la src/
```
각 디렉토리의 역할을 설명:
- `src/api/` 또는 `src/routes/`: API 엔드포인트
- `src/services/`: 비즈니스 로직
- `src/models/`: 데이터 모델
- `src/utils/`: 유틸리티
- 기타 프로젝트별 구조

### 3. 주요 패턴
코드를 분석하여 사용 중인 패턴 식별:
- 상태 관리 패턴
- API 호출 패턴
- 에러 처리 패턴
- 인증/인가 패턴
- 테스트 패턴

### 4. 개발 환경 설정 (`--setup`)
```bash
# 필요한 도구 버전 확인
node --version
npm --version

# 의존성 설치
npm install

# 환경 변수 설정
cat .env.example
```

Step-by-step 설정 가이드 제공:
1. 저장소 클론
2. 의존성 설치
3. 환경 변수 설정
4. 데이터베이스 설정
5. 개발 서버 실행
6. 테스트 실행

### 5. 자주 사용하는 명령어
package.json의 scripts를 분석하여 설명:
```bash
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm test         # 테스트
npm run lint     # 린트
```

### 6. 기여 가이드
Git 워크플로우 설명:
- 브랜치 전략 (main, develop, feature/*)
- 커밋 메시지 규칙
- PR 프로세스
- 코드 리뷰 기준

## 출력 형식

친절하고 구조화된 온보딩 문서를 출력하세요.
기술적 정확성을 유지하면서도 새 팀원이 이해하기 쉽게 작성하세요.
```

---

## 스킬 적용 가이드

### 스킬 설치 방법

원하는 스킬의 SKILL.md 내용을 복사하여 프로젝트의 `.claude/skills/` 디렉토리에 저장한다:

```bash
# 디렉토리 생성
mkdir -p .claude/skills

# 스킬 파일 생성 (예시)
# 위 예시의 코드 블록 내용을 복사하여 파일로 저장
```

### 커스터마이징

각 스킬은 프로젝트에 맞게 수정할 수 있다:

1. **allowed-tools**: 프로젝트에서 사용하는 도구만 허용
2. **패턴**: 프로젝트의 컨벤션에 맞게 수정
3. **출력 형식**: 팀의 문서 형식에 맞게 조정
4. **동적 컨텍스트**: 프로젝트별 설정 파일 주입

### 스킬 조합

여러 스킬을 순차적으로 사용하면 강력한 워크플로우를 구성할 수 있다:

```
1. /analyze          → 코드 분석
2. /generate-tests   → 테스트 생성
3. /security-scan    → 보안 스캔
4. /commit           → 변경사항 커밋
5. /review-pr        → PR 리뷰
6. /deploy staging   → 스테이징 배포
```

---

## 요약

| 스킬 | 명령어 | 핵심 기능 |
|------|--------|-----------|
| PR 리뷰 | `/review-pr` | GitHub PR 코드 리뷰 + 코멘트 |
| 배포 | `/deploy` | 안전한 배포 + 롤백 계획 |
| 코드 분석 | `/analyze` | 복잡도 + 보안 + 의존성 |
| 문서 생성 | `/generate-docs` | JSDoc + README + API docs |
| 보안 스캔 | `/security-scan` | OWASP Top 10 점검 |
| 마이그레이션 | `/migrate` | DB 마이그레이션 관리 |
| 테스트 생성 | `/generate-tests` | 유닛 테스트 자동 생성 |
| 커밋 | `/commit` | Conventional Commits 자동 생성 |
| 온보딩 | `/onboard` | 새 팀원 프로젝트 가이드 |
