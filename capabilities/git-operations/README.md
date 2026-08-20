# Git Operations 레이어

Git Operations 레이어는 저장소 상태 확인, 커밋, 푸시, PR 작업을 각각 독립적으로
수행합니다. 이 레이어는 하나의 Git 작업을 끝낸 뒤 다음 작업을 자동으로 시작하지 않습니다.

기계 판독 계약의 단일 출처는 [capability.yaml](capability.yaml)입니다.

## 역할

- 이 레이어는 사용자가 명시적으로 요청한 Git 작업 하나만 수행합니다.
- 이 레이어는 작업 전에 대상 브랜치와 변경 파일을 확인합니다.
- 이 레이어는 커밋, 푸시, PR 생성을 서로 다른 승인 단위로 취급합니다.
- 이 레이어는 커밋 메시지와 PR 본문에 자동화 도구 출처 문구를 넣지 않습니다.
- 이 레이어는 다음 Git 작업을 자동으로 호출하거나 자동 호출을 받지 않습니다.

## 흐름에서의 위치

```text
사용자 요청 → Git Operations#<variant> → 해당 Git 증거
```

Git Operations는 change, bugfix, review 흐름의 자동 단계가 아닙니다. 계약 고정 직후나
리뷰 완료 후처럼 사용자가 원하는 시점에 독립적으로 호출합니다.

## 입력과 출력

공통 선행 토큰은 없습니다. 각 variant는 자신의 작업에 필요한 저장소 상태와 사용자
승인을 확인합니다.

| Variant | 출력 | 설명 |
|---|---|---|
| `inspect` | `git.inspection` | 저장소와 브랜치 상태를 읽기 전용으로 확인합니다. |
| `commit` | `git.commit-ref` | 스테이징된 변경을 로컬 커밋으로 만듭니다. |
| `push` | `git.push-ref` | 승인된 로컬 커밋을 원격에 게시합니다. |
| `pr-preview` | `git.pr-preview` | 게시하지 않고 PR 내용을 작성합니다. |
| `pr-create` | `git.pr-ref` | 새 PR을 하나 생성합니다. |
| `pr-update` | `git.pr-ref` | 기존 PR의 내용이나 상태를 갱신합니다. |

## 실행 단위

모든 variant는 `git-operator` agent를 사용합니다. 각 variant는 필요한 최소 권한만
사용합니다.

| Variant | 파일 권한 | 네트워크 | 사용자 승인 |
|---|---|---|---|
| `inspect` | 읽기 권한을 사용합니다. | 저장소 조회 범위에서 사용합니다. | 별도 승인이 필요하지 않습니다. |
| `commit` | 쓰기 권한을 사용합니다. | 사용하지 않습니다. | 커밋 요청이 필요합니다. |
| `push` | 읽기 권한을 사용합니다. | 원격 게시에 사용합니다. | 명시적인 승인이 필요합니다. |
| `pr-preview` | 읽기 권한을 사용합니다. | 사용하지 않습니다. | 별도 승인이 필요하지 않습니다. |
| `pr-create` | 읽기 권한을 사용합니다. | PR 생성에 사용합니다. | 명시적인 승인이 필요합니다. |
| `pr-update` | 읽기 권한을 사용합니다. | PR 갱신에 사용합니다. | 명시적인 승인이 필요합니다. |

## 완료와 실패

읽기 전용 variant는 확인한 변경 파일을 증거로 기록합니다. 게시 variant는
`approval-record: granted`와 `policy-decision`이 모두 있어야 완료합니다.

| 상황 | 처리 방식 |
|---|---|
| 대상 파일이나 브랜치가 불명확합니다. | 작업을 중단하고 범위를 확인합니다. |
| 기존 PR이 이미 있습니다. | `pr-create`를 사용하지 않고 `pr-update`로 전환합니다. |
| 원격 작업 승인이 없습니다. | 작업을 수행하지 않습니다. |
| 정책이 작업을 거부합니다. | 작업을 중단합니다. |

## 파일 안내

| 파일 | 역할 |
|---|---|
| [capability.yaml](capability.yaml) | variant별 권한, 승인, 완료 조건을 정의합니다. |
| [agents/git-operator.md](agents/git-operator.md) | Git 작업별 실행 절차를 정의합니다. |
| [hooks/no-auto-chaining.md](hooks/no-auto-chaining.md) | Git 작업의 자동 연쇄를 차단합니다. |
| [hooks/no-auto-attribution.md](hooks/no-auto-attribution.md) | 자동 출처 문구 추가를 차단합니다. |

## 관련 문서

- [Capability 레이어 안내서](../README.md)는 공통 계약 구조를 설명합니다.
- [운영 안내서](../../docs/operations.md)는 Git 작업이 자동 흐름과 분리되는 이유를 설명합니다.
- [데이터 처리 정책](../../policies/README.md)은 승인과 외부 작업 정책을 설명합니다.
