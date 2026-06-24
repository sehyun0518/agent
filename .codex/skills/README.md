# Codex Skill Mirror

이 디렉터리는 Codex가 읽기 쉬운 `SKILL.md` 포맷의 스킬 미러다. 현재 내용은
`.claude/skills`와 동일하게 맞춘다.

원본 개념은 루트 `skills/`에 있고, Claude/Codex 런타임용 패키징은
`<skill>/SKILL.md` 구조를 쓴다.

동기화가 필요할 때:

```sh
cp -R .claude/skills/. .codex/skills/
```

복사 후에는 다음을 확인한다:

```sh
diff -qr .claude/skills .codex/skills
```
