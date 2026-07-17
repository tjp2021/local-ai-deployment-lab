# Repository Decision: Start Clean, Preserve QVAC Evidence

Decision: create `local-ai-deployment-lab` as a standalone repository. Preserve `qvac-implementation-lab` unchanged as a private historical evidence archive.

## Why the existing folder is not extended

- It is embedded in the Personal workspace rather than an independent repository.
- Its purpose, README, source packet, and experiment registry are tied to a closed Tether role.
- It pins QVAC SDK 0.14.1 while the ecosystem has moved.
- Its mobile tree includes generated worker bundles, absolute local paths, Expo build logs, private device state, and agent instruction files.
- Its application-level policy check detects words in model output but does not enforce a real cloud-call boundary.
- Its experimental prompts and Mac/iPhone comparisons contain confounds that should remain visible as historical evidence rather than silently rewritten.

## What may be migrated

- Synthetic fixtures after independent review.
- Raw public-safe result examples labeled as historical, not current baselines.
- Small pieces of adapter logic rewritten against the new contracts and current SDK.
- Lessons and negative findings with provenance links back to the archive.

## What will not be migrated

- Generated bundles.
- `.expo` state and logs.
- Signing configuration or device identifiers.
- Absolute paths.
- Tether application language.
- The regex-only policy gate.
- Claims that do not survive the new comparability controls.

## Consequence

The new repository has a clean public history and runtime-neutral architecture. The old lab remains available for audit and prevents provenance loss.

