# ExecuTorch Adapter

This directory defines the harness-side boundary for ExecuTorch 1.3.1. It is intentionally split from native platform code:

- the shared harness owns the case manifest, prompt instructions, JSON parsing, expectation checks, deterministic policy, and normalized result record;
- a platform bridge owns the ExecuTorch `TextLLMRunner`, `.pte` and tokenizer paths, token callback, stop/reset lifecycle, and measurements available on that platform.

The adapter does not claim native JSON-schema-constrained generation. It treats the generated text as untrusted, preserves it before parsing, and fails closed when parsing or validation fails.

The initial artifact target is Llama 3.2 1B Instruct in ExecuTorch `.pte` format with a documented 4-bit quantization path. The exact quantization method, backend lowering, tokenizer, and source checksum must be recorded by the native runner before any physical result is publishable. An XNNPACK-lowered iOS artifact and a Core ML-lowered artifact are different deployables; neither may be silently relabeled as the other.

Official references:

- https://docs.pytorch.org/executorch/stable/llm/run-on-ios.html
- https://docs.pytorch.org/executorch/stable/llm/export-llm.html
- https://docs.pytorch.org/executorch/stable/llm/export-custom-llm.html
- https://github.com/pytorch/executorch/releases/tag/v1.3.1

The TypeScript tests use an injected bridge only to prove the adapter contract and fail-closed policy. They are not device evidence.
