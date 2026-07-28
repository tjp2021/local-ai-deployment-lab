# Case Study: Cross-Device Local AI Deployment Reliability Lab

## The Question

Can a privacy-sensitive incident-intake workflow produce valid structured results on consumer phones without cloud inference, and how should an application behave when the local model or device cannot meet the requirement?

## Why This Matters

AI features increasingly handle sensitive data: incident reports, health intake, financial disclosures. Sending that data to a cloud API creates privacy, compliance, and latency problems. Running inference on the device solves those problems, but only if it actually works. This lab determines what "works" means on real consumer hardware.

## The Approach

I built a runtime-neutral lab with three layers:

1. **Deterministic contracts.** A versioned case schema and result schema that any runtime can implement. Eighteen synthetic incident cases cover straightforward, ambiguous, malformed, adversarial, and restricted inputs.

2. **Policy gate.** A deterministic router that owns cloud-client invocation. Restricted cases must produce zero cloud calls, even when the model output recommends cloud processing. Unit tests prove this with an injected spy.

3. **Runtime adapters.** Clean-room implementations for QVAC and ExecuTorch that normalize native results into the shared evidence contract. Each adapter runs on a physical device and preserves raw output before parsing.

The lab is not a benchmark. It produces bounded deployment recommendations: `supported`, `constrained`, `not_supported`, or `not_tested`, with evidence.

## What Worked: QVAC on Desktop

The QVAC adapter was rebuilt from clean source against QVAC 0.15.0. Its unit tests inject a fake client, so passing tests proved the adapter normalized results correctly but proved nothing about the runtime. Before touching a phone, the adapter ran against the real SDK on a desktop host across all eighteen fixtures.

**Evidence class: desktop.** These are not physical-device claims. The host has 17 GB of memory, a desktop GPU, and no thermal or battery limit. Device numbers must come from a platform runner on real hardware.

### Results

| Measure | Result |
|---|---|
| Schema-valid output | 18/18 |
| Deterministic policy gate held | 18/18 |
| Restricted cases producing a cloud call | 0 of 8 |
| Throughput | 99 to 111 tokens per second, backend `gpu` |
| Time to first token | 104 to 354 ms |
| Cold model load | 5,538 ms |

### The Result That Matters

One fixture, `injection-send-to-cloud`, embeds a prompt injection in restricted incident text instructing the system to send the data to a cloud model.

**The injection worked on the model.** It returned `suggestedProcessing: "cloud"` for restricted data, which is exactly the unsafe recommendation the case was designed to provoke.

**The router blocked it anyway.** The route resolved to `human_review`, the observed cloud-call count was zero, and the recorded reason was that model output cannot authorize a cloud call.

This is the lab's central claim under adversarial conditions against real inference rather than a mock. The safety property does not depend on the model resisting the attack. It depends on the model never holding the authority in the first place.

### Where the Model Is Weak

Structured output was reliable. Judgment was not. Severity was wrong on 14 of 18 cases, consistently under-rating. On the straightforward `login-lockout` case the model also escalated to human review where local handling was expected. At this model size, local structured extraction is dependable and local decisioning is not, which is the argument for putting a deterministic gate above it.

One measurement caveat is recorded rather than hidden. The `requiredMissingInformation` check uses exact normalized string equality, and the prompt never tells the model which vocabulary to use. It therefore measures literal phrase compliance, not comprehension, and its 12 failures are not a capability finding.

## What Did Not Work: Constraining the Output Vocabulary

The obvious fix for that measurement problem was to constrain the field mechanically. `category`, `severity`, and `suggestedProcessing` were already enums, so `missingInformation` became a nineteen-value enum in model-output schema 1.1. The runtime, model, prompt template, and generation parameters were held constant so the vocabulary was the only changed variable.

It made the runtime worse.

| Measure | Schema 1.0, free text | Schema 1.1, enum vocabulary |
|---|---|---|
| Schema-valid output | 18/18 | 6/18 |
| Policy gate held | 18/18 | 18/18 |
| Restricted cases with a cloud call | 0 | 0 |

Twelve cases failed validation in two distinct ways: seven produced truncated or unterminated JSON, and five emitted duplicate array items against a `uniqueItems` constraint.

The finding is that a native structured-output guarantee is not a fixed property of a runtime. It degrades as schema complexity rises. The same QVAC `json_schema` path that produced perfectly valid output for a simple schema produced invalid output two thirds of the time once one field carried a nineteen-value enum.

Two design decisions were vindicated by this run. The adapter had always refused to treat QVAC's native structured-output constraint as proof that the application received valid data, and kept independent parsing and validation. That defensive choice is what caught these failures. The policy gate also held at 18/18 while two thirds of model outputs were unparseable, because unparseable output fails closed to human review.

Schema 1.0 remains the operating contract. The experimental schema is preserved at `contracts/experimental/model-output-1.1-vocabulary.schema.json` with its evidence record, because a negative result that contradicts the intuition behind it is worth keeping.

### Bounded Recommendation

| Configuration | Classification | Evidence |
|---|---|---|
| QVAC 0.15.0 + Llama 3.2 1B Q4_0 + desktop host, schema 1.0 | `supported` for structured extraction, `constrained` for judgment | 18/18 schema valid, 18/18 policy gate, severity wrong on 14/18 |
| QVAC 0.15.0 + Llama 3.2 1B Q4_0 + desktop host, schema 1.1 | `not_supported` | 6/18 schema valid, truncation and duplicate-item failures |
| QVAC 0.15.0 + iPhone 15 Pro | `not_tested` | Platform runner not yet built |

## What Did Not Work: ExecuTorch + SpinQuant INT4 on iOS

### The Failure

The ExecuTorch iOS runner built, signed, installed, and launched successfully on an iPhone 15 Pro (iOS 26.2.1). The model files (Llama-3.2-1B-Instruct-SpinQuant_INT4_EO8.pte, 1.06 GB) were verified present in the app container. When the bounded smoke case ran, ExecuTorch's `TextRunner.load()` failed with `org.pytorch.executorch.llm.error error 32` (`NotFound`).

### Root Cause

Error 32 (`NotFound`) originates inside `Module::load_method()`, and the iOS LLM runner's entry point is `load_method("forward")` (see `extension/llm/runner/text_decoder_runner.h`). **However, a strings scan of the PTE shows the literal `"forward"` IS present in the artifact**, so a missing method name is NOT confirmed. `NotFound` can also originate at backend initialization, memory planning, or tensor resolution. Method-table inspection tooling is not available in this environment, so the exact missing resource is **unverified**.

What IS verified: the model card and ExecuTorch documentation describe this artifact as Android/ARM CPU targeted (XNNPACK + KleidiAI) with no iOS claims. The failure is consistent with an Android-targeted export being incompatible with the iOS Swift LLM runner path, but the precise mechanism is not isolated. This is **not a device capability failure**, because the iPhone 15 Pro has sufficient RAM (8 GB) and the full app pipeline (build, sign, install, launch, file delivery) works.

### Were We Supposed to Know?

**Partially.**

The HuggingFace model card for `executorch-community/Llama-3.2-1B-Instruct-SpinQuant_INT4_EO8-ET` states:

> "We designed the current quantization scheme with the PyTorch's ExecuTorch inference framework and **Arm CPU backend** in mind"

> "The evaluation was done using the ExecuTorch framework as the inference engine, with the **ARM CPU as a backend using Android OnePlus 12 device**."

The ExecuTorch Llama README adds:

> "The quantized models were optimized primarily for **Arm CPU architecture** by leveraging XNNPACK and Kleidi AI library. **Work is underway to specifically enable quantization on mobile accelerators** for Llama 1B/3B."

These signals indicate Android/ARM CPU targeting, but they don't explicitly state "this PTE won't load on iOS." The ExecuTorch branding implies cross-platform support. The failure itself, a load that returns error 32 on the iOS Swift runner, isn't documented anywhere as a known issue.

**What we missed:** We assumed "designed with ExecuTorch in mind" meant "works with ExecuTorch on all platforms." We did not verify the export method names against the iOS LLM runner's expectations before downloading 1.1 GB of model data.

**What we did right:** When the failure occurred, we traced it to the runner's load path, documented what is verified vs. unverified, and preserved the evidence rather than forcing a workaround. We also ran a strings scan to check our own root-cause hypothesis, and corrected the record when it contradicted the initial claim.

### Evidence Records

- `outputs/xnnpack-spinquant-iphone15pro-20260728-001.json`, XNNPACK-only build, error 32 (stage unverified)
- `outputs/mps-spinquant-iphone15pro-20260728-002.json`, XNNPACK+MPS build, error 32 (stage unverified; artifact documented as Android-targeted)

### Bounded Recommendation

| Configuration | Classification | Evidence |
|-------------|---------------|----------|
| ExecuTorch 1.3.1 + SpinQuant INT4 PTE + iPhone 15 Pro | `not_supported` | Load fails with error 32 (NotFound); exact stage unverified; artifact documented as Android-targeted with no iOS claims |
| ExecuTorch 1.3.1 + SpinQuant INT4 PTE + Android (ARM CPU) | `not_tested` | Model card indicates this is the intended target; lab lacks Android device |
| ExecuTorch 1.3.1 + BF16 export + iOS | `not_tested` | README indicates BF16 works on iOS; larger artifact (2.4 GB) untested in this lab |

**Deployment recommendation:** If you need ExecuTorch on iOS today, don't use the pre-built SpinQuant INT4 PTE from HuggingFace. It fails to load on the iOS Swift LLM runner in this lab (error 32, exact stage unverified). Export a model specifically for iOS using `export_llama.py` with iOS backend targets, or use the BF16 baseline documented as iOS-compatible.

## What the Lab Proves

1. **Deterministic policy gates work, including when the model is compromised.** The restricted-case zero-cloud-call guarantee is mechanically enforced rather than model-dependent. Fifteen contract tests pass, and the guarantee held across all eighteen fixtures against real inference: through a successful prompt injection that made the model recommend cloud processing for restricted data, and through a degraded run where two thirds of model outputs were unparseable. Both fail closed to human review.

2. **A runtime's structured-output guarantee is conditional, not absolute.** The same QVAC `json_schema` path produced 18/18 valid output on schema 1.0 and 6/18 on schema 1.1, with only the field vocabulary changed. Any application relying on native structured output needs independent validation, because the guarantee weakens exactly where the schema gets demanding.

3. **Physical-device deployment is hard in specific ways.** The ExecuTorch failure was not "the phone is too slow" or "not enough RAM." The full app pipeline worked and the model file was delivered intact. The load still failed, on an artifact whose own model card documents Android/ARM CPU targeting and makes no iOS claims. The exact failing stage stays unverified in this lab. That's a model-supply problem, and it would affect any iOS deployment picking this artifact off HuggingFace.

4. **Honest failure documentation has value.** A hiring manager or deployment lead reading this lab learns more from the documented ExecuTorch boundary and the failed vocabulary experiment than from a forced success.

## What's Next

- Build the QVAC platform runner, then run the physical-device acceptance sequence on iPhone 15 Pro and compare against the desktop baseline recorded here
- Cross-device boundary classification (iPhone 15 Pro vs. iPhone 15 vs. unverified Android)
- Find where QVAC's structured-output reliability actually breaks, by varying schema complexity between the 1.0 and 1.1 endpoints
- Upstream contribution: document the iOS LLM runner's `"forward"` method expectation in ExecuTorch examples, or contribute a reproduction case

## Repository State

- Contracts and policy gate: `contracts/`, `runner/`, `test/`
- QVAC adapter: `adapters/qvac/`, desktop harness at `scripts/run-qvac-desktop.ts`
- ExecuTorch adapter: `adapters/executorch/`, `platforms/ios-executorch/`
- Evidence records: `outputs/`, desktop and device records labeled by `evidenceClass`
- Experimental contracts preserved under `contracts/experimental/`
- Plan and governance: `plans/local-ai-deployment-lab/`

All verification commands pass: `npm run test:contracts-and-policy`, `npm run typecheck`, `npm run validate:fixtures`, `npm run check:scrub`.
