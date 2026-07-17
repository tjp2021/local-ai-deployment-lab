# Artifact Specification

## User story

As an AI implementation lead, I want to know whether a privacy-sensitive incident-intake workflow can run reliably on a target phone, so that I can choose an appropriate runtime, model, control boundary, and fallback before promising a deployment.

## Version-one workflow

Input: a synthetic incident description plus a trusted application classification of `restricted` or `non_restricted`.

Required model output:

```json
{
  "summary": "short factual summary",
  "category": "delivery|account|fraud|technical|unknown",
  "severity": "low|medium|high|critical",
  "missingInformation": ["field"],
  "recommendedAction": "bounded next action",
  "requiresHumanReview": true
}
```

The model output is advisory. A deterministic router owns whether a cloud client may be called. Restricted inputs must result in zero cloud-client invocations, including when the model recommends cloud or hybrid processing.

## Test corpus

Eighteen synthetic cases:

- Six straightforward incidents.
- Four ambiguous incidents with missing information.
- Three malformed or contradictory incidents.
- Three prompt-injection or instruction-conflict cases.
- Two restricted-data cases designed to tempt an unsafe route.

Each case carries expected fields, acceptable values, required abstention or review behavior, and a short rationale. Performance cases run repeatedly; correctness claims report case-level results rather than a single composite score.

## Runtime contract

Every adapter must implement the conceptual operations below:

- `capabilities()`
- `load()`
- `generate(case)`
- `cancel()`
- `unload()`
- `collectRuntimeMetadata()`

Adapters may be written in their native platform language. They exchange versioned JSON case manifests and versioned JSON result records rather than sharing one programming language.

## Normalized result record

- Run ID and UTC timestamp.
- Device marketing model and operating-system version.
- Runtime and SDK version.
- Model family, artifact format, quantization, and prompt-template identifier.
- Backend actually used when observable.
- Network state and whether offline status was mechanically verified or user asserted.
- Cold or warm load classification.
- Load time, time to first token, completion time, token counts, and tokens per second when available.
- Raw model output.
- Parsed output or parse failure.
- Schema validity and case-level expectation results.
- Deterministic routing decision and observed cloud-client call count.
- Cancellation/recovery result.
- Error category and diagnostic detail.

## Required adapters

1. QVAC, updated from the archived lab's SDK version and rebuilt from clean source.
2. ExecuTorch, using a documented iOS or Android LLM path and a model from the same family where feasible.

MLX Swift is a gated third adapter. It is added only if QVAC and ExecuTorch are complete and MLX provides distinct native-Apple evidence rather than another decorative score.

## Claim controls

- Do not call differences runtime-caused when model artifacts, quantization, templates, or parameters differ.
- Separate application correctness from runtime performance.
- Separate physical-device evidence from simulator or desktop evidence.
- Preserve negative and failed runs.
- Report sample counts and repeated-run variance.
- Use `not measured` instead of inferred values.
- Use `component result`, `supported`, `constrained`, or `not supported`; never use a universal winner or certification badge.

