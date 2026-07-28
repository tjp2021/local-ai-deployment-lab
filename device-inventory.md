# Device Inventory

Verified by local Apple developer tooling on 2026-07-17, with the iPhone 15 Pro row updated on 2026-07-28. Public artifacts must not contain serial numbers, UDIDs, signing identities, or other device identifiers.

| Device | OS | Verified state | Intended role |
|---|---|---|---|
| iPhone 15 Pro | iOS 26.2.1 | Physical, paired, developer mode enabled, available. The 2026-07-28 ExecuTorch runs built, signed, installed, launched, and delivered model files on this device, so the full deployment pipeline is confirmed working | Higher-capability Apple baseline; potential Apple Foundation Models follow-up if eligible and enabled |
| iPhone 15 | iOS 26.5 | Physical, paired, developer mode enabled, visible over local network; developer disk image did not mount during sandboxed inspection | Normal consumer Apple baseline |
| Android device | Unknown | User reports possession; exact model, OS, RAM, architecture, chipset, and developer state are unverified; `adb` and Android Studio are not installed | Constrained-device boundary |

## Inventory discrepancy

Tim recalled an iPhone 14 Pro and iPhone 14. Xcode currently identifies the paired devices as iPhone 15 Pro and iPhone 15. No iPhone 14-class device appeared in the current inventory. The lab will use tooling-captured metadata in results and will not publish remembered device names as evidence.

## Required next checks

1. Rerun the inventory for the iPhone 15, which has not been re-checked since 2026-07-17. The iPhone 15 Pro no longer needs this check.
2. Identify whether any additional iPhone 14-class devices exist but have not been paired.
3. On Android, record the About Phone screen or install platform tools and capture `adb shell getprop` plus memory information.
4. Confirm available storage before model downloads.

