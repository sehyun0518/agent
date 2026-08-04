# Hook — 계약 고정

- 이벤트: `after-capability`
- blocking: 예. 통과하지 못하면 `specification.completed`를 낼 수 없다.
- 산출 증거: `changed-files` · `contract-diff`

## 왜 필요한가

병렬 실행이 서로 깨지지 않는 이유는 대화가 아니라 계약이다. 계약이 "고정 가능한
파일"로 존재하지 않으면 하류가 기댈 것이 없고, 각자 추측하다 어긋난다.

## 검사

1. 계약이 **파일로** 존재하는가 — 대화 속 서술이 아니라 하류가 읽을 수 있는 산출물인가
2. 다음이 빠짐없이 고정됐는가
   - 타입과 컴포넌트 props 인터페이스
   - API 요청/응답 스키마
   - 데이터 접근 인터페이스(훅 시그니처) — 실제 훅 없이도 하류가 코딩할 수 있어야 한다
   - test-id 규약 — DOM 없이도 테스트를 작성할 수 있어야 한다
3. 이전 고정본이 있으면 차이가 `contract-diff`로 기록됐는가
4. 계약에 모순이나 미정 항목이 남아 있지 않은가

## 증거 기록

```yaml
kind: contract-diff
status: recorded | violated
summary: "신규 인터페이스 4, 변경 1, 제거 0"
artifact: <경로>
producedBy: specification
```

`violated`는 이미 고정된 계약이 재고정 절차 없이 바뀐 경우다. 이때는
`contract-violation`으로 분류한다.

## 하류에 대한 약속

이 훅을 통과한 시점부터 계약은 고정이다. 하류는 계약이 부족하거나 모순되면
**추측하지 않고** 이 Capability로 되돌린다. 계약 변경이 필요하면 재고정한 뒤 재개한다.

## 범위 밖

계약을 커밋하는 것은 이 Capability의 일이 아니다. 커밋은 `git-operations#commit`의
독립 호출이며, 어떤 Capability도 이를 자동 호출하지 않는다.
