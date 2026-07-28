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

## What Worked: QVAC Adapter

*[Pending: QVAC physical-device acceptance sequence on iPhone 15 Pro]*

The QVAC adapter was rebuilt from clean source against QVAC 0.15.0. The deterministic policy gate blocked all cloud-client calls for restricted cases in contract tests. Physical-device evidence is pending.

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

1. **Deterministic policy gates work.** The restricted-case zero-cloud-call guarantee is mechanically enforced, not model-dependent. Fifteen contract tests pass.

2. **Physical-device deployment is hard in specific ways.** The ExecuTorch failure was not "the phone is too slow" or "not enough RAM." The full app pipeline worked and the model file was delivered intact. The load still failed, on an artifact whose own model card documents Android/ARM CPU targeting and makes no iOS claims. The exact failing stage stays unverified in this lab. That's a model-supply problem, and it would affect any iOS deployment picking this artifact off HuggingFace.

3. **Honest failure documentation has value.** A hiring manager or deployment lead reading this lab learns more from the documented ExecuTorch boundary than from a forced success.

## What's Next

- QVAC physical-device acceptance sequence on iPhone 15 Pro
- Cross-device boundary classification (iPhone 15 Pro vs. iPhone 15 vs. unverified Android)
- Upstream contribution: document the iOS LLM runner's `"forward"` method expectation in ExecuTorch examples, or contribute a reproduction case

## Repository State

- 5 commits on `main`
- Contracts and policy gate: `contracts/`, `runner/`, `test/`
- QVAC adapter: `adapters/qvac/`
- ExecuTorch adapter: `adapters/executorch/`, `platforms/ios-executorch/`
- Evidence records: `outputs/`
- Plan and governance: `plans/local-ai-deployment-lab/`

All verification commands pass: `npm run test:contracts-and-policy`, `npm run typecheck`, `npm run validate:fixtures`, `npm run check:scrub`.
