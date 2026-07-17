# Source Packet

Prepared: 2026-07-17  
Decision state: approved reference implementation  
Audience: AI implementation, solutions engineering, deployment strategy, technical product, developer experience, and local-first AI teams

## Sourced problem

Running a model successfully on a device does not establish that an application workflow is reliable. Local AI deployments must qualify device eligibility, model/runtime compatibility, output validity, offline behavior, failure recovery, and deterministic controls outside model reasoning.

Public evidence:

| Source | Evidence | Why it matters |
|---|---|---|
| QVAC structured-output issue | https://github.com/tetherto/qvac/issues/3225 | A completed JSON object may fail to terminate cleanly, creating an application reliability problem rather than a raw-speed problem. Reproduction on the current SDK is still required. |
| QVAC model-download fallback issue | https://github.com/tetherto/qvac/issues/3224 | A local-first application can still fail during model acquisition when registry access is unavailable. Reproduction is not assumed. |
| QVAC profiler | https://docs.qvac.tether.io/runtime/profiler/ | QVAC already exposes runtime timing. The lab should consume existing measurements rather than reinventing a profiler. |
| ExecuTorch backends | https://docs.pytorch.org/executorch/stable/backends-section.html | Edge artifacts and acceleration differ by device backend; portable source models do not imply one identical deployable artifact. |
| ExecuTorch iOS LLM runtime | https://docs.pytorch.org/executorch/stable/llm/run-on-ios.html | ExecuTorch exposes load, generation, token streaming, cancellation, and multimodal runtime behavior suitable for a comparison adapter. |
| Apple model availability guidance | https://developer.apple.com/documentation/FoundationModels/generating-content-and-performing-tasks-with-foundation-models | Apple requires applications to check device/model availability and provide fallback behavior. |
| ONNX Runtime mobile guidance | https://onnxruntime.ai/docs/tutorials/mobile/ | Mobile qualification should include binary/model size, latency, power, and device-specific acceleration behavior. |

## Hiring-market relevance

Current AI deployment and solutions roles consistently ask candidates to translate real workflows into acceptance criteria, build last-mile integrations, distinguish model/data/workflow failures, add guardrails and fallbacks, and turn deployment findings into reusable patterns.

Representative role evidence:

- Thorin Forward Deployed Engineer: https://jobs.ashbyhq.com/thorin/c4a43a75-1a07-4595-bcc5-813c4c13c205
- Relevance AI Senior Solutions Engineer: https://jobs.ashbyhq.com/relevanceai/a08b362d-b5b5-4fad-a676-74dce8029cea
- Normal Computing Forward Deployed AI Engineer: https://jobs.ashbyhq.com/normalcomputing/a1829ea4-36fc-42a9-af1d-5382f121ccf7

These roles are market evidence, not application targets. Location, recency, and qualification gates must be checked separately before using any role as a job target.

## Buyer metrics

- Time from installation to first useful local result.
- Valid structured-output rate.
- Task correctness and appropriate abstention.
- Offline completion rate.
- Zero prohibited cloud calls for restricted inputs.
- Cold and warm model-load time.
- Time to first token and completion latency.
- Failure containment, cancellation, and recovery behavior.
- Device coverage and minimum viable hardware tier.
- Diagnostic clarity when a workflow cannot run.

## API and device reality

- QVAC and ExecuTorch provide public SDKs and documentation.
- Their deployable model artifacts and prompt templates may differ. Results cannot attribute quality differences solely to the runtime unless the relevant model, quantization, template, and generation parameters are controlled.
- Physical-device claims require captured device metadata from the runner.
- The Android device and tooling are not yet verified.
- Apple Foundation Models are not part of version one because eligibility differs by device and they would introduce a third model/runtime boundary.

## Artifact choice

A narrow cross-device deployment lab is appropriate because it demonstrates qualification, acceptance criteria, failure isolation, deterministic controls, and implementation communication. A generic benchmark dashboard would duplicate existing tools and encourage unsupported winner claims.

## Non-goals

- Rank all local AI runtimes.
- Certify a runtime or model as production-ready.
- Claim statistical generality from a small private device fleet.
- Train, fine-tune, or optimize model weights.
- Build a general-purpose benchmarking platform.
- Measure every hardware backend or modality.
- Use real customer, payment, health, or personal data.
- Publish device identifiers, signing material, local paths, or private logs.

