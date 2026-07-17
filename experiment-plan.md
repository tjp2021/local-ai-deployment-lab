# Experiment Plan

## Stage 0: inventory and comparability gate

1. Verify every physical device's marketing model, OS version, available storage, developer mode, and connection state.
2. Record the Android model, Android version, RAM, architecture, and chipset using device settings or `adb` after tooling is installed.
3. Select a common model family supported by QVAC and ExecuTorch.
4. Record unavoidable differences in model format, quantization, prompt template, tokenizer, and backend.
5. Stop any direct runtime-quality comparison that cannot control or disclose those differences.

Exit: at least one iOS device, one Android device, and two feasible runtime paths have verified capability records.

## Stage 1: contracts before runtimes

1. Create the versioned case-manifest schema.
2. Create the versioned result schema.
3. Implement schema validation and deterministic routing with an injected cloud-client spy.
4. Add unit tests proving restricted cases produce zero cloud calls under hostile model outputs.
5. Create and review the eighteen synthetic cases.

Exit: contract tests pass without loading any model.

## Stage 2: QVAC adapter

1. Build a clean adapter against the current supported SDK.
2. Reproduce the existing physical-device baseline without copying generated bundles or private Expo state.
3. Run one cold load, five warm performance repetitions, and the correctness corpus.
4. Test cancellation and one subsequent successful generation.
5. Preserve raw output before analysis.

Exit: a fresh clone can run the adapter and emit schema-valid raw evidence on one physical device.

## Stage 3: ExecuTorch adapter

1. Use the documented package path rather than a custom backend build.
2. Select the closest feasible model family and document artifact differences.
3. Emit the same normalized result schema.
4. Run the same bounded case and lifecycle sequence on at least one physical device.

Exit: the report can compare deployment behavior without implying an uncontrolled model-quality ranking.

## Stage 4: cross-device boundary

1. Run the supported adapter/device combinations.
2. Treat inability to load, memory pressure, missing acceleration, or unsupported architecture as findings.
3. Do not substitute a stronger device to conceal a low-end failure.
4. Classify each combination as `supported`, `constrained`, `not_supported`, or `not_tested`, with evidence.

Exit: at least one high-capability and one constrained device produce a defensible deployment recommendation.

## Stage 5: adversarial review and publication gate

1. Review every claim against raw evidence.
2. Verify that runtime, model, device, and application failures are not conflated.
3. Scrub identifiers, absolute paths, credentials, signing artifacts, private logs, and job-specific language.
4. Seek upstream validation through a reproduction, regression test, documentation change, or substantive maintainer response.
5. Publish only after Tim reviews the exact repository, case study, and video.

## Deferred measurements

Battery-drain testing, sustained thermal testing, peak resident memory, delegated inference, multimodal tasks, and Apple Foundation Models are deferred until version one proves they would change a deployment decision.

## Stop conditions

- Stop adding runtimes if two adapters already answer the deployment question.
- Stop a runtime integration after one bounded day if setup complexity is the only remaining output; document the blocker instead.
- Stop publication if the result depends on private files, manual edits that are not documented, or a claim that cannot be regenerated.
- Stop direct quality comparison when model or prompt controls are materially different.

