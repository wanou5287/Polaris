# MCP 서버 카탈로그

> MCP 생태계의 주요 서버를 정리한 카탈로그.
> 각 서버의 설정, 주요 도구, 활용 시나리오를 포함한다.

---

## 1. 공식 MCP 서버

Anthropic과 MCP 커뮤니티가 관리하는 공식 레퍼런스 서버 목록이다.

### 1.1 Filesystem

| 항목 | 내용 |
|------|------|
| 패키지 | `@modelcontextprotocol/server-filesystem` |
| 설명 | 로컬 파일시스템 읽기/쓰기/검색 |
| GitHub | https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem |

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/allowed/dir1",
        "/path/to/allowed/dir2"
      ]
    }
  }
}
```

**주요 도구**: `read_file`, `write_file`, `list_directory`, `search_files`, `move_file`, `get_file_info`

**활용 시나리오**: 프로젝트 구조 탐색, 설정 파일 수정, 로그 분석, 코드 검색

---

### 1.2 GitHub

| 항목 | 내용 |
|------|------|
| 패키지 | `@modelcontextprotocol/server-github` |
| 설명 | GitHub 이슈, PR, 리포지토리 관리 |
| GitHub | https://github.com/modelcontextprotocol/servers/tree/main/src/github |

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<token>"
      }
    }
  }
}
```

**주요 도구**: `create_issue`, `list_issues`, `create_pull_request`, `search_code`, `get_file_contents`, `create_repository`

**활용 시나리오**: 이슈 기반 개발, PR 리뷰 자동화, 코드 검색, 리포지토리 관리

---

### 1.3 PostgreSQL

| 항목 | 내용 |
|------|------|
| 패키지 | `@modelcontextprotocol/server-postgres` |
| 설명 | PostgreSQL 데이터베이스 조회 및 분석 |
| GitHub | https://github.com/modelcontextprotocol/servers/tree/main/src/postgres |

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://user:pass@localhost:5432/mydb"
      ]
    }
  }
}
```

**주요 도구**: `query` (SQL 실행), `list_tables`, `describe_table`

**활용 시나리오**: 스키마 분석, 쿼리 최적화, 데이터 탐색, 마이그레이션 지원

---

### 1.4 SQLite

| 항목 | 내용 |
|------|------|
| 패키지 | `@modelcontextprotocol/server-sqlite` |
| 설명 | SQLite 데이터베이스 분석 및 관리 |
| GitHub | https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite |

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

**주요 도구**: `read_query`, `write_query`, `list_tables`, `describe_table`, `create_table`

**활용 시나리오**: 로컬 DB 분석, 프로토타이핑, 임베디드 데이터 관리

---

### 1.5 Memory

| 항목 | 내용 |
|------|------|
| 패키지 | `@modelcontextprotocol/server-memory` |
| 설명 | Knowledge Graph 기반 영구 메모리 저장소 |
| GitHub | https://github.com/modelcontextprotocol/servers/tree/main/src/memory |

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    }
  }
}
```

**주요 도구**: `create_entities`, `create_relations`, `search_nodes`, `open_nodes`, `delete_entities`

**활용 시나리오**: 대화 간 컨텍스트 유지, 프로젝트 지식 그래프 구축, 사용자 선호도 기억

---

### 1.6 Puppeteer

| 항목 | 내용 |
|------|------|
| 패키지 | `@modelcontextprotocol/server-puppeteer` |
| 설명 | 헤드리스 브라우저 자동화 |
| GitHub | https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer |

```json
{
  "mcpServers": {
    "puppeteer": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-puppeteer"]
    }
  }
}
```

**주요 도구**: `navigate`, `screenshot`, `click`, `fill`, `evaluate`, `select`

**활용 시나리오**: 웹 스크래핑, E2E 테스트, 동적 콘텐츠 접근, 스크린샷 캡처

---

### 1.7 Brave Search

| 항목 | 내용 |
|------|------|
| 패키지 | `@modelcontextprotocol/server-brave-search` |
| 설명 | Brave Search API를 통한 웹 검색 |
| GitHub | https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search |

```json
{
  "mcpServers": {
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "<api-key>"
      }
    }
  }
}
```

**주요 도구**: `brave_web_search`, `brave_local_search`

**활용 시나리오**: 최신 기술 문서 검색, 에러 메시지 검색, 라이브러리 비교 조사

---

### 1.8 Fetch

| 항목 | 내용 |
|------|------|
| 패키지 | `@modelcontextprotocol/server-fetch` |
| 설명 | HTTP 요청 및 웹 콘텐츠 가져오기 |
| GitHub | https://github.com/modelcontextprotocol/servers/tree/main/src/fetch |

```json
{
  "mcpServers": {
    "fetch": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch"]
    }
  }
}
```

**주요 도구**: `fetch` (URL 콘텐츠를 마크다운으로 변환)

**활용 시나리오**: API 문서 읽기, 웹 페이지 콘텐츠 분석, REST API 테스트

---

### 1.9 Sequential Thinking

| 항목 | 내용 |
|------|------|
| 패키지 | `@modelcontextprotocol/server-sequential-thinking` |
| 설명 | 단계별 사고 과정을 통한 복잡한 문제 해결 |
| GitHub | https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking |

```json
{
  "mcpServers": {
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    }
  }
}
```

**주요 도구**: `sequentialthinking` (단계별 사고 기록 및 수정)

**활용 시나리오**: 복잡한 디버깅, 아키텍처 설계, 단계별 분석이 필요한 의사결정

---

### 1.10 Everything (테스트용)

| 항목 | 내용 |
|------|------|
| 패키지 | `@modelcontextprotocol/server-everything` |
| 설명 | MCP 프로토콜의 모든 기능을 테스트하기 위한 레퍼런스 서버 |
| GitHub | https://github.com/modelcontextprotocol/servers/tree/main/src/everything |

```json
{
  "mcpServers": {
    "everything": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-everything"]
    }
  }
}
```

**주요 도구**: 모든 MCP 기능의 샘플 구현 (tools, resources, prompts, sampling)

**활용 시나리오**: MCP 클라이언트 개발 시 통합 테스트, 프로토콜 학습

---

## 2. 커뮤니티 인기 서버

서드파티 개발자가 만든 인기 MCP 서버 목록이다.

### 2.1 Notion MCP

| 항목 | 내용 |
|------|------|
| 패키지 | `@notionhq/notion-mcp-server` |
| 설명 | Notion 페이지, 데이터베이스, 블록 관리 |
| 안정성 | 높음 (공식 Notion 팀 유지보수) |

```json
{
  "mcpServers": {
    "notion": {
      "command": "npx",
      "args": ["-y", "@notionhq/notion-mcp-server"],
      "env": {
        "NOTION_API_KEY": "<integration-token>"
      }
    }
  }
}
```

**주요 도구**: 페이지 생성/수정, 데이터베이스 쿼리, 블록 조작

---

### 2.2 Linear MCP

| 항목 | 내용 |
|------|------|
| 패키지 | `@linear/mcp-server` |
| 설명 | Linear 이슈 트래커 연동 |
| 안정성 | 높음 |

```json
{
  "mcpServers": {
    "linear": {
      "command": "npx",
      "args": ["-y", "@linear/mcp-server"],
      "env": {
        "LINEAR_API_KEY": "<api-key>"
      }
    }
  }
}
```

**주요 도구**: 이슈 생성/조회/수정, 프로젝트 관리, 사이클 관리

---

### 2.3 Slack MCP

| 항목 | 내용 |
|------|------|
| 패키지 | `@anthropic/slack-mcp-server` |
| 설명 | Slack 메시지 읽기/쓰기, 채널 관리 |
| 안정성 | 높음 |

```json
{
  "mcpServers": {
    "slack": {
      "command": "npx",
      "args": ["-y", "@anthropic/slack-mcp-server"],
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-...",
        "SLACK_TEAM_ID": "<team-id>"
      }
    }
  }
}
```

**주요 도구**: 메시지 전송, 채널 목록 조회, 메시지 검색

---

### 2.4 Docker MCP

| 항목 | 내용 |
|------|------|
| 패키지 | `@modelcontextprotocol/server-docker` |
| 설명 | Docker 컨테이너 관리 |
| 안정성 | 중간 |

```json
{
  "mcpServers": {
    "docker": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-docker"]
    }
  }
}
```

**주요 도구**: 컨테이너 목록, 로그 조회, 이미지 관리, 컨테이너 실행/중지

---

### 2.5 Playwright MCP

| 항목 | 내용 |
|------|------|
| 패키지 | `@anthropic/playwright-mcp-server` |
| 설명 | Playwright 기반 브라우저 자동화 |
| 안정성 | 높음 |

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@anthropic/playwright-mcp-server"]
    }
  }
}
```

**주요 도구**: 페이지 탐색, 요소 클릭/입력, 스크린샷, 네트워크 인터셉트

---

### 2.6 Supabase MCP

| 항목 | 내용 |
|------|------|
| 패키지 | `@supabase/mcp-server` |
| 설명 | Supabase 프로젝트 관리 (DB, Auth, Storage) |
| 안정성 | 높음 (공식) |

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server"],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "<token>"
      }
    }
  }
}
```

**주요 도구**: SQL 실행, 마이그레이션 관리, Edge Function 배포, 프로젝트 설정

---

### 2.7 Figma MCP

| 항목 | 내용 |
|------|------|
| 패키지 | `@anthropic/figma-mcp-server` |
| 설명 | Figma 디자인 파일 접근 및 분석 |
| 안정성 | 중간 |

```json
{
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "@anthropic/figma-mcp-server"],
      "env": {
        "FIGMA_ACCESS_TOKEN": "<token>"
      }
    }
  }
}
```

**주요 도구**: 파일 구조 조회, 컴포넌트 분석, 스타일 추출

---

### 2.8 Cloudflare MCP

| 항목 | 내용 |
|------|------|
| 패키지 | `@cloudflare/mcp-server-cloudflare` |
| 설명 | Cloudflare Workers, KV, R2, D1 관리 |
| 안정성 | 높음 (공식) |

```json
{
  "mcpServers": {
    "cloudflare": {
      "command": "npx",
      "args": ["-y", "@cloudflare/mcp-server-cloudflare"],
      "env": {
        "CLOUDFLARE_API_TOKEN": "<token>"
      }
    }
  }
}
```

**주요 도구**: Workers 배포, KV 읽기/쓰기, R2 버킷 관리, D1 쿼리

---

### 2.9 Vercel MCP

| 항목 | 내용 |
|------|------|
| 패키지 | `@vercel/mcp-server` |
| 설명 | Vercel 프로젝트 배포 및 관리 |
| 안정성 | 높음 (공식) |

```json
{
  "mcpServers": {
    "vercel": {
      "command": "npx",
      "args": ["-y", "@vercel/mcp-server"],
      "env": {
        "VERCEL_TOKEN": "<token>"
      }
    }
  }
}
```

**주요 도구**: 프로젝트 배포, 환경변수 관리, 도메인 설정, 로그 조회

---

### 2.10 Prisma MCP

| 항목 | 내용 |
|------|------|
| 패키지 | `@prisma/mcp-server` |
| 설명 | Prisma ORM 스키마 분석 및 마이그레이션 |
| 안정성 | 중간 |

```json
{
  "mcpServers": {
    "prisma": {
      "command": "npx",
      "args": ["-y", "@prisma/mcp-server"]
    }
  }
}
```

**주요 도구**: 스키마 분석, 마이그레이션 생성, 쿼리 최적화 제안

---

## 3. 유스케이스별 추천 매트릭스

### 3.1 개발 유형별 서버 추천

| 서버 | 웹 개발 | 데이터 분석 | DevOps | 문서 작성 | 프로젝트 관리 |
|------|:-------:|:----------:|:------:|:--------:|:------------:|
| Filesystem | **필수** | **필수** | 권장 | **필수** | 선택 |
| GitHub | **필수** | 선택 | **필수** | 선택 | **필수** |
| PostgreSQL | **필수** | **필수** | 선택 | - | - |
| SQLite | 권장 | **필수** | - | 선택 | - |
| Fetch | **필수** | 권장 | 권장 | 권장 | 선택 |
| Puppeteer | 권장 | 선택 | - | - | - |
| Brave Search | 권장 | 권장 | 권장 | **필수** | 선택 |
| Memory | 선택 | 선택 | 선택 | 권장 | 권장 |
| Docker | 권장 | - | **필수** | - | - |
| Sentry | 권장 | - | **필수** | - | - |
| Notion | 선택 | - | - | **필수** | **필수** |
| Linear | 선택 | - | - | - | **필수** |
| Slack | 선택 | - | 권장 | - | 권장 |

> **필수**: 해당 유스케이스의 핵심 서버 / **권장**: 생산성 향상에 기여 / **선택**: 필요시 추가

### 3.2 기술 스택별 추천

| 스택 | 핵심 서버 | 보조 서버 |
|------|----------|----------|
| Next.js + Vercel | Filesystem, GitHub, Vercel, Fetch | PostgreSQL, Supabase |
| Spring Boot | Filesystem, GitHub, PostgreSQL | Docker, Sentry |
| Vue 3 + Supabase | Filesystem, GitHub, Supabase, Fetch | Puppeteer |
| React Native | Filesystem, GitHub, Fetch | Figma |
| Python / Data | Filesystem, SQLite, Fetch, Brave Search | PostgreSQL |

---

## 4. 조합 레시피

### 4.1 레시피 1: 풀스택 웹 개발

> GitHub + PostgreSQL + Filesystem + Fetch

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
        "postgresql://dev:dev@localhost:5432/webapp"
      ]
    },
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/home/user/webapp"
      ]
    },
    "fetch": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch"]
    }
  }
}
```

**워크플로우**: 이슈 확인 → DB 스키마 분석 → 코드 작성 → API 테스트 → PR 생성

---

### 4.2 레시피 2: 데이터 사이언스

> SQLite + Filesystem + Brave Search + Fetch

```json
{
  "mcpServers": {
    "sqlite": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-sqlite",
        "--db-path",
        "./analytics.db"
      ]
    },
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/home/user/data",
        "/home/user/notebooks"
      ]
    },
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "<api-key>"
      }
    },
    "fetch": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch"]
    }
  }
}
```

**워크플로우**: 데이터 로드 → 탐색적 분석 → 외부 데이터 보강 → 리포트 생성

---

### 4.3 레시피 3: 프로젝트 관리

> GitHub + Linear + Slack + Notion

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
    "linear": {
      "command": "npx",
      "args": ["-y", "@linear/mcp-server"],
      "env": {
        "LINEAR_API_KEY": "<api-key>"
      }
    },
    "slack": {
      "command": "npx",
      "args": ["-y", "@anthropic/slack-mcp-server"],
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-...",
        "SLACK_TEAM_ID": "<team-id>"
      }
    },
    "notion": {
      "command": "npx",
      "args": ["-y", "@notionhq/notion-mcp-server"],
      "env": {
        "NOTION_API_KEY": "<token>"
      }
    }
  }
}
```

**워크플로우**: Linear 이슈 동기화 → GitHub PR 연결 → Slack 알림 → Notion 문서 업데이트

---

### 4.4 레시피 4: DevOps

> Docker + GitHub + Sentry + Filesystem

```json
{
  "mcpServers": {
    "docker": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-docker"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<token>"
      }
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
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/home/user/infra",
        "/var/log"
      ]
    }
  }
}
```

**워크플로우**: Sentry 에러 감지 → 로그/컨테이너 분석 → 코드 수정 → 배포

---

## 5. 서버 선택 가이드

### 5.1 서버 평가 기준

| 기준 | 설명 | 확인 방법 |
|------|------|----------|
| **안정성** | 프로덕션 환경에서 신뢰할 수 있는가 | GitHub Issues, 릴리스 주기 |
| **유지보수** | 활발하게 관리되고 있는가 | 최근 커밋 날짜, 이슈 응답 시간 |
| **보안** | 인증 정보를 안전하게 처리하는가 | 코드 리뷰, 환경변수 사용 여부 |
| **성능** | 응답 시간과 리소스 사용이 적절한가 | 벤치마크, 메모리 사용량 |
| **호환성** | 사용 중인 MCP 클라이언트와 호환되는가 | 프로토콜 버전 확인 |

### 5.2 새 서버 도입 전 검증 체크리스트

```markdown
## MCP 서버 도입 검증

### 기본 검증
- [ ] GitHub 리포지토리 확인 (스타 수, 이슈 수)
- [ ] 최근 6개월 내 커밋이 있는가
- [ ] README에 설정 가이드가 있는가
- [ ] 라이선스가 프로젝트에 적합한가

### 보안 검증
- [ ] 환경변수로 시크릿을 관리하는가
- [ ] 불필요한 권한을 요구하지 않는가
- [ ] 네트워크 요청 범위가 명확한가
- [ ] 의존성에 알려진 취약점이 없는가

### 기능 검증
- [ ] 로컬 환경에서 정상 실행되는가
- [ ] 주요 도구가 기대대로 동작하는가
- [ ] 에러 핸들링이 적절한가
- [ ] 타임아웃 설정이 가능한가

### 운영 검증
- [ ] 메모리 사용량이 적절한가 (< 200MB)
- [ ] 장기 실행 시 안정적인가
- [ ] 로그 출력이 디버깅에 유용한가
- [ ] 기존 서버와 충돌 없이 동작하는가
```

### 5.3 서버 업데이트 및 관리

**npx 기반 서버 업데이트**:

```bash
# npx 캐시 정리 후 최신 버전 실행
npx clear-npx-cache

# 특정 버전 고정
npx -y @modelcontextprotocol/server-github@1.2.3
```

**버전 고정 설정** (안정성이 중요한 경우):

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github@1.2.3"]
    }
  }
}
```

**업데이트 주기 권장 사항**:
- 공식 서버: 월 1회 업데이트 확인
- 커뮤니티 서버: 격주 CHANGELOG 확인
- 보안 패치: 즉시 적용
- 메이저 버전 업그레이드: 스테이징에서 충분히 테스트 후 적용
