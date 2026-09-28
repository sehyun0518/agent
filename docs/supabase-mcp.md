# Supabase MCP

`profiles/frontend/profile.yaml`의 `implementation` 바인딩이 서버와 도구 권한의
단일 출처다. `npm run generate`는 Claude 구현 에이전트의 `mcpServers`·`tools`와
Codex의 `.codex/config.toml`과 `.codex/agents/implementation.toml`에 같은 서버를
반영한다. TOML 파일이 실제 서브 에이전트 등록이며 Markdown 래퍼는 역할 안내다.
하네스의 다른 네이티브 역할에서는 배정되지 않은 MCP를 비활성화한다.

## 최초 연결

공식 원격 주소는 `https://mcp.supabase.com/mcp`이며 OAuth로 인증한다.
토큰을 저장소에 작성하지 않는다.

- Codex: 프로젝트를 신뢰한 상태에서 해당 저장소의 터미널에서
  `codex mcp login supabase`를 실행하고 브라우저에서 조직 접근을 승인한다.
  `codex mcp get supabase`로 설정을 확인하고 새 세션에서 도구 연결을 확인한다.
  새 세션에서 `implementation` 서브 에이전트를 호출하면 역할 TOML의 서버 설정을
  적용한다. 이 호스트의 OAuth 자격 증명을 사용하므로 서브 에이전트마다 로그인하지 않는다.
- Claude Code: 구현 에이전트에 서버가 인라인 등록된다. 메인 세션에서 먼저 인증하려면
  `claude mcp add --scope local --transport http supabase https://mcp.supabase.com/mcp`를
  실행한 후 `/mcp`에서 Supabase 인증을 완료한다. 에이전트 전용 서버 인증을
  백그라운드 작업에 맡기지 않는다.

## 프로젝트와 작업 범위

공용 하네스에는 특정 프로젝트 ID가 없다. 기본 주소는 인증한 조직에서 접근 가능한
프로젝트를 노출하므로, 소비 저장소에서 구현을 시작하기 전에 계약에 대상 프로젝트와
환경을 지정한다. 프로젝트 한정 연결은 원본 바인딩 URL에 `?project_ref=<project-id>`를
붙이고 다시 생성한다. 운영 조회용 연결은 `&read_only=true`를 추가한다.
URL을 바꾸면 해당 URL로 다시 인증한다. 프로젝트별 URL을 공용 하네스에 커밋하지 않는다.

구현 Capability의 네트워크 상한은 `allowlist`다. 소비 저장소의
`.agent-harness/profile.yaml`에서 `permissions.networkAllowlist`에
`mcp.supabase.com`을 포함한다. 이 목록은 하네스 선언이며 실제 네트워크 차단은
클라이언트 환경의 권한 설정에 따른다.

서버 연결 자체가 스키마 변경·배포·삭제를 승인하지 않는다. 구현 에이전트는 기존의
계약·계층별 red·파일 경계를 유지하고, 지정된 개발 프로젝트에서 허용된 작업만 수행한다.

## 생성과 검증

```sh
npm run generate
npm run check
```

소비 저장소로 생성할 때도 Codex 설정의 `BEGIN/END agent-harness MCP` 블록만
갱신하고 모델 설정과 개인 MCP는 보존한다. 관리 블록 밖에 같은 서버 이름이 있으면
충돌 오류를 내므로 해당 선언을 원본 바인딩으로 정리한 뒤 다시 실행한다.
생성물에 직접 프로젝트 URL을 고치면 다음 생성에서 되돌아간다.

공식 참고: [Supabase MCP](https://supabase.com/docs/guides/ai-tools/mcp),
[Codex MCP 설정](https://developers.openai.com/codex/mcp),
[Codex 서브 에이전트](https://learn.chatgpt.com/docs/agent-configuration/subagents).
