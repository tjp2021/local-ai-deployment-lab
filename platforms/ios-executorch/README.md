# ExecuTorch iOS Runner

This is a narrow physical-device runner for the lab contract, not a chat application. It pins the ExecuTorch `swiftpm-1.3.1` package to commit `a4c4949079cc4f3c98dbd770ddb84b204bb9d411`, loads a user-supplied Llama 3.2 1B SpinQuant PTE and tokenizer from the app's Documents directory, executes one bounded synthetic smoke case, and writes a native-generation JSON record before any desktop-side evaluation or policy decision.

The implementation is derived from the public ExecuTorch 1.3.1 Apple API and the maintained `meta-pytorch/executorch-examples` iOS app. No source from those projects is vendored.

## Generate the project

```bash
cd platforms/ios-executorch
xcodegen generate
```

Open the generated project, select a local development team, and use a physical iPhone. The committed project spec contains no team identifier or signing identity.

## Model files

Run `scripts/fetch-executorch-model.sh` from the repository root. Then copy the verified files into the app's Files container under:

```text
LocalAIModels/Llama-3.2-1B-Instruct-SpinQuant_INT4_EO8.pte
LocalAIModels/tokenizer.model
```

The app never bundles or commits model weights. Its UI shows the exact expected paths and refuses to run when either file is absent.

## Evidence boundary

The app records wall-clock load time, wall-clock time to first token, wall-clock completion time, and token-callback count. These are application observations, not native profiler statistics. Prompt-token count is explicitly `null`. The JSON is written to the app's `Results` directory and logged with the `LAB_NATIVE_RESULT=` prefix.

Official references:

- https://docs.pytorch.org/executorch/stable/llm/run-on-ios.html
- https://github.com/pytorch/executorch/tree/v1.3.1/extension/llm/apple
- https://github.com/meta-pytorch/executorch-examples/tree/main/llm/apple
