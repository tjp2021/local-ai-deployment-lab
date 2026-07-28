# QVAC iOS Runner

A narrow physical-device runner for the lab contract, not a chat application. It runs the lab's eighteen fixture cases through QVAC 0.15.0 on a paired iPhone and writes native-generation records.

QVAC ships as a JavaScript SDK that executes inside a Bare runtime worker, so the runner is an Expo application rather than a Swift target like the ExecuTorch path.

## What this runner does not do

It performs no schema validation, no expectation evaluation, and no routing decision. Those stay on the desktop side so a single implementation of the contract governs both runtimes and both evidence classes. The device produces raw generation records; the desktop turns them into results.

It also refuses to run on a simulator. Simulator output is not lab evidence.

## Inputs are generated, never hand-copied

The runner is a separate npm project and cannot import the lab's TypeScript. Copying fixtures in by hand would let the two drift, so `generated/inputs.json` is produced from the lab's own `sample-data/incidents.json`, `runner/prompt.ts`, and `contracts/model-output.schema.json`.

It carries the same prompt template and the same generation parameters as the desktop baseline, which is what makes device and desktop numbers comparable.

## Prepare and run

```bash
npm install
npm run prepare:run     # exports inputs, then bundles the QVAC worker
npm run ios             # builds to a connected physical device
```

`prepare:run` must be re-run whenever the fixtures, prompt, or output schema change.

## The worker bundle is a build output

`qvac.config.json` restricts the bundle to the `llamacpp-completion` plugin. Leaving the plugin list empty bundles all eleven built-ins, which is how the archived lab ended up with an 11 MB artifact.

The bundle, its generated entry file, and the prebuilt `ios/` directory are gitignored. The archived lab committed a bundle whose entry file had absolute local paths baked into every import, which the repository decision rules out.

## Signing

The committed configuration contains no team identifier or signing identity. Select a development team in Xcode after `expo prebuild`, or supply one locally the same way the ExecuTorch runner does through its gitignored config.

## Evidence boundary

Records carry `evidenceClass: "device"`. Timings are application wall-clock observations rather than native profiler statistics, matching the ExecuTorch runner's boundary. Token counts and backend come from QVAC's own completion statistics when it reports them.

Results are written to the app's `Results` directory and echoed to the device log with a `LAB_NATIVE_RESULT=` prefix so a run can be recovered when file sharing is unavailable.
