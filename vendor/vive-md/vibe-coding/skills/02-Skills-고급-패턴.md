# Claude Code Skills 고급 패턴

> 동적 컨텍스트, String Substitution, CI/CD 통합 등 Skills의 고급 활용 패턴

---

## 1. 동적 컨텍스트 주입

Skills의 Body에서 `` !`command` `` 문법을 사용하면 스킬 로딩 시점에 명령어 결과를 컨텍스트로 주입할 수 있다.

### 1.1 기본 문법

```markdown
---
name: my-skill
description: 동적 컨텍스트 예시
---

현재 프로젝트 상태:
!`git status --short`

최근 커밋:
!`git log --oneline -10`
```

스킬이 호출되면 `` !`command` `` 부분이 명령어 실행 결과로 대체된다.

### 1.2 Git 정보 주입

```markdown
## 프로젝트 Git 상태

현재 브랜치:
!`git branch --show-current`

최근 20개 커밋:
!`git log --oneline -20`

Staged 변경사항:
!`git diff --cached --stat`

Staged diff:
!`git diff --cached`

미추적 파일:
!`git ls-files --others --exclude-standard`

태그 목록:
!`git tag --sort=-version:refname | head -10`
```

### 1.3 프로젝트 정보 주입

```markdown
## 프로젝트 메타데이터

package.json:
!`cat package.json`

소스 디렉토리 구조:
!`ls src/`

의존성 목록:
!`cat package.json | grep -A 100 '"dependencies"' | head -50`

README 첫 20줄:
!`head -20 README.md`

환경 설정:
!`cat .env.example`
```

### 1.4 시스템 정보 주입

```markdown
## 실행 환경

Node.js 버전:
!`node --version`

Python 버전:
!`python3 --version`

OS 정보:
!`uname -s`

사용 가능한 디스크:
!`df -h . | tail -1`
```

### 1.5 컨텍스트 크기 관리

동적 컨텍스트가 너무 크면 컨텍스트 윈도우를 소모한다. 출력을 제한하는 방법:

```markdown
# 나쁜 예시: 파일 전체를 주입 (수천 줄 가능)
!`cat src/index.ts`

# 좋은 예시: 출력 제한
!`head -50 src/index.ts`

# 나쁜 예시: 재귀적 디렉토리 전체
!`find . -name "*.ts"`

# 좋은 예시: 깊이와 개수 제한
!`find src -maxdepth 2 -name "*.ts" | head -30`

# 나쁜 예시: 긴 diff 전체
!`git diff`

# 좋은 예시: stat만 출력
!`git diff --stat`
```

### 1.6 실전 예시: 프로젝트 상태 인식 스킬

`.claude/skills/project-status.md`:

```markdown
---
name: project-status
description: 프로젝트의 현재 상태를 종합적으로 파악합니다
allowed-tools:
  - Read
  - Bash(command:npm *)
  - Bash(command:git *)
  - Glob
---

프로젝트의 현재 상태를 분석하여 보고하세요.

## 현재 프로젝트 컨텍스트

### Git 상태
브랜치: !`git branch --show-current`
최근 커밋:
!`git log --oneline -5`
미커밋 변경:
!`git status --short`

### 프로젝트 설정
!`cat package.json 2>/dev/null || cat pom.xml 2>/dev/null || cat go.mod 2>/dev/null || echo "설정 파일 없음"`

### 디렉토리 구조
!`ls -la`

## 분석 지침
위 컨텍스트를 바탕으로:
1. 현재 어떤 작업이 진행 중인지 추정
2. 미커밋 변경사항의 의도를 분석
3. 다음에 해야 할 작업을 제안

## 출력 형식
간결한 불릿 포인트로 상태를 요약하세요.
```

---

## 2. String Substitution 심층

Skills Body에서 `$VARIABLE` 형태의 내장 변수를 사용할 수 있다. 동적 컨텍스트와 달리 별도 명령어 실행 없이 Claude Code가 자동으로 값을 주입한다.

### 2.1 사용 가능한 변수

| 변수 | 설명 | 예시 값 |
|------|------|---------|
| `$ARGUMENTS` | 사용자가 스킬 호출 시 전달한 인자 전체 | `"src/auth.ts --verbose"` |
| `$SKILL_NAME` | 현재 실행 중인 스킬의 이름 | `"code-review"` |
| `$CWD` | 현재 작업 디렉토리 절대 경로 | `"/Users/dev/project"` |
| `$GIT_STATUS` | `git status --short` 결과 | `"M src/index.ts\n?? new.ts"` |
| `$GIT_BRANCH` | 현재 Git 브랜치명 | `"feature/auth"` |
| `$GIT_DIFF` | Staged 변경사항 (`git diff --cached`) | diff 출력 |
| `$GIT_LOG` | 최근 커밋 로그 (`git log --oneline`) | 커밋 목록 |
| `$CURRENT_DATE` | 현재 날짜 | `"2026-02-24"` |

### 2.2 `$ARGUMENTS` 활용

사용자 입력을 파싱하여 스킬의 동작을 분기할 수 있다:

```markdown
---
name: gen
description: 타입에 따라 다른 코드를 생성합니다. 사용법 - /gen component Button
---

## 입력 처리
사용자 입력: `$ARGUMENTS`

입력을 파싱하세요:
- 첫 번째 단어: 생성 타입 (component, hook, page, api)
- 두 번째 단어: 이름
- 나머지: 옵션

### 예시
- `/gen component Button` → React 컴포넌트 Button 생성
- `/gen hook useAuth` → 커스텀 훅 useAuth 생성
- `/gen page Dashboard --with-layout` → 페이지 생성 + 레이아웃 포함
```

### 2.3 `$GIT_*` 변수 활용

```markdown
---
name: changelog
description: 최근 변경사항으로 CHANGELOG를 생성합니다
---

## 컨텍스트
- 현재 브랜치: $GIT_BRANCH
- 오늘 날짜: $CURRENT_DATE

## 최근 커밋
$GIT_LOG

## 지침
위 커밋 로그를 Conventional Commits 규칙에 따라 분류하여
CHANGELOG.md를 업데이트하세요.

### 분류
- feat: → Added
- fix: → Fixed
- perf: → Performance
- refactor: → Changed
- docs: → Documentation
```

### 2.4 조합 활용 예시

여러 변수를 조합하여 컨텍스트가 풍부한 스킬을 만들 수 있다:

```markdown
---
name: pr-summary
description: PR 요약을 자동 생성합니다
allowed-tools:
  - Bash(command:git *)
  - Read
---

## PR 요약 생성

### 컨텍스트
- 브랜치: $GIT_BRANCH
- 날짜: $CURRENT_DATE
- 작업 디렉토리: $CWD

### 변경사항
$GIT_DIFF

### 커밋 이력
$GIT_LOG

### 지침
위 정보를 바탕으로 PR 요약을 작성하세요:

1. **제목**: 50자 이내, 변경의 핵심을 한 줄로
2. **요약**: 3-5개 불릿 포인트
3. **변경 유형**: feature / bugfix / refactor / docs
4. **테스트 계획**: 검증 방법 체크리스트
```

---

## 3. context:fork 패턴

### 3.1 fork란?

`context: fork`를 설정하면 스킬이 독립적인 컨텍스트에서 실행된다. 기존 대화 내용을 참조하지 않고 깨끗한 상태에서 시작한다.

### 3.2 언제 사용하는가

| 상황 | fork 사용 | 이유 |
|------|-----------|------|
| 코드 리뷰 | Yes | 이전 대화가 리뷰에 편향을 줄 수 있음 |
| 보안 스캔 | Yes | 독립적이고 객관적인 분석 필요 |
| 문서 생성 | No | 이전 대화의 컨텍스트가 유용 |
| 디버깅 | No | 이전 대화에서 논의한 맥락 필요 |

### 3.3 설정 방법

```yaml
---
name: security-scan
description: 독립적인 보안 스캔을 수행합니다
context: fork
allowed-tools:
  - Read
  - Grep
  - Glob
---
```

### 3.4 실전 예시

`.claude/skills/fresh-review.md`:

```markdown
---
name: fresh-review
description: 이전 대화 컨텍스트 없이 새로운 시각으로 코드를 리뷰합니다
context: fork
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(command:git diff*)
model: claude-opus-4-6
---

당신은 이 프로젝트를 처음 보는 외부 리뷰어입니다.
이전 대화 컨텍스트가 없으므로 선입견 없이 코드를 평가하세요.

## 리뷰 대상
$ARGUMENTS

인자가 없으면 staged 변경사항을 리뷰하세요:
!`git diff --cached --stat`

## 리뷰 관점
1. 코드만으로 의도를 이해할 수 있는가?
2. 처음 보는 사람이 유지보수할 수 있는가?
3. 숨겨진 복잡성이 있는가?
4. 명백한 보안 위험이 있는가?
```

---

## 4. allowed-tools 고급 제어

### 4.1 도구별 세밀한 제어

`allowed-tools`는 단순 도구 이름 외에 패턴 매칭을 지원한다.

```yaml
allowed-tools:
  # 기본 도구 (이름만)
  - Read
  - Grep
  - Glob
  - Edit
  - Write

  # Bash: 특정 명령어만 허용
  - Bash(command:npm test*)
  - Bash(command:npm run build*)
  - Bash(command:git *)

  # Task: 서브에이전트 허용
  - Task

  # MCP 도구: 전체 경로
  - mcp__github__create_pull_request
  - mcp__github__list_issues
  - mcp__slack__send_message
```

### 4.2 Bash 패턴 매칭 규칙

```yaml
allowed-tools:
  # 정확한 명령어만 허용
  - Bash(command:npm test)         # "npm test"만 가능

  # 와일드카드: 접두사 매칭
  - Bash(command:npm test*)        # "npm test", "npm test -- --watch" 등

  # 와일드카드: 전체 매칭
  - Bash(command:git *)            # "git status", "git diff" 등 모든 git 명령

  # 여러 명령어 허용
  - Bash(command:npm *)            # 모든 npm 명령
  - Bash(command:npx *)            # 모든 npx 명령
  - Bash(command:node *)           # 모든 node 명령
```

### 4.3 MCP 도구 통합

MCP(Model Context Protocol) 서버의 도구를 사용하려면 `mcp__서버명__도구명` 형식을 사용한다.

```yaml
allowed-tools:
  # GitHub MCP 서버
  - mcp__github__create_pull_request
  - mcp__github__list_pull_requests
  - mcp__github__create_issue
  - mcp__github__add_comment

  # Slack MCP 서버
  - mcp__slack__send_message
  - mcp__slack__list_channels

  # 파일시스템 MCP 서버
  - mcp__filesystem__read_file
  - mcp__filesystem__write_file

  # 데이터베이스 MCP 서버
  - mcp__postgres__query
```

### 4.4 보안 최적화: 최소 권한 원칙

```yaml
# 나쁜 예시: 모든 권한 (allowed-tools 생략 시 기본값)
---
name: risky-skill
description: 모든 도구 사용 가능
---

# 좋은 예시: 필요한 권한만 명시
---
name: safe-skill
description: 읽기 전용 분석
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(command:git log*)
  - Bash(command:git diff*)
  - Bash(command:git show*)
---
```

### 4.5 도구 조합 레시피

**읽기 전용 분석**:
```yaml
allowed-tools:
  - Read
  - Grep
  - Glob
```

**코드 수정 가능**:
```yaml
allowed-tools:
  - Read
  - Edit
  - Write
  - Grep
  - Glob
```

**Git 작업 포함**:
```yaml
allowed-tools:
  - Read
  - Edit
  - Write
  - Grep
  - Glob
  - Bash(command:git *)
```

**테스트 및 빌드**:
```yaml
allowed-tools:
  - Bash(command:npm test*)
  - Bash(command:npm run build*)
  - Bash(command:npm run lint*)
  - Read
  - Grep
```

**전체 DevOps**:
```yaml
allowed-tools:
  - Read
  - Edit
  - Write
  - Grep
  - Glob
  - Task
  - Bash(command:git *)
  - Bash(command:npm *)
  - Bash(command:docker *)
  - mcp__github__create_pull_request
```

---

## 5. CI/CD 통합

### 5.1 GitHub Actions에서 Skills 활용

Claude Code CLI의 `--skill` 옵션으로 CI/CD 파이프라인에서 스킬을 실행할 수 있다.

```yaml
# .github/workflows/code-review.yml
name: Automated Code Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Code Review Skill
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          npx @anthropic-ai/claude-code -p \
            --skill code-review \
            "PR #${{ github.event.pull_request.number }}의 변경사항을 리뷰해주세요"
```

### 5.2 `claude -p --skill` CLI 옵션

```bash
# 스킬을 지정하여 비대화형 실행
claude -p --skill code-review "src/auth.ts 파일을 리뷰해주세요"

# 결과를 파일로 저장
claude -p --skill analyze "보안 분석 실행" > report.md

# JSON 출력
claude -p --skill analyze --output-format json "분석 실행"
```

### 5.3 비대화형 모드에서 스킬 실행

```bash
# 파이프라인에서 활용
echo "staged 변경사항 리뷰" | claude -p --skill code-review

# 환경 변수와 조합
PR_NUMBER=42 claude -p --skill review-pr "PR #${PR_NUMBER} 리뷰"
```

### 5.4 PR 생성 시 자동 리뷰 스킬

```yaml
# .github/workflows/auto-review.yml
name: Auto Review on PR

on:
  pull_request:
    types: [opened]

jobs:
  auto-review:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Auto Code Review
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          REVIEW=$(claude -p --skill code-review \
            "이 PR의 diff를 분석하고 리뷰 코멘트를 작성해주세요")

          gh pr comment ${{ github.event.pull_request.number }} \
            --body "$REVIEW"
```

### 5.5 배포 파이프라인 통합

```yaml
# .github/workflows/deploy.yml
name: Deploy with Pre-check

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        required: true
        type: choice
        options:
          - staging
          - production

jobs:
  pre-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Pre-deployment Analysis
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          claude -p --skill analyze \
            "${{ github.event.inputs.environment }} 배포 전 코드 분석" \
            > pre-deploy-report.md

          # 리포트에 CRITICAL이 있으면 배포 중단
          if grep -q "CRITICAL" pre-deploy-report.md; then
            echo "CRITICAL 이슈 발견. 배포 중단."
            cat pre-deploy-report.md
            exit 1
          fi
```

---

## 6. 성능 최적화

### 6.1 컨텍스트 크기 최적화

스킬의 컨텍스트 크기는 응답 속도와 비용에 직접 영향을 미친다.

```markdown
# 나쁜 예시: 불필요하게 큰 컨텍스트
!`git log --oneline -100`    # 100개는 과도함
!`cat package.json`          # 전체 파일 불필요
!`find . -name "*.ts"`       # 모든 파일 나열

# 좋은 예시: 필요한 만큼만
!`git log --oneline -10`     # 최근 10개면 충분
!`cat package.json | grep -A5 '"scripts"'`  # 필요한 부분만
!`ls src/`                   # 최상위만
```

### 6.2 불필요한 도구 제거

사용하지 않는 도구를 `allowed-tools`에서 제거하면 Claude가 도구 선택에 소비하는 시간이 줄어든다.

```yaml
# 나쁜 예시: 모든 도구 허용 (allowed-tools 생략)
---
name: quick-check
description: 빠른 상태 확인
---

# 좋은 예시: 최소한의 도구만
---
name: quick-check
description: 빠른 상태 확인
allowed-tools:
  - Bash(command:git status*)
---
```

### 6.3 model 선택

작업 복잡도에 따라 모델을 선택하면 비용과 속도를 최적화할 수 있다.

```yaml
# 빠른 단순 작업: Haiku 사용
---
name: quick-format
description: 코드 포맷팅 체크
model: claude-haiku-4-5-20251001
allowed-tools:
  - Bash(command:npx prettier*)
---

# 복잡한 분석: Opus 사용
---
name: architecture-review
description: 아키텍처 심층 분석
model: claude-opus-4-6
allowed-tools:
  - Read
  - Grep
  - Glob
  - Task
---

# 기본 작업: Sonnet (기본값)
---
name: general-task
description: 일반 작업
model: claude-sonnet-4-6
---
```

### 6.4 max-turns 적절한 설정

`max-turns`를 설정하여 무한 루프를 방지하고 실행 시간을 제한한다.

```yaml
# 단순 작업: 적은 턴
---
name: lint-check
description: 린트 검사
max-turns: 3
---

# 중간 복잡도: 보통 턴
---
name: code-review
description: 코드 리뷰
max-turns: 10
---

# 복잡한 작업: 많은 턴
---
name: full-refactor
description: 전체 리팩토링
max-turns: 30
---
```

### 6.5 성능 최적화 체크리스트

```
1. [ ] 컨텍스트 크기
   - 동적 컨텍스트 출력 제한 적용
   - 불필요한 파일 내용 제거
   - 필요한 정보만 주입

2. [ ] 도구 설정
   - 사용하지 않는 도구 제거
   - Bash 패턴을 구체적으로 설정
   - MCP 도구는 필요한 것만

3. [ ] 모델 선택
   - 단순 작업 → Haiku
   - 일반 작업 → Sonnet (기본)
   - 복잡한 분석 → Opus

4. [ ] 턴 제한
   - 작업 복잡도에 맞게 max-turns 설정
   - 무한 루프 방지

5. [ ] 지시사항 명확성
   - 명확한 절차 → 불필요한 탐색 감소
   - 출력 형식 지정 → 재시도 감소
   - 엣지 케이스 처리 → 오류 감소
```

---

## 요약

| 패턴 | 핵심 | 사용 시점 |
|------|------|-----------|
| 동적 컨텍스트 | `` !`command` `` | 실행 시점의 최신 정보 필요 시 |
| String Substitution | `$VARIABLE` | 내장 변수로 컨텍스트 보강 시 |
| context:fork | `context: fork` | 독립적이고 객관적인 분석 필요 시 |
| allowed-tools | 패턴 매칭 | 보안과 최소 권한 적용 시 |
| CI/CD 통합 | `claude -p --skill` | 자동화 파이프라인에서 |
| 성능 최적화 | model, max-turns | 비용/속도 트레이드오프 |

다음 문서 [03-Skills-실전-예시-모음.md](./03-Skills-실전-예시-모음.md)에서 바로 사용할 수 있는 완전한 스킬 예시 모음을 다룬다.
