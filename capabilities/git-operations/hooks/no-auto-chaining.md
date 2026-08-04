# Hook — 자동 연쇄 금지

- 이벤트: `before-tool`
- blocking: 예.

## 검사

현재 실행 중인 변형이 **자기 몫이 아닌 Git 명령**을 실행하려 하면 차단한다.

| 실행 중인 변형 | 허용 | 차단 |
|---|---|---|
| `inspect` | 조회 명령만 | 쓰기·게시 전부 |
| `commit` | `git add`(명시 경로) · `git commit` · `git status` · `git diff` | `git push` · PR 생성 |
| `push` | `git push` · 조회 명령 | `git commit` · PR 생성 |
| `pr-preview` | 조회 명령만 | 쓰기·게시 전부 |
| `pr-create` | PR 생성 | `git commit` · `git push` |
| `pr-update` | PR 갱신 | `git commit` · `git push` · PR 생성 |

이력 재작성(`rebase` · `--amend` · `push --force`)은 모든 변형에서 기본 차단이며,
명시적 요청과 `approval-record`가 둘 다 있어야 통과한다.

## 왜 도구 단계에서 막는가

프롬프트로 "push하지 마세요"라고 적는 것과 명령을 실제로 막는 것은 다르다. 앞의 것은
지켜지지 않아도 아무 일이 일어나지 않고, 뒤의 것은 지켜진다.

Git 작업은 되돌리기 어렵거나 외부에 나가는 작업이라 "한 번 잘못"의 비용이 크다.
그래서 `capability.yaml`의 `chaining.autoInvoke: false`(선언)와 이 훅(실행) 두 겹으로 막는다.

## 차단 시

`policy-denied`로 분류한다. `action: halt`이므로 재시도하지 않는다 — 재시도로 뚫리면
막는 의미가 없다.

사용자에게 무엇이 차단됐고 어떤 커맨드를 대신 명시적으로 호출해야 하는지 알린다.
