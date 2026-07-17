# Local AI Deployment Lab

Status: approved reference implementation; design phase; private until publication review.

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

Resolve the physical-device inventory, validate and seal the Tier 2 design, then implement the runtime-neutral case and result contracts. No runtime integration begins before the design passes the workspace planning guardrail.

