# Local AI Deployment Lab

Can a privacy-sensitive incident workflow run on a phone with no cloud inference, and how should the app behave when the model or the device can't meet the requirement?

This lab answers that with evidence from a real iPhone, not a benchmark. The headline result is that a deterministic policy gate held through a successful prompt injection, and that a runtime's structured-output guarantee turned out to be conditional rather than absolute.

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

**1. Authority beats alignment.** One fixture hides a prompt injection inside restricted incident text. The injection worked: the model recommended sending restricted data to the cloud. The router blocked it anyway, because the deterministic gate owns cloud invocation and model output can't authorize it. Same result on the phone as on the desktop.

**2. Structured-output guarantees degrade with schema complexity.** Constraining one field to a nineteen-value enum, holding runtime, model, prompt, and parameters constant, dropped valid output from 18/18 to 6/18 through truncated JSON and duplicate array items. The experimental schema and its evidence are preserved in [`contracts/experimental/`](contracts/experimental/).

**3. A published model artifact can be silently platform-specific.** A pre-built SpinQuant INT4 `.pte` from HuggingFace fails to load on ExecuTorch's iOS runner with error 32. The app pipeline, signing, install, and file delivery all worked. The exact failing stage stays unverified and is recorded that way.

## Reproduce it

```bash
npm install
npm run typecheck
npm run test:contracts-and-policy   # 15 contract and policy tests
npm run validate:fixtures           # 18 synthetic cases
npm run validate:evidence           # every committed record against its contract
npm run check:scrub                 # publication safety
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
