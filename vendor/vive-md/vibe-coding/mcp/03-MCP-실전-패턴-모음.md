# MCP 실전 패턴 모음

> Model Context Protocol을 활용한 실전 통합 패턴 가이드.
> 각 패턴은 `.mcp.json` 설정과 활용 시나리오를 포함한다.

---

## 1. 데이터베이스 통합 패턴

### 1.1 PostgreSQL MCP

#### 연결 설정

`.mcp.json` 설정:

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://user:password@localhost:5432/mydb"
      ]
    }
  }
}
```

환경변수를 사용하는 안전한 설정:

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "${DATABASE_URL}"
      ],
      "env": {
        "DATABASE_URL": "postgresql://user:password@localhost:5432/mydb"
      }
    }
  }
}
```

#### 활용 시나리오

**스키마 탐색**:

```
프롬프트: "users 테이블 구조를 분석하고 인덱스 현황을 알려줘"

→ MCP가 information_schema 조회
→ 컬럼 타입, 제약조건, 인덱스 정보 반환
→ AI가 구조 분석 및 개선안 제시
```

**쿼리 최적화**:

```
프롬프트: "이 쿼리가 느린데 실행계획을 분석해줘"

→ EXPLAIN ANALYZE 실행
→ Seq Scan, Index Scan 여부 확인
→ 인덱스 추가/쿼리 리팩토링 제안
```

**마이그레이션 지원**:

```
프롬프트: "orders 테이블에 status 컬럼을 추가하는 마이그레이션을 만들어줘"

→ 현재 스키마 확인
→ ALTER TABLE 문 생성
→ 롤백 스크립트 함께 제공
```

#### 연결 풀링 및 트랜잭션 패턴

PostgreSQL MCP 서버는 단일 연결 기반이므로 동시 접속이 필요한 경우 별도의 풀링 레이어를 고려한다:

```
프롬프트: "현재 DB 커넥션 상태를 확인하고,
         idle 커넥션이 많으면 정리 방안을 제안해줘"

→ pg_stat_activity 조회
→ idle/active 커넥션 분석
→ connection_timeout, idle_in_transaction_session_timeout 설정 제안
```

### 1.2 SQLite MCP

#### 설정

```json
{
  "mcpServers": {
    "sqlite": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-sqlite",
        "--db-path",
        "./data/app.db"
      ]
    }
  }
}
```

#### 활용 예시

```
프롬프트: "로컬 SQLite DB에서 최근 7일간 로그를 분석해줘"

→ 테이블 목록 조회
→ logs 테이블 스키마 확인
→ 날짜 필터링 쿼리 실행
→ 패턴 분석 결과 제공
```

**임베디드 DB 관리**:

```
프롬프트: "SQLite DB 용량이 커졌는데 최적화해줘"

→ PRAGMA page_count, page_size 확인
→ 불필요 데이터 식별
→ VACUUM 실행 제안
→ 인덱스 재구성
```

### 1.3 데이터베이스 패턴 비교

| 항목 | PostgreSQL MCP | SQLite MCP |
|------|---------------|------------|
| 용도 | 프로덕션 DB 분석/관리 | 로컬 개발, 임베디드 DB |
| 연결 | 네트워크 (TCP) | 파일 기반 |
| 동시성 | 높음 | 제한적 |
| 설정 복잡도 | 중간 (인증 필요) | 낮음 (파일 경로만) |
| 주요 활용 | 스키마 분석, 쿼리 최적화, 마이그레이션 | 로그 분석, 프로토타이핑, 데이터 탐색 |

---

## 2. GitHub 워크플로우 패턴

### 2.1 GitHub MCP 서버 설정

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-github"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<your-token>"
      }
    }
  }
}
```

#### 토큰 권한 설정

필요한 최소 권한:

| 스코프 | 용도 |
|--------|------|
| `repo` | 리포지토리 읽기/쓰기 |
| `issues` | 이슈 관리 |
| `pull_requests` | PR 생성/리뷰 |
| `actions` | 워크플로우 확인 |

### 2.2 이슈 기반 개발 플로우

```mermaid
flowchart LR
    A[이슈 생성/할당] --> B[브랜치 생성]
    B --> C[코드 작성]
    C --> D[PR 생성]
    D --> E[코드 리뷰]
    E --> F[머지]
    F --> G[이슈 닫기]
```

**전체 플로우 프롬프트 예시**:

```
프롬프트: "#42 이슈를 분석하고, 구현한 뒤 PR을 만들어줘"

→ GitHub MCP로 이슈 #42 내용 조회
→ 이슈 라벨, 담당자, 관련 코드 분석
→ 브랜치 생성 (feat/42-feature-name)
→ 코드 구현
→ PR 생성 (이슈 참조 포함)
```

### 2.3 PR 리뷰 자동화 패턴

```
프롬프트: "PR #15를 리뷰해줘. 보안 이슈와 성능 문제를 중심으로 봐줘"

→ PR diff 조회
→ 변경 파일 목록 확인
→ 보안 패턴 검사 (하드코딩된 시크릿, SQL Injection 등)
→ 성능 이슈 검사 (N+1 쿼리, 불필요 연산 등)
→ 라인별 리뷰 코멘트 작성
```

### 2.4 코드 검색 및 분석

```
프롬프트: "이 리포지토리에서 deprecated된 API를 사용하는 곳을 모두 찾아줘"

→ 코드 검색 API 활용
→ 파일별 검색 결과 취합
→ 대체 API 제안과 마이그레이션 가이드 제공
```

---

## 3. 모니터링 및 로깅 패턴

### 3.1 Sentry MCP

#### 설정

```json
{
  "mcpServers": {
    "sentry": {
      "command": "npx",
      "args": [
        "-y",
        "@sentry/mcp-server"
      ],
      "env": {
        "SENTRY_AUTH_TOKEN": "<your-sentry-token>",
        "SENTRY_ORG": "my-org"
      }
    }
  }
}
```

#### 에러 추적 패턴

```
프롬프트: "최근 24시간 동안 발생한 에러를 분석해줘"

→ Sentry MCP로 최근 이슈 목록 조회
→ 발생 빈도, 영향 사용자 수 확인
→ 스택 트레이스 분석
→ 우선순위별 수정 방안 제시
```

**에러 그룹 분석**:

```
프롬프트: "SENTRY-1234 이슈의 근본 원인을 분석해줘"

→ 이슈 상세 정보 조회
→ 이벤트 타임라인 분석
→ 재현 조건 추정
→ 수정 코드 제안
```

### 3.2 커스텀 로깅 MCP

로그 파일을 분석하는 Filesystem MCP 활용:

```json
{
  "mcpServers": {
    "logs": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/var/log/myapp"
      ]
    }
  }
}
```

```
프롬프트: "오늘 오전 에러 로그를 분석하고 패턴을 찾아줘"

→ 로그 디렉토리 탐색
→ 시간대별 에러 로그 필터링
→ 에러 패턴 분류 (DB 타임아웃, API 실패, OOM 등)
→ 근본 원인 분석 및 개선 제안
```

### 3.3 알림 통합

Slack MCP와 연동한 알림 패턴:

```
프롬프트: "Sentry에서 critical 에러가 발생하면 Slack #alerts 채널에 요약을 보내줘"

→ Sentry MCP로 critical 이슈 조회
→ 에러 요약 생성
→ Slack MCP로 메시지 전송
```

---

## 4. 파일시스템 패턴

### 4.1 Filesystem MCP 설정

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/home/user/projects",
        "/home/user/documents"
      ]
    }
  }
}
```

#### 허용 디렉토리 설정

`args` 배열의 마지막 요소들이 허용 디렉토리 목록이다. 이 외의 경로에는 접근할 수 없다.

**보안 고려사항**:
- 프로젝트 루트만 허용하고, 시스템 디렉토리(`/etc`, `/usr`)는 절대 포함하지 않는다
- 홈 디렉토리 전체(`~`)보다 특정 서브디렉토리를 지정한다
- `.env`, 시크릿 파일이 있는 디렉토리는 별도 관리한다

### 4.2 대규모 코드베이스 탐색 패턴

```
프롬프트: "이 프로젝트의 전체 구조를 파악하고 아키텍처를 설명해줘"

→ 디렉토리 트리 조회
→ 주요 설정 파일 (package.json, tsconfig.json 등) 읽기
→ 엔트리 포인트 분석
→ 모듈 의존성 그래프 추론
→ 아키텍처 다이어그램 생성
```

**파일 검색 패턴**:

```
프롬프트: "TODO 주석이 포함된 파일을 모두 찾아줘"

→ 파일시스템 탐색
→ 소스 파일 내용 검색
→ TODO 목록 정리 (파일명, 라인번호, 내용)
→ 우선순위 분류
```

---

## 5. 웹 API 통합 패턴

### 5.1 Fetch/HTTP MCP

#### 설정

```json
{
  "mcpServers": {
    "fetch": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-fetch"
      ]
    }
  }
}
```

#### REST API 호출 패턴

```
프롬프트: "외부 API의 응답 구조를 분석하고 TypeScript 타입을 생성해줘"

→ Fetch MCP로 API 엔드포인트 호출
→ JSON 응답 구조 분석
→ TypeScript interface 자동 생성
→ Zod 스키마 생성 (선택)
```

**API 문서 분석**:

```
프롬프트: "이 API 문서 URL을 읽고 클라이언트 코드를 생성해줘"

→ API 문서 페이지 fetch
→ 엔드포인트 목록 추출
→ 요청/응답 타입 정의
→ API 클라이언트 클래스 생성
```

### 5.2 크롤링/스크래핑 패턴

Puppeteer MCP 설정:

```json
{
  "mcpServers": {
    "puppeteer": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-puppeteer"
      ]
    }
  }
}
```

```
프롬프트: "경쟁사 가격 페이지를 분석하고 가격 비교표를 만들어줘"

→ Puppeteer MCP로 페이지 렌더링
→ 동적 콘텐츠 로드 대기
→ 가격 데이터 추출
→ 비교 테이블 생성
```

**SPA 테스트 패턴**:

```
프롬프트: "로그인 후 대시보드 페이지가 정상 렌더링되는지 확인해줘"

→ 로그인 페이지 접속
→ 폼 입력 및 제출
→ 대시보드 로드 확인
→ 주요 요소 존재 검증
→ 스크린샷 캡처
```

---

## 6. 멀티 서버 조합 패턴

### 6.1 풀스택 개발 조합

GitHub + PostgreSQL + Filesystem + Fetch를 조합한 풀스택 개발 환경:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<token>"
      }
    },
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://dev:dev@localhost:5432/myapp"
      ]
    },
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/home/user/myapp"
      ]
    },
    "fetch": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch"]
    }
  }
}
```

**활용 시나리오**:

```
프롬프트: "GitHub 이슈 #30을 분석하고, DB 스키마를 확인한 뒤,
         API 엔드포인트를 구현해줘"

→ GitHub MCP: 이슈 상세 조회
→ Postgres MCP: 관련 테이블 스키마 확인
→ Filesystem MCP: 기존 코드 구조 파악
→ 코드 구현 (컨트롤러, 서비스, 리포지토리)
→ Fetch MCP: 구현된 API 테스트
→ GitHub MCP: PR 생성
```

### 6.2 데이터 분석 조합

```json
{
  "mcpServers": {
    "sqlite": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sqlite", "--db-path", "./analytics.db"]
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/data"]
    },
    "fetch": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch"]
    }
  }
}
```

### 6.3 DevOps 조합

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<token>"
      }
    },
    "docker": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-docker"]
    },
    "sentry": {
      "command": "npx",
      "args": ["-y", "@sentry/mcp-server"],
      "env": {
        "SENTRY_AUTH_TOKEN": "<token>",
        "SENTRY_ORG": "my-org"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/infra"]
    }
  }
}
```

### 6.4 서버 간 데이터 플로우

```mermaid
flowchart TB
    subgraph Input["입력 소스"]
        GH[GitHub MCP<br/>이슈/PR/코드]
        DB[(PostgreSQL MCP<br/>데이터베이스)]
        FS[Filesystem MCP<br/>로컬 파일]
        WEB[Fetch MCP<br/>외부 API]
    end

    subgraph AI["AI 에이전트"]
        CTX[컨텍스트 통합]
        REASON[추론 및 분석]
        ACTION[액션 생성]
    end

    subgraph Output["출력"]
        CODE[코드 생성/수정]
        PR[PR 생성]
        QUERY[쿼리 실행]
        REPORT[분석 리포트]
    end

    GH --> CTX
    DB --> CTX
    FS --> CTX
    WEB --> CTX
    CTX --> REASON
    REASON --> ACTION
    ACTION --> CODE
    ACTION --> PR
    ACTION --> QUERY
    ACTION --> REPORT
```

### 6.5 조합 설계 원칙

1. **최소 권한**: 각 서버에 필요한 최소한의 접근만 부여
2. **환경 분리**: 개발/스테이징/프로덕션 환경별 별도 설정
3. **서버 수 제한**: 동시 실행 서버는 5개 이하로 유지 (메모리 고려)
4. **독립적 설정**: 서버 간 의존성 없이 개별 시작/중지 가능

---

## 7. 트러블슈팅 패턴별 FAQ

### 7.1 데이터베이스 관련

**Q: PostgreSQL MCP 연결이 안 됩니다.**

```
확인사항:
1. 연결 문자열 형식: postgresql://user:password@host:port/dbname
2. 로컬인 경우 PostgreSQL 서비스 실행 여부: pg_isready
3. pg_hba.conf에서 접근 허용 여부
4. 방화벽/보안그룹 설정
```

**Q: 쿼리 실행 시 타임아웃이 발생합니다.**

```
해결 방안:
1. statement_timeout 설정 확인
2. 대량 데이터 조회 시 LIMIT 사용
3. 실행 계획(EXPLAIN)으로 풀스캔 여부 확인
4. 필요시 인덱스 추가
```

**Q: SQLite DB 파일 잠금(lock) 에러가 발생합니다.**

```
해결 방안:
1. 다른 프로세스의 DB 접근 여부 확인: lsof <db-file>
2. WAL 모드 활성화: PRAGMA journal_mode=WAL
3. busy_timeout 설정 확인
4. MCP 서버 재시작
```

### 7.2 GitHub 관련

**Q: 토큰 권한 에러가 발생합니다.**

```
해결 방안:
1. 토큰 만료 여부 확인
2. 필요 스코프 확인 (repo, issues, pull_requests)
3. Fine-grained token인 경우 리포지토리 접근 권한 확인
4. 조직 리포지토리의 경우 SSO 인증 여부 확인
```

**Q: PR 생성 시 권한 거부됩니다.**

```
해결 방안:
1. 리포지토리 write 권한 확인
2. 브랜치 보호 규칙 확인
3. 토큰의 repo 스코프 포함 여부
4. 포크(Fork)된 리포인 경우 원본 리포에 대한 권한 확인
```

### 7.3 파일시스템 관련

**Q: 파일 접근이 거부됩니다.**

```
해결 방안:
1. .mcp.json의 허용 디렉토리 목록 확인
2. 심볼릭 링크 포함 여부 확인 (실제 경로 기준)
3. 파일 시스템 권한 (chmod) 확인
4. 대소문자 구분 (macOS vs Linux)
```

**Q: 대용량 파일 읽기가 실패합니다.**

```
해결 방안:
1. 파일 크기 확인 (MCP 서버별 제한 있음)
2. 바이너리 파일은 지원되지 않음
3. 청크 단위로 나누어 읽기 시도
4. 로그 파일의 경우 tail 방식 활용
```

### 7.4 Fetch/HTTP 관련

**Q: CORS나 인증 에러가 발생합니다.**

```
해결 방안:
1. Fetch MCP는 서버 사이드 요청이므로 CORS 미적용
2. 인증 헤더가 필요한 경우 MCP 서버 커스터마이징 필요
3. API 키는 환경변수로 관리
4. Rate limiting 확인
```

**Q: 동적 페이지의 콘텐츠를 가져올 수 없습니다.**

```
해결 방안:
1. Fetch MCP는 정적 HTML만 반환 → Puppeteer MCP 사용
2. SPA의 경우 API 엔드포인트를 직접 호출
3. 렌더링 대기 시간 설정 (Puppeteer)
4. JavaScript 비활성화 상태에서 접근 가능 여부 확인
```

### 7.5 멀티 서버 관련

**Q: 여러 MCP 서버 동시 실행 시 느려집니다.**

```
해결 방안:
1. 동시 실행 서버 수 제한 (5개 이하 권장)
2. 사용하지 않는 서버 제거
3. 메모리 사용량 모니터링: ps aux | grep mcp
4. 서버별 타임아웃 설정 조정
```

**Q: 서버 간 데이터 전달이 안 됩니다.**

```
해결 방안:
MCP 서버 간에는 직접 통신하지 않음.
AI 에이전트가 중개자 역할을 한다:
  1. 서버 A에서 데이터 조회
  2. AI가 결과를 해석
  3. 필요한 형태로 변환
  4. 서버 B에 전달
```

### 7.6 공통 문제

**Q: MCP 서버가 시작되지 않습니다.**

```
확인 순서:
1. Node.js 버전 확인: node -v (18+ 권장)
2. npx 캐시 정리: npx clear-npx-cache
3. 패키지 직접 설치 후 실행: npm install -g @modelcontextprotocol/server-xxx
4. 로그 확인: stderr 출력 확인
5. 포트 충돌 확인 (네트워크 기반 서버인 경우)
```

**Q: `.mcp.json` 변경이 반영되지 않습니다.**

```
해결 방안:
1. AI 에이전트(Claude Code 등) 재시작
2. JSON 문법 검증: 쉼표, 따옴표 확인
3. 환경변수 치환이 정상인지 확인
4. 파일 위치 확인: 프로젝트 루트 또는 ~/.config/
```
