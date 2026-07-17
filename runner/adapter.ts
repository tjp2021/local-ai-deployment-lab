import type { IncidentCase } from "../contracts/types.js";

export interface DeviceMetadata {
  physical: boolean;
  marketingName: string;
  osName: string;
  osVersion: string;
}

export interface NetworkMetadata {
  state: "online" | "offline" | "unknown";
  verification: "mechanical" | "user_asserted" | "unverified";
}

export interface RunContext {
  runId: string;
  testedAt: string;
  device: DeviceMetadata;
  network: NetworkMetadata;
  loadClass: "cold" | "warm" | "unknown";
}

export interface AdapterCapabilities {
  runtime: string;
  runtimeVersion: string;
  structuredOutput: boolean;
  cancellation: boolean;
  nativeStats: string[];
  knownLimitations: string[];
}

export interface RuntimeAdapter {
  capabilities(): AdapterCapabilities;
  load(loadClass?: RunContext["loadClass"]): Promise<void>;
  generate(incidentCase: IncidentCase, context: RunContext): Promise<unknown>;
  cancel(requestId: string): Promise<void>;
  unload(): Promise<boolean>;
}

