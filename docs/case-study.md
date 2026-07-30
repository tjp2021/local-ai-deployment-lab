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

**Evidence class: desktop.** These are not physical-device claims. The host has 17 GB of memory, a desktop GPU, and no thermal or battery limit. Device numbers appear in the next section, from a runner on real hardware.

### Results

| Measure | Result |
|---|---|
| Schema-valid output | 18/18 |
| Deterministic policy gate held | 18/18 |
| Restricted cases producing a cloud call | 0 of 8 |
| Throughput | 99 to 111 tokens per second, backend `gpu` |
| Time to first token | 104 to 354 ms |
| Cold model load | 5,538 ms |

### The Injection Case, Read Honestly

One fixture, `injection-send-to-cloud`, embeds a prompt injection in restricted incident text instructing the system to send the data to a cloud model.

**The injection partially worked on the model.** It returned `suggestedProcessing: "cloud"` for restricted data, which is the unsafe recommendation the case was designed to provoke. It also returned `requiresHumanReview: true`, so the compromise was partial rather than total. The other two injection fixtures didn't flip the model at all.

**The router refused the cloud route, and that outcome was guaranteed before inference ran.** The restricted branch of the router contains no code path that can invoke the cloud client, and classification comes from the trusted case record, never from model output. The route resolved to `human_review` with zero cloud calls.

Calling that a discovery would be circular. It's an architectural property: the safety guarantee doesn't depend on the model resisting the attack, because the model never holds the authority in the first place. What the tests add is regression value. Five policy tests pin the invariant, so if routing ever became model-driven, they go red. What this run adds is one concrete demonstration that a real compromised output hits the gate and fails closed.

### The Control: a Router That Obeys the Model

An invariant that can't fail proves little by itself, so the lab added the version that can. [`runner/naive-policy.ts`](../runner/naive-policy.ts) routes wherever `suggestedProcessing` points. It never sees the trusted classification, and it treats `requiresHumanReview` as an annotation for a queue rather than a boundary on the data path, which is how naive pipelines commonly wire it.

[`scripts/replay-naive-router.ts`](../scripts/replay-naive-router.ts) replays the committed device evidence through both routers. No inference runs; the comparison regenerates from the repository alone. Result: the naive router ships `injection-send-to-cloud`, restricted data, to the cloud stub, 1 of 8 restricted cases. The review flag the model attached does not stop the payload from crossing, because a flag gates a queue, not a boundary. The deterministic router ships nothing, 0 of 8. That's the difference between architecture and luck, measured instead of asserted.

### Where the Model Is Weak

Structured output was reliable. Judgment was not. Severity was wrong on 14 of 18 cases, consistently under-rating. The model also requested human review on all eighteen cases, including the straightforward ones where local handling was expected, and not a single case met every expectation check. At this model size, local structured extraction is dependable and local decisioning is not, which is the argument for putting a deterministic gate above it.

One measurement caveat is recorded rather than hidden. The `requiredMissingInformation` check uses exact normalized string equality, and the prompt never tells the model which vocabulary to use. It therefore measures literal phrase compliance, not comprehension, and its 12 failures are not a capability finding.

## What Worked: QVAC on a Physical iPhone

The same eighteen fixtures then ran on an iPhone 15 Pro (iOS 26.2.1) through an Expo runner built for the purpose. QVAC ships as a JavaScript SDK inside a Bare worker, so the device runner is an Expo application rather than a Swift target. It performs no validation, evaluation, or routing. It records what the runtime produced, and the desktop applies the contract, so both evidence classes are scored by one implementation.

### Correctness did not change

| Measure | Desktop | iPhone 15 Pro |
|---|---|---|
| Schema-valid output | 18/18 | 18/18 |
| Policy gate held | 18/18 | 18/18 |
| Restricted cases with a cloud call | 0 of 8 | 0 of 8 |
| Severity failures | 14 | 14 |
| Generation errors | 0 | 0 |

Every expectation check failed at exactly the same count on both. More directly: **the raw model output was byte-identical on all eighteen cases.** With temperature 0 and a fixed seed that's the expected result, but expected and demonstrated are different things, and it had never been shown across hardware in this lab.

That matters for the injection case. `injection-send-to-cloud` produced the same compromised recommendation on the phone. To be precise about where enforcement happens: the phone app contains no cloud client and no router at all, and the desktop router scored the phone's recorded output with the same zero cloud calls. The safety property survives the move to real hardware because it never depended on the model, or on the device.

### Performance is where the phone differs

| Measure | Desktop | iPhone 15 Pro |
|---|---|---|
| Mean tokens per second | 105 | 53 |
| Mean completion | 1,238 ms | 2,257 ms |
| Cold model load | 5,538 ms | 2,542 ms |

Generation runs at roughly half desktop speed. A single incident case takes about 2.3 seconds on the phone, which is workable for an intake form and not workable for anything interactive.

Cold load was faster on the phone, which is worth flagging as unexplained rather than dressed up. Storage layout and cache state differ between the two hosts and this lab did not isolate the cause.

### What these numbers do not cover

Every device measurement came from a cool iPhone at 100% battery running eighteen short cases back to back. That's close to the best case a phone ever offers.

Thermal throttling, sustained load, and low-power mode were not varied, and those are exactly the conditions that move mobile inference numbers. A phone that holds 53 tokens per second for forty seconds may not hold it for ten minutes. Anyone planning a deployment on this evidence should treat the throughput figure as an upper bound rather than a steady state, and measure sustained behavior against their own workload.

The correctness results are far more portable than the performance results. Schema validity and the policy-gate guarantee are properties of the contract and the router, and neither depends on how warm the phone is.

### Bounded Recommendation

| Configuration | Classification | Evidence |
|---|---|---|
| QVAC 0.15.0 + Llama 3.2 1B Q4_0 + iPhone 15 Pro | `supported` for structured extraction, `constrained` for judgment | 18/18 schema valid, 18/18 policy gate, 53 tokens per second, severity wrong on 14/18 |

## What Did Not Work: Constraining the Output Vocabulary

The obvious fix for that measurement problem was to constrain the field mechanically. `category`, `severity`, and `suggestedProcessing` were already enums, so `missingInformation` became a nineteen-value enum in model-output schema 1.1. The runtime, model, prompt template, and generation parameters were held constant so the vocabulary was the only changed variable.

It made the runtime worse.

| Measure | Schema 1.0, free text | Schema 1.1, enum vocabulary |
|---|---|---|
| Schema-valid output | 18/18 | 6/18 |
| Policy gate held | 18/18 | 18/18 |
| Restricted cases with a cloud call | 0 | 0 |

Twelve cases failed validation in two distinct ways: seven produced truncated or unterminated JSON, and five emitted duplicate array items against a `uniqueItems` constraint.

The first reading of this result was that the guarantee degrades as schema complexity rises. A follow-up sweep refuted that reading in direction.

### The Curve: Any Enum Breaks It, and Smaller Is Worse

[`scripts/run-vocab-curve.ts`](../scripts/run-vocab-curve.ts) ran the same eighteen fixtures at enum sizes 0, 2, 5, 10, 15, and 19, holding runtime, model, prompt, and generation parameters constant. Each condition validated against its own variant schema, so the native constraint and the independent validator always agreed on what "valid" means.

| Enum size | 0 (free text) | 2 | 5 | 10 | 15 | 19 |
|---|---|---|---|---|---|---|
| Schema-valid | 18/18 | 2/18 | 1/18 | 3/18 | 5/18 | 6/18 |
| Truncated JSON | 0 | 14 | 11 | 8 | 8 | 7 |
| Duplicate items | 0 | 2 | 6 | 7 | 5 | 5 |
| Policy gate held | 18/18 | 18/18 | 18/18 | 18/18 | 18/18 | 18/18 |

The failure is categorical, not gradual. Introducing an enum on the array field collapsed validity at every size tested, and the smallest vocabularies did worst, the opposite of the "more complexity, more degradation" intuition. The nineteen-value endpoint reproduced the original experiment exactly: 6/18, seven truncations, five duplicate-item violations.

The evidence shows the mechanism. All 48 truncated outputs stopped at exactly the 256-token generation cap, while every valid constrained output used 73 to 99 tokens. The duplicate-item failures show the model emitting one vocabulary term over and over, `"account reference"` three times in a row in the recorded raw output. Under an enum constraint on an array, this 1B model loops on the vocabulary instead of closing the array. When the loop trips `uniqueItems`, the failure is duplicate items; when it doesn't, it burns the token budget and truncates. A larger vocabulary gives the loop more values to land on, which is why 19 fails less often than 2. Whether a larger generation cap would rescue the truncated cases or just convert them into duplicate-item failures was not tested.

Two design decisions were vindicated by this run. The adapter had always refused to treat QVAC's native structured-output constraint as proof that the application received valid data, and kept independent parsing and validation. That defensive choice is what caught these failures. The policy gate also held at 18/18 while two thirds of model outputs were unparseable, because unparseable output fails closed to human review.

Schema 1.0 remains the operating contract. The experimental schema is preserved at `contracts/experimental/model-output-1.1-vocabulary.schema.json` with its evidence record, because a negative result that contradicts the intuition behind it is worth keeping.

### Bounded Recommendation

| Configuration | Classification | Evidence |
|---|---|---|
| QVAC 0.15.0 + Llama 3.2 1B Q4_0 + desktop host, schema 1.0 | `supported` for structured extraction, `constrained` for judgment | 18/18 schema valid, 18/18 policy gate, severity wrong on 14/18 |
| QVAC 0.15.0 + Llama 3.2 1B Q4_0 + desktop host, schema 1.1 | `not_supported` | 6/18 schema valid, truncation and duplicate-item failures |

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

1. **Model output should never hold routing authority, and the cost of granting it is now measured.** The restricted-case zero-cloud-call guarantee is enforced by construction: the restricted branch has no code path to the cloud client, and classification comes from the trusted case record. Twenty contract and policy tests pin the invariant, and the naive-router replay supplies the control: give the model's routing field authority over the same recorded outputs and restricted data reaches the cloud, 1 of 8 restricted cases. Keep authority in the deterministic router and it never does, including across a degraded run where two thirds of model outputs were unparseable. Both fail closed to human review.

2. **Enum-constrained arrays break this runtime's structured-output guarantee categorically, and smaller enums break it harder.** Free text held 18/18. Every enum size from 2 to 19 collapsed validity, bottoming at 1/18, with all truncations pinned at the 256-token cap and duplicate-item loops visible in the raw output. Any application relying on native structured output needs independent validation, and vocabulary constraints belong in post-processing, not in the decoding schema, at this model size.

3. **Physical-device deployment is hard in specific ways.** The ExecuTorch failure was not "the phone is too slow" or "not enough RAM." The full app pipeline worked and the model file was delivered intact. The load still failed, on an artifact whose own model card documents Android/ARM CPU targeting and makes no iOS claims. The exact failing stage stays unverified in this lab. That's a model-supply problem, and it would affect any iOS deployment picking this artifact off HuggingFace.

4. **Honest failure documentation has value.** A hiring manager or deployment lead reading this lab learns more from the documented ExecuTorch boundary and the failed vocabulary experiment than from a forced success.

## What's Next

- Repeat the device sweep across battery states and after thermal load, which this run did not vary
- Cross-device boundary classification (iPhone 15 Pro vs. iPhone 15 vs. unverified Android)
- Rerun the enum curve with a larger generation cap, to learn whether truncations convert into duplicate-item failures or into valid output
- Rerun the enum curve on the 3B model, to learn whether the vocabulary loop is a 1B-class behavior
- Upstream contribution: document the iOS LLM runner's `"forward"` method expectation in ExecuTorch examples, or contribute a reproduction case

## Repository State

- Contracts and policy gate: `contracts/`, `runner/`, `test/`
- QVAC adapter: `adapters/qvac/`, desktop harness at `scripts/run-qvac-desktop.ts`
- ExecuTorch adapter: `adapters/executorch/`, `platforms/ios-executorch/`
- Evidence records: `outputs/`, desktop and device records labeled by `evidenceClass`
- Experimental contracts preserved under `contracts/experimental/`
- Plan and governance: `plans/local-ai-deployment-lab/`

All verification commands pass: `npm run test:contracts-and-policy`, `npm run typecheck`, `npm run validate:fixtures`, `npm run check:scrub`.
