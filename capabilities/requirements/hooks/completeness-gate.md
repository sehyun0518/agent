# Hook — 완결성 게이트

- 이벤트: `after-capability`
- blocking: 예. 이 검사를 통과하지 못하면 `requirements.completed`를 낼 수 없다.
- 산출 증거: `completeness-check`

## 검사

`requirements-spec` 스킬의 "완결성 판정"이 단일 출처다. 여기서 다시 정의하지 않고
아래 항목을 그 스킬에 대고 검사한다.

1. 필수 슬롯 6개(`goal`·`target`·`design_ref`·`scope_in`·`scope_out`·
   `acceptance_criteria`)가 각각 "채워짐 판정 기준"을 통과했는가
2. `acceptance_criteria`가 객관적으로 검증 가능한 기준 2개 이상인가
3. `[추론]` 태그가 붙은 슬롯이 모두 사용자 확인을 받았거나, 미확인 항목이 스펙
   "비고"에 명시됐는가
4. 미해결·모순 항목이 0개인가
5. 산출 문서가 스킬의 "스펙 / 계약 문서 포맷" 템플릿을 따르는가

## 증거 기록

```yaml
kind: completeness-check
status: passed | failed
summary: "필수 슬롯 6/6, 수용 기준 3개, 미확인 추론 0"
producedBy: requirements
```

`failed`일 때는 `summary`에 **어떤 슬롯이 왜 미달인지**를 남긴다. 이 문자열이 그대로
다음 라운드의 질문 재료가 된다. "미달"만 적으면 되돌림이 무의미해진다.

## 실패 처리

`failed`면 Capability는 완료되지 않고 질문 라운드로 돌아간다. 슬롯당 재질문 한도(2회)를
넘으면 `contract-violation`으로 분류해 오케스트레이터로 에스컬레이션한다.

게이트 실패를 재시도로 우회하지 않는다. 같은 발화로 다시 돌려도 같은 빈칸이 남는다.
