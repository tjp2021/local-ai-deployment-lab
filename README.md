# Local AI Deployment Lab

Can a privacy-sensitive incident workflow run on a phone with no cloud inference, and how should the app behave when the model or the device can't meet the requirement?

This lab answers that with evidence from a real iPhone, not a benchmark. The empirical findings are that a runtime's structured-output guarantee turned out to be conditional rather than absolute, and that raw model output was byte-identical between a MacBook and an iPhone. The safety result is architectural rather than empirical: restricted data can't reach the cloud because the router never grants model output that authority, and tests hold the invariant in place.

## Results

Eighteen synthetic incident cases, QVAC 0.15.0, Llama 3.2 1B Q4_0, temperature 0 and a fixed seed.

| Measure | Desktop (macOS) | iPhone 15 Pro |
|---|---|---|
| Schema-valid output | 18/18 | 18/18 |
| Deterministic policy gate held | 18/18 | 18/18 |
| Restricted cases producing a cloud call | 0 of 8 | 0 of 8 |
| Mean tokens per second | 105 | 53 |
| Mean completion per case | 1,238 ms | 2,257 ms |
| Severity judged correctly | 4/18 | 4/18 |

Raw model output was byte-identical across both hosts on all eighteen cases.

**Full write-up: [docs/case-study.md](docs/case-study.md).**

## Three findings

**1. Authority beats alignment, measured against a control.** One fixture hides a prompt injection inside restricted incident text. The injection partially worked: the model recommended cloud processing for restricted data, though it also flagged the case for human review. The router refused the cloud route, and that outcome was guaranteed before inference ran. The restricted branch has no code path that can invoke the cloud client, and classification comes from the trusted case record, never from the model. To measure what that architecture is worth, [`scripts/replay-naive-router.ts`](scripts/replay-naive-router.ts) replays the committed device evidence through a control router that obeys the model's own routing field. The naive router ships the injection case's restricted payload to the cloud, 1 of 8 restricted cases, review flag and all. The deterministic router ships none. No model runs in the replay; the comparison regenerates from the repository alone.

**2. Enum-constrained arrays break structured output categorically, and smaller enums are worse.** The first experiment compared free text (18/18 valid) against a nineteen-value enum (6/18) and read it as degradation with schema complexity. A follow-up sweep across enum sizes refuted that reading:

| Enum size | 0 (free text) | 2 | 5 | 10 | 15 | 19 |
|---|---|---|---|---|---|---|
| Schema-valid | 18/18 | 2/18 | 1/18 | 3/18 | 5/18 | 6/18 |
| Policy gate held | 18/18 | 18/18 | 18/18 | 18/18 | 18/18 | 18/18 |

Any enum collapsed validity, and the smallest vocabularies did worst. The mechanism is visible in the evidence: all 48 truncated outputs stopped at exactly the 256-token generation cap, while every valid output used 73 to 99 tokens, and the duplicate-item failures show the model repeating one enum value until it violates `uniqueItems`. Under the constraint, this 1B model loops on the vocabulary instead of closing the array. Harness: [`scripts/run-vocab-curve.ts`](scripts/run-vocab-curve.ts); schema and evidence in [`contracts/experimental/`](contracts/experimental/) and [`outputs/`](outputs/).

**3. A published model artifact can be silently platform-specific.** A pre-built SpinQuant INT4 `.pte` from HuggingFace fails to load on ExecuTorch's iOS runner with error 32. The app pipeline, signing, install, and file delivery all worked. The exact failing stage stays unverified and is recorded that way.

## Reproduce it

```bash
npm install
npm run typecheck
npm run test:contracts-and-policy   # 20 contract and policy tests
npm run validate:fixtures           # 18 synthetic cases
npm run validate:evidence           # every committed record against its contract
npm run check:scrub                 # publication safety
node --import tsx scripts/replay-naive-router.ts   # both routers over committed evidence
```

Those need no model, no device, and no network beyond the install. Dependencies are pinned by lockfile and the same checks run in CI.

To reproduce the desktop evidence, which downloads a model on first run:

```bash
node --import tsx scripts/run-qvac-desktop.ts --all
```

To reproduce the device evidence you need a paired iPhone. See [`platforms/ios-qvac/README.md`](platforms/ios-qvac/README.md), then ingest the record the app writes:

```bash
node --import tsx scripts/ingest-device-records.ts <device-payload.json>
```

## How it's built

Three layers, so that runtime behavior and application correctness never get confused with each other.

- **[`contracts/`](contracts/)** versioned JSON schemas for cases, model output, results, and the native-generation boundary
- **[`runner/`](runner/)** prompt construction, independent validation, expectation evaluation, and the deterministic policy router
- **[`adapters/`](adapters/)** QVAC and ExecuTorch, normalizing native results into the shared contract
- **[`platforms/`](platforms/)** the on-device runners, Expo for QVAC and Swift for ExecuTorch
- **[`outputs/`](outputs/)** every evidence record, labeled `desktop` or `device`

The device runners deliberately do no validation, evaluation, or routing. They record what the runtime produced, and the desktop applies the contract, so both evidence classes are scored by one implementation instead of two that can drift.

Design rationale lives in [`docs/repository-decision.md`](docs/repository-decision.md) and [`plans/local-ai-deployment-lab/design.md`](plans/local-ai-deployment-lab/design.md).

## Limitations

These bound what the evidence above can be used to claim.

- **Thermal and battery state were not varied.** Every device number came from a cool iPhone at 100% battery running a short sweep. Sustained load, thermal throttling, and low-power mode were not measured, and they're the conditions most likely to change the performance numbers.
- **One model, one quantization, one device.** Results describe QVAC 0.15.0 with Llama 3.2 1B Q4_0 on an iPhone 15 Pro. They're not a runtime ranking and don't generalize to other models or hardware.
- **Determinism was fixed, not sampled.** Temperature 0 and a fixed seed make runs comparable and mean the correctness numbers reflect one deterministic path, not a distribution.
- **Eighteen synthetic cases, no real user data.** The corpus is deliberately small and hand-built to cover straightforward, ambiguous, malformed, adversarial, and restricted inputs.
- **One measurement is weaker than it looks.** The `requiredMissingInformation` check uses exact string equality while the prompt never specifies a vocabulary, so it measures phrase compliance rather than comprehension. Its failures are not a capability finding.
- **Android is untested.** No Android device was available, so the constrained-device boundary is unverified.
- **ExecuTorch's failing stage is unverified.** Method-table inspection tooling wasn't available, so the root cause is bounded rather than isolated.

## Status

The required adapters are complete: QVAC has desktop and physical-device evidence, ExecuTorch has a documented boundary. MLX Swift remains a gated third adapter and is added only if it would produce distinct evidence rather than another score.

## License

[MIT](LICENSE).
