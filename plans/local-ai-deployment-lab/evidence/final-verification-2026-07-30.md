# Final verification, 2026-07-30

Status: PASS

## Acceptance evidence

- QVAC produced normalized desktop and physical iPhone evidence.
- ExecuTorch preserved a physical iPhone capability failure at the model-load
  boundary.
- The deterministic router produced zero cloud calls across eight restricted
  cases.
- The naive control leaked one restricted case to the cloud route.
- The vocabulary sweep corrected the first schema-complexity explanation.
- The committed evidence regenerates through one scoring implementation.
- The publication scrub found no configured private paths, device identifiers,
  signing data, or secret patterns.

## Final commands

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run test:contracts-and-policy` | PASS, 26 tests |
| `npm run validate:fixtures` | PASS, 18 fixtures |
| `npm run validate:results` | PASS |
| `npm run validate:evidence` | PASS, 9 files, 146 result records, 20 native records |
| `npm run check:scrub` | PASS |
| `node --import tsx scripts/replay-naive-router.ts` | PASS, naive 1 of 8, deterministic 0 of 8 |
| `planning_guardrail.py validate plans/local-ai-deployment-lab` | PASS |

## Closeout decision

Version one answers its deployment question with bounded evidence. Additional
work remains parked until a new model, runtime, device, or token-cap test would
change a real deployment decision.
