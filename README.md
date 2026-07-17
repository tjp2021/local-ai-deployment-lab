# Local AI Deployment Lab

Status: approved reference implementation; contract and adapter phase; private until publication review.

## Purpose

Determine what a local AI workflow can reliably do across real consumer devices, where it fails, and what deterministic application controls or fallback behavior are required.

QVAC is the first runtime adapter because working physical-device evidence already exists. It is not the product or audience. ExecuTorch is the planned cross-platform comparison. MLX Swift remains gated until the first two adapters produce distinct, reproducible evidence.

## Public-facing question

Can a privacy-sensitive incident-intake workflow produce valid structured results on consumer phones without cloud inference, and how should an application behave when the local model or device cannot meet the requirement?

## Current boundaries

- One workflow: synthetic privacy-sensitive incident extraction and routing.
- Two required runtime adapters: QVAC and ExecuTorch.
- Physical devices only for published device claims.
- Synthetic data only.
- Component-level findings, not a universal runtime ranking.
- No claim of enterprise readiness, security certification, or scientific generality.

## Documents

- [Source packet](source-packet.md)
- [Artifact specification](artifact-spec.md)
- [Experiment plan](experiment-plan.md)
- [Device inventory](device-inventory.md)
- [Demo plan](demo-plan.md)
- [Repository decision](docs/repository-decision.md)
- [Tier 2 system design](plans/local-ai-deployment-lab/design.md)

## Current next action

Build the versioned native ExecuTorch bridge against the documented 1.3.1 package path, then run one bounded physical-device acceptance sequence per adapter. The Mac must first regain enough free space for native dependencies and model artifacts. Android inventory remains unverified until platform tools and the physical device are available.
