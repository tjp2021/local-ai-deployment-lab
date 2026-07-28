# Outputs

Raw results are immutable evidence. Generated summaries must link to their source records. Public outputs must exclude device identifiers, signing information, absolute local paths, and private logs.

## Evidence records

- `xnnpack-spinquant-iphone15pro-20260728-001.json` — ExecuTorch 1.3.1 + SpinQuant INT4 + iPhone 15 Pro, XNNPACK-only backend. Result: `not_supported` (error 32 NotFound; exact load stage unverified).
- `mps-spinquant-iphone15pro-20260728-002.json` — ExecuTorch 1.3.1 + SpinQuant INT4 + iPhone 15 Pro, XNNPACK+MPS backend. Result: `not_supported` (error 32 NotFound; exact load stage unverified; artifact documented as Android-targeted with no iOS claims).

Both records preserve the same boundary: the pre-built SpinQuant INT4 PTE fails to load on the ExecuTorch 1.3.1 iOS Swift LLM runner. The precise mechanism (method lookup vs. backend init vs. memory planning) is not isolated — method-table inspection tooling is not available in this environment.

