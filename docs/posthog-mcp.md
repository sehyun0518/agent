# PostHog MCP

`profiles/frontend/profile.yaml`의 `implementation` 바인딩이 PostHog 서버와
`mcp__posthog` 도구 권한의 단일 출처다. `npm run generate`는 Claude 구현 에이전트와
Codex의 `.codex/config.toml`과 `.codex/agents/implementation.toml`에 반영한다.
TOML이 실제 서브 에이전트 등록이며 다른 하네스 역할에서는 미배정 MCP를 비활성화한다.

## 최초 연결

공식 원격 MCP 주소는 `https://mcp.posthog.com/mcp`다. OAuth 인증 계정에 따라
US·EU 데이터 리전이 자동으로 선택된다. 공용 설정에 API 키나 프로젝트 ID를 넣지 않는다.

- Codex: 신뢰한 프로젝트의 터미널에서 `codex mcp login posthog`를 실행하고 브라우저에서
  인증한다. `codex mcp get posthog`는 설정 확인용이며, 인증 후 새 세션에서 프로젝트
  조회 도구가 동작하는지 확인한다.
  `implementation` 서브 에이전트는 역할 TOML의 MCP 설정과 이 호스트의 OAuth 자격
  증명을 사용한다. 설정 생성 이전에 시작한 세션은 새로 시작한다.
- Claude Code: 구현 에이전트에 서버가 인라인 등록된다. 메인 세션에서 먼저 인증하려면
  `claude mcp add --scope local --transport http posthog https://mcp.posthog.com/mcp`를
  실행한 뒤 `/mcp`에서 PostHog 인증을 완료한다.

## 구현 에이전트의 사용 범위

계약에 지정된 조직·프로젝트·환경을 먼저 확인한다. 이벤트와 속성, 오류, 기능 플래그를
조회해 구현 근거로 사용하고 계측 코드는 기존 `implementation#integration` 범위에서
작성한다. 이벤트 이름·샘플링·PII 처리 기준은
[관측성 계약](../profiles/frontend/knowledge/OBSERVABILITY.md)을 따른다.

기능 플래그 롤아웃·실험·대시보드 등 원격 변경은 현재 계약에 배정된 작업만 수행한다.
MCP 결과는 계층별 테스트 증거를 대체하지 않는다. 인증 정보와 불필요한 사용자 데이터를
파일·요약에 남기지 않는다.

소비 저장소의 `.agent-harness/profile.yaml`에서 `permissions.networkAllowlist`에
`mcp.posthog.com`을 포함한다. 하네스의 목록은 선언이며 실제 네트워크 접근은
클라이언트 환경의 권한 설정에 따른다.

## 공식 CLI가 필요한 경우

이 하네스는 에이전트 연결에 MCP를 사용한다. PostHog는 `@posthog/cli`도 제공하며,
소스맵·디버그 심볼 업로드 등 빌드 작업에는 소비 저장소에서 CLI를 별도로 설치할 수 있다.
이 설정에서는 CLI 패키지 설치나 CI 업로드를 추가하지 않는다.

```sh
npm install -g @posthog/cli@latest
posthog-cli login
posthog-cli --help
```

CLI 인증은 MCP 인증과 별도다. CI에서는 `POSTHOG_CLI_HOST`, `POSTHOG_CLI_PROJECT_ID`,
`POSTHOG_CLI_API_KEY`를 CI 비밀 저장소에서 제공한다. EU CLI 호스트는
`https://eu.posthog.com`이며, MCP의 공통 주소와 혼동하지 않는다.

공식 참고: [PostHog MCP](https://posthog.com/docs/model-context-protocol),
[PostHog CLI](https://github.com/PostHog/posthog/tree/master/cli).
