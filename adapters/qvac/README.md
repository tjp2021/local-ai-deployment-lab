# QVAC Adapter

The adapter targets QVAC SDK 0.15.0 and the public Llama 3.2 1B Q4_0 descriptor. It uses QVAC's request-scoped `json_schema` response format, preserves the raw model output, validates it independently against the repository contract, and then passes only trusted application classification plus validated model output into the deterministic router.

QVAC 0.15.0 exports the selected model descriptor from the package root at runtime, and its own compiled examples import it there. The package's generated root declaration does not surface that export to TypeScript, and the dedicated models declaration uses an extensionless re-export that NodeNext does not resolve. The adapter therefore contains one narrow, runtime-guarded compatibility lookup for this descriptor. It does not patch vendor code or weaken the rest of the adapter's types.

The adapter does not treat QVAC's native structured-output constraint as proof that the application received valid data. Independent parsing and validation remain required because the lab is explicitly testing termination and schema reliability.

No physical-device claim is produced by the adapter alone. Device metadata must be captured by the platform runner and supplied through the run context.
