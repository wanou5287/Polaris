# Claude Code Skills 생성 실전 가이드

> Claude Code Skills를 처음부터 만들고, 테스트하고, 운영하는 완전한 튜토리얼

---

## 1. 시작하기 전에

### 1.1 Skills란?

Skills는 Claude Code에 재사용 가능한 지시사항을 추가하는 마크다운 파일이다. 두 가지 유형이 있다:

| 유형 | 위치 | 호출 방식 | 용도 |
|------|------|-----------|------|
| **Reference (User-Invocable)** | `.claude/skills/` | `/command` 슬래시 명령 | 사용자가 직접 호출 |
| **Task (Agent-Invocable)** | `.claude/agents/` | `subagent_type` 매칭 | 에이전트가 자동 호출 |

### 1.2 디렉토리 구조

```
project-root/
├── .claude/
│   ├── skills/                    # User-Invocable Skills
│   │   ├── code-review.md         # /code-review로 호출
│   │   ├── deploy.md              # /deploy로 호출
│   │   └── generate-tests.md      # /generate-tests로 호출
│   ├── agents/                    # Agent-Invocable Skills
│   │   ├── test-runner.md         # Task 도구가 자동 매칭
│   │   └── security-scanner.md    # Task 도구가 자동 매칭
│   ├── settings.json              # Claude Code 설정
│   └── CLAUDE.md                  # 프로젝트 컨텍스트
```

### 1.3 Skills 개발 환경 준비

```bash
# Claude Code 최신 버전 확인
claude --version

# 프로젝트에 skills 디렉토리 생성
mkdir -p .claude/skills
mkdir -p .claude/agents

# 설정 파일 확인
cat .claude/settings.json
```

### 1.4 첫 스킬 만들기 (Hello World)

가장 간단한 스킬을 만들어보자.

```markdown
---
name: hello
description: 인사말을 출력하는 간단한 스킬
---

사용자에게 "안녕하세요! Claude Code Skills가 정상 작동합니다."라고 인사하세요.
현재 프로젝트 디렉토리와 Git 브랜치 정보를 함께 알려주세요.
```

이 파일을 `.claude/skills/hello.md`로 저장한 뒤 Claude Code에서 `/hello`를 입력하면 실행된다.

---

## 2. Reference 스킬 튜토리얼 (User-Invocable)

Reference 스킬은 사용자가 `/command` 형태로 직접 호출하는 스킬이다.

### Step 1: SKILL.md 파일 생성

`.claude/skills/` 디렉토리에 마크다운 파일을 생성한다. 파일명이 곧 명령어가 된다.

```bash
# /code-review 명령어를 만들려면
touch .claude/skills/code-review.md
```

### Step 2: Frontmatter 작성

YAML Frontmatter에 스킬의 메타데이터를 정의한다.

```yaml
---
name: code-review
description: 현재 변경사항에 대한 코드 리뷰를 수행합니다
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(command:git diff*)
  - Bash(command:git log*)
  - Bash(command:git show*)
---
```

**Frontmatter 필드 설명:**

| 필드 | 필수 | 설명 |
|------|------|------|
| `name` | Yes | 스킬 이름 (슬래시 명령어로 사용) |
| `description` | Yes | 스킬 설명 (도움말에 표시) |
| `allowed-tools` | No | 허용할 도구 목록 (미지정 시 모든 도구 사용 가능) |
| `context` | No | `fork` 설정 시 독립 컨텍스트에서 실행 |
| `model` | No | 사용할 모델 (`claude-haiku-4-5-20251001` 등) |
| `max-turns` | No | 최대 턴 수 제한 |

### Step 3: Body 작성

Frontmatter 아래에 상세 지시사항을 작성한다. 이 부분이 Claude에게 전달되는 실제 프롬프트다.

```markdown
## 코드 리뷰 수행 지침

### 리뷰 범위
1. `git diff --cached`로 staged 변경사항을 확인하세요
2. staged가 없으면 `git diff`로 unstaged 변경사항을 확인하세요
3. 변경된 파일 목록을 먼저 파악하세요

### 리뷰 관점
다음 관점에서 코드를 리뷰하세요:

1. **정확성**: 로직 오류, 엣지 케이스 누락
2. **보안**: SQL injection, XSS, 인증 우회 등
3. **성능**: N+1 쿼리, 불필요한 반복, 메모리 누수
4. **가독성**: 네이밍, 함수 크기, 복잡도
5. **테스트**: 테스트 커버리지, 엣지 케이스

### 출력 형식
```
## 코드 리뷰 결과

### 요약
- 변경 파일: N개
- 심각도 높은 이슈: N개
- 개선 제안: N개

### 이슈 목록
#### [심각도: 높음/중간/낮음] 이슈 제목
- **파일**: `path/to/file.ts:42`
- **설명**: 이슈 설명
- **제안**: 수정 방안
```
```

### Step 4: 테스트

```bash
# Claude Code에서 스킬 호출
# 터미널에 아래와 같이 입력
claude

# Claude Code 프롬프트에서:
# > /code-review
```

스킬이 정상 로딩되면 description이 표시되고, Body의 지시사항에 따라 코드 리뷰가 수행된다.

### 완전한 예시: `/code-review` 스킬

아래는 실무에서 바로 사용할 수 있는 완전한 SKILL.md 파일이다.

`.claude/skills/code-review.md`:

```markdown
---
name: code-review
description: Git 변경사항에 대한 종합 코드 리뷰를 수행합니다. 인자로 파일 경로를 지정하면 해당 파일만 리뷰합니다.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(command:git *)
---

당신은 시니어 소프트웨어 엔지니어로서 코드 리뷰를 수행합니다.

## 입력 처리
- `$ARGUMENTS`가 비어있으면: staged → unstaged → 최근 커밋 순으로 변경사항 탐색
- `$ARGUMENTS`에 파일 경로가 있으면: 해당 파일만 리뷰
- `$ARGUMENTS`에 PR 번호가 있으면: 해당 PR의 변경사항 리뷰

## 리뷰 절차

### 1단계: 변경사항 파악
```bash
# staged 변경사항
git diff --cached --stat
git diff --cached

# unstaged 변경사항
git diff --stat
git diff

# 최근 커밋
git log --oneline -5
```

### 2단계: 파일별 심층 분석
변경된 각 파일에 대해:
1. Read 도구로 파일 전체를 읽어 컨텍스트 파악
2. 변경 부분의 의도를 이해
3. 주변 코드와의 일관성 확인

### 3단계: 이슈 분류
각 이슈를 아래 카테고리로 분류:

| 심각도 | 설명 | 예시 |
|--------|------|------|
| CRITICAL | 즉시 수정 필요 | 보안 취약점, 데이터 손실 위험 |
| WARNING | 수정 권장 | 성능 문제, 잠재적 버그 |
| INFO | 개선 제안 | 코드 스타일, 리팩토링 |

### 4단계: 결과 출력

아래 형식으로 리뷰 결과를 출력하세요:

```
## 코드 리뷰 결과

### 요약
| 항목 | 값 |
|------|-----|
| 리뷰 대상 | [브랜치/커밋/파일] |
| 변경 파일 수 | N개 |
| 추가/삭제 라인 | +N / -N |
| CRITICAL 이슈 | N개 |
| WARNING 이슈 | N개 |
| INFO 이슈 | N개 |

### CRITICAL 이슈
> 이슈가 없으면 "CRITICAL 이슈 없음" 표시

#### 1. [이슈 제목]
- **파일**: `path/to/file.ts:42`
- **코드**:
  ```
  문제가 되는 코드
  ```
- **문제**: 상세 설명
- **수정안**:
  ```
  수정된 코드
  ```

### WARNING 이슈
(동일 형식)

### INFO 이슈
(동일 형식)

### 전체 평가
[변경사항에 대한 종합 의견 1-2문장]
```
```

---

## 3. Task 스킬 튜토리얼 (Agent-Invocable)

Task 스킬은 Claude Code의 Task 도구가 자동으로 매칭하여 호출하는 에이전트 스킬이다.

### 3.1 `.claude/agents/` 디렉토리에 배치

```bash
mkdir -p .claude/agents
touch .claude/agents/test-runner.md
```

### 3.2 subagent_type으로 호출하는 방법

Task 스킬은 `subagent_type` 파라미터와 에이전트 파일의 `name`이 매칭될 때 호출된다.

```markdown
---
name: test-runner
description: 테스트를 실행하고 결과를 분석하는 에이전트
allowed-tools:
  - Bash(command:npm test*)
  - Bash(command:npx jest*)
  - Bash(command:npx vitest*)
  - Read
  - Glob
---
```

Claude Code가 Task 도구를 사용할 때, `subagent_type: "test-runner"`로 지정하면 이 에이전트가 활성화된다.

### 3.3 Team 워크플로우에서 활용

팀 설정(`settings.json`)에서 에이전트를 역할로 정의할 수 있다:

```json
{
  "team": {
    "members": [
      {
        "name": "tester",
        "skill": "test-runner",
        "description": "테스트 실행 및 결과 분석 담당"
      },
      {
        "name": "reviewer",
        "skill": "code-review",
        "description": "코드 리뷰 담당"
      }
    ]
  }
}
```

### 완전한 예시: `test-runner` 에이전트 스킬

`.claude/agents/test-runner.md`:

```markdown
---
name: test-runner
description: 프로젝트의 테스트를 실행하고, 실패한 테스트를 분석하여 원인과 수정 방안을 제시합니다.
allowed-tools:
  - Bash(command:npm test*)
  - Bash(command:npm run test*)
  - Bash(command:npx jest*)
  - Bash(command:npx vitest*)
  - Bash(command:python -m pytest*)
  - Bash(command:go test*)
  - Read
  - Grep
  - Glob
model: claude-sonnet-4-6
max-turns: 15
---

당신은 테스트 전문가 에이전트입니다. 테스트를 실행하고 결과를 분석합니다.

## 절차

### 1단계: 프로젝트 테스트 환경 감지
프로젝트 루트의 설정 파일을 확인하여 테스트 프레임워크를 감지하세요:
- `package.json` → Jest, Vitest, Mocha
- `pytest.ini` / `pyproject.toml` → pytest
- `go.mod` → go test

### 2단계: 테스트 실행
감지된 프레임워크에 맞는 명령어로 테스트를 실행하세요.

```bash
# JavaScript/TypeScript
npm test -- --verbose 2>&1

# Python
python -m pytest -v 2>&1

# Go
go test ./... -v 2>&1
```

### 3단계: 결과 분석
테스트 결과를 파싱하여 다음을 보고하세요:

1. **전체 통계**: 총 테스트 수, 성공, 실패, 스킵
2. **실패 분석**: 각 실패 테스트에 대해
   - 테스트 이름과 파일 위치
   - 에러 메시지
   - 기대값 vs 실제값
   - 추정 원인
   - 수정 제안

### 4단계: 출력 형식

```
## 테스트 실행 결과

| 항목 | 값 |
|------|-----|
| 프레임워크 | [Jest/Vitest/pytest 등] |
| 전체 | N개 |
| 성공 | N개 |
| 실패 | N개 |
| 스킵 | N개 |
| 실행 시간 | N.Ns |

### 실패한 테스트
(실패 테스트가 없으면 "모든 테스트 통과!" 표시)

#### `test name`
- **파일**: `path/to/test.ts:42`
- **에러**: 에러 메시지
- **원인**: 추정 원인
- **수정안**: 구체적 수정 방법
```
```

---

## 4. Hooks 연동

Hooks는 Claude Code의 특정 이벤트에 반응하여 자동으로 실행되는 셸 명령이다. Skills와 조합하면 강력한 자동화가 가능하다.

### 4.1 Hook 개념

```json
// .claude/settings.json
{
  "hooks": {
    "user_prompt_submit": [
      {
        "command": "echo 'prompt submitted'",
        "description": "프롬프트 제출 시 실행"
      }
    ],
    "pre_tool_use": [
      {
        "command": "echo 'before tool use'",
        "description": "도구 사용 전 실행"
      }
    ],
    "post_tool_use": [
      {
        "command": "echo 'after tool use'",
        "description": "도구 사용 후 실행"
      }
    ],
    "notification": [
      {
        "command": "echo 'notification'",
        "description": "알림 발생 시 실행"
      }
    ]
  }
}
```

### 4.2 Hook 이벤트 종류

| 이벤트 | 실행 시점 | 용도 |
|--------|----------|------|
| `user_prompt_submit` | 사용자 프롬프트 제출 시 | 입력 전처리, 컨텍스트 추가 |
| `pre_tool_use` | 도구 실행 전 | 검증, 차단, 로깅 |
| `post_tool_use` | 도구 실행 후 | 후처리, 알림 |
| `notification` | Claude가 알림 발생 시 | 데스크톱 알림, 슬랙 알림 |

### 4.3 user_prompt_submit Hook과 Skills 조합

사용자가 프롬프트를 제출할 때마다 프로젝트 상태를 자동으로 주입하는 예시:

```json
{
  "hooks": {
    "user_prompt_submit": [
      {
        "command": "echo \"현재 브랜치: $(git branch --show-current), 미커밋 변경: $(git status --short | wc -l | tr -d ' ')개\"",
        "description": "프롬프트에 Git 상태 자동 추가"
      }
    ]
  }
}
```

### 4.4 notification Hook 활용

작업 완료 시 macOS 알림을 보내는 예시:

```json
{
  "hooks": {
    "notification": [
      {
        "command": "osascript -e 'display notification \"$NOTIFICATION_MESSAGE\" with title \"Claude Code\"'",
        "description": "macOS 알림 전송"
      }
    ]
  }
}
```

### 4.5 완전한 예시: 커밋 전 자동 린트 검사

`.claude/settings.json`:

```json
{
  "hooks": {
    "pre_tool_use": [
      {
        "command": "if [ \"$TOOL_NAME\" = \"Bash\" ] && echo \"$TOOL_INPUT\" | grep -q 'git commit'; then cd $PROJECT_DIR && npm run lint --silent 2>&1 || echo 'LINT_FAILED: 린트 오류를 수정한 후 커밋하세요'; fi",
        "description": "git commit 실행 전 자동 린트 검사"
      }
    ]
  }
}
```

이 Hook은:
1. `Bash` 도구가 호출될 때 실행
2. 명령어에 `git commit`이 포함되어 있는지 확인
3. 포함되어 있으면 `npm run lint`를 먼저 실행
4. 린트 실패 시 에러 메시지를 출력하여 커밋을 차단

린트 통과 후 자동 커밋하는 스킬과 조합:

`.claude/skills/safe-commit.md`:

```markdown
---
name: safe-commit
description: 린트와 테스트를 통과한 후에만 커밋합니다
allowed-tools:
  - Bash(command:npm run lint*)
  - Bash(command:npm test*)
  - Bash(command:git add*)
  - Bash(command:git commit*)
  - Bash(command:git status*)
  - Bash(command:git diff*)
---

안전한 커밋을 수행합니다. 아래 절차를 반드시 따르세요.

## 절차

### 1단계: 변경사항 확인
```bash
git status
git diff --cached --stat
```

### 2단계: 린트 실행
```bash
npm run lint
```
- 린트 실패 시: 오류를 수정하고 다시 실행
- 린트 성공 시: 다음 단계 진행

### 3단계: 테스트 실행
```bash
npm test
```
- 테스트 실패 시: 실패 원인을 보고하고 중단
- 테스트 성공 시: 다음 단계 진행

### 4단계: 커밋
staged 변경사항을 분석하여 Conventional Commits 형식으로 커밋 메시지를 생성하세요.

```bash
git commit -m "type(scope): description"
```
```

---

## 5. 서브에이전트 활용

### 5.1 Task 도구로 서브에이전트 호출

Skills에서 Task 도구를 `allowed-tools`에 포함하면 서브에이전트를 활용할 수 있다.

```yaml
---
name: full-analysis
description: 코드 분석, 보안 스캔, 테스트를 병렬로 수행합니다
allowed-tools:
  - Task
  - Read
  - Bash(command:git *)
---
```

### 5.2 병렬 작업 패턴

서브에이전트는 독립적인 작업을 병렬로 수행할 때 효과적이다:

```
메인 에이전트 (full-analysis)
├── 서브에이전트 1: 코드 복잡도 분석
├── 서브에이전트 2: 보안 취약점 스캔
└── 서브에이전트 3: 테스트 커버리지 분석
```

### 5.3 완전한 예시: 병렬 분석 스킬

`.claude/skills/full-analysis.md`:

```markdown
---
name: full-analysis
description: 코드 품질, 보안, 테스트를 병렬로 분석하여 종합 리포트를 생성합니다
allowed-tools:
  - Task
  - Read
  - Grep
  - Glob
  - Bash(command:git *)
---

프로젝트의 종합 분석을 수행합니다. 3가지 분석을 **병렬로** 실행하세요.

## 병렬 분석 작업

### 작업 1: 코드 품질 분석 (Task 도구 사용)
서브에이전트에게 다음을 요청하세요:
- 변경된 파일의 순환 복잡도 확인
- 함수 길이, 중첩 깊이 분석
- 코드 중복 탐지
- 네이밍 일관성 검사

### 작업 2: 보안 분석 (Task 도구 사용)
서브에이전트에게 다음을 요청하세요:
- 하드코딩된 시크릿 탐지 (API 키, 비밀번호)
- SQL injection, XSS 취약점 패턴 검색
- 안전하지 않은 의존성 사용 확인
- 인증/인가 로직 검증

### 작업 3: 테스트 분석 (Task 도구 사용)
서브에이전트에게 다음을 요청하세요:
- 테스트 존재 여부 확인
- 변경된 코드에 대한 테스트 커버리지 추정
- 누락된 테스트 케이스 식별

## 종합 리포트

3개 서브에이전트의 결과를 종합하여 아래 형식으로 출력하세요:

```
## 종합 분석 리포트

### 코드 품질: [A/B/C/D/F]
(서브에이전트 1 결과 요약)

### 보안: [A/B/C/D/F]
(서브에이전트 2 결과 요약)

### 테스트: [A/B/C/D/F]
(서브에이전트 3 결과 요약)

### 우선 조치 사항
1. [가장 긴급한 항목]
2. [두 번째 항목]
3. [세 번째 항목]
```
```

---

## 6. 디버깅

### 6.1 스킬 로딩 문제 진단

스킬이 `/command`로 호출되지 않을 때 확인할 사항:

```bash
# 1. 파일 위치 확인
ls -la .claude/skills/

# 2. 파일 확장자 확인 (.md여야 함)
file .claude/skills/my-skill.md

# 3. 파일 인코딩 확인 (UTF-8이어야 함)
file -I .claude/skills/my-skill.md

# 4. Frontmatter 유효성 확인
head -20 .claude/skills/my-skill.md
```

### 6.2 Frontmatter 파싱 오류

흔한 Frontmatter 오류와 해결법:

```yaml
# 잘못된 예시 1: --- 누락
name: my-skill
description: 설명
---

# 올바른 예시: 시작과 끝에 --- 필요
---
name: my-skill
description: 설명
---
```

```yaml
# 잘못된 예시 2: 들여쓰기 불일치
---
name: my-skill
allowed-tools:
  - Read
   - Grep    # 들여쓰기가 다름!
---

# 올바른 예시: 일관된 들여쓰기
---
name: my-skill
allowed-tools:
  - Read
  - Grep
---
```

```yaml
# 잘못된 예시 3: 특수문자 미처리
---
name: my-skill
description: "설명에 : 콜론이 있으면 따옴표 필요"
---
```

### 6.3 권한 문제 해결

`allowed-tools`에서 도구가 차단될 때:

```yaml
# 문제: Bash 명령어가 실행되지 않음
allowed-tools:
  - Bash

# 해결: 구체적인 패턴 사용
allowed-tools:
  - Bash(command:npm *)
  - Bash(command:git *)
```

```yaml
# 문제: MCP 도구가 인식되지 않음
allowed-tools:
  - github_tool

# 해결: MCP 도구는 전체 경로 사용
allowed-tools:
  - mcp__github__create_pull_request
  - mcp__github__list_issues
```

### 6.4 컨텍스트 로딩 실패

동적 컨텍스트(`!`command``)가 작동하지 않을 때:

```markdown
# 문제: 명령어 실행 실패
!`nonexistent-command`

# 해결: 명령어가 시스템에 존재하는지 확인
!`which git && git log --oneline -5`

# 문제: 출력이 너무 큼
!`cat very-large-file.json`

# 해결: 출력 제한
!`head -50 very-large-file.json`
```

### 6.5 디버깅 체크리스트

스킬이 예상대로 작동하지 않을 때 아래 순서로 확인:

```
1. [ ] 파일 위치가 올바른가?
   - User-Invocable: .claude/skills/
   - Agent-Invocable: .claude/agents/

2. [ ] 파일 확장자가 .md인가?

3. [ ] Frontmatter가 올바른가?
   - 시작과 끝에 --- 있는가?
   - YAML 문법이 유효한가?
   - name 필드가 있는가?
   - description 필드가 있는가?

4. [ ] allowed-tools가 올바른가?
   - 필요한 도구가 모두 포함되어 있는가?
   - Bash 패턴이 올바른가?
   - MCP 도구 경로가 올바른가?

5. [ ] 동적 컨텍스트가 올바른가?
   - !`command` 문법이 맞는가?
   - 명령어가 시스템에 설치되어 있는가?
   - 출력 크기가 적절한가?

6. [ ] Body 지시사항이 명확한가?
   - Claude가 이해할 수 있는 지시사항인가?
   - 출력 형식이 명시되어 있는가?
   - 엣지 케이스가 처리되어 있는가?

7. [ ] Claude Code를 재시작했는가?
   - 스킬 파일 변경 후 재시작 필요할 수 있음
```

---

## 요약

| 단계 | 작업 | 핵심 |
|------|------|------|
| 1 | 디렉토리 생성 | `.claude/skills/` 또는 `.claude/agents/` |
| 2 | SKILL.md 작성 | Frontmatter + Body |
| 3 | 도구 권한 설정 | `allowed-tools`로 최소 권한 |
| 4 | 테스트 | `/command`로 호출하여 검증 |
| 5 | Hook 연동 | `settings.json`에서 자동화 |
| 6 | 서브에이전트 | 병렬 작업으로 효율 극대화 |
| 7 | 디버깅 | 체크리스트로 문제 해결 |

다음 문서 [02-Skills-고급-패턴.md](./02-Skills-고급-패턴.md)에서 동적 컨텍스트, String Substitution, CI/CD 통합 등 고급 패턴을 다룬다.
