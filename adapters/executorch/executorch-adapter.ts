import modelOutputSchema from "../../contracts/model-output.schema.json" with { type: "json" };
import type { IncidentCase, ModelIncidentOutput } from "../../contracts/types.js";
import type {
  AdapterCapabilities,
  RunContext,
  RuntimeAdapter,
} from "../../runner/adapter.js";
import { evaluateModelOutput } from "../../runner/evaluation.js";
import { routeIncident, SpyCloudClient } from "../../runner/policy.js";
import { flattenIncidentPrompt, PROMPT_TEMPLATE } from "../../runner/prompt.js";
import { validateModelOutput, validateNativeGeneration } from "../../runner/validation.js";

const ADAPTER_VERSION = "0.1.0";
const RUNTIME_VERSION = "1.3.1";

export interface ExecuTorchArtifact {
  family: string;
  quantization: string | null;
  backend: string;
  artifactId: string;
  artifactSha256: string;
  tokenizerId: string;
}

export interface ExecuTorchGeneration {
  schemaVersion: "1.0";
  requestId: string;
  rawOutput: string;
  timeToFirstTokenMs: number | null;
  completionMs: number | null;
  promptTokens: number | null;
  generatedTokens: number | null;
  tokensPerSecond: number | null;
}

export interface ExecuTorchBridge {
  load(artifact: ExecuTorchArtifact): Promise<{ backend: string | null }>;
  generate(input: {
    prompt: string;
    outputSchema: object;
    temperature: number;
    maxNewTokens: number;
    sequenceLength: number;
  }): Promise<ExecuTorchGeneration>;
  cancel(requestId: string): Promise<void>;
  unload(): Promise<void>;
}

function parseOutput(rawOutput: string): {
  parsedOutput: ModelIncidentOutput | null;
  parseError: string | null;
  schemaValid: boolean;
  schemaErrors: string[];
} {
  try {
    const candidate = JSON.parse(rawOutput.trim()) as unknown;
    const validation = validateModelOutput(candidate);
    return {
      parsedOutput: validation.valid ? candidate as ModelIncidentOutput : null,
      parseError: validation.valid ? null : `Schema validation failed: ${validation.errors.join("; ")}`,
      schemaValid: validation.valid,
      schemaErrors: validation.errors,
    };
  } catch (error) {
    return {
      parsedOutput: null,
      parseError: error instanceof Error ? error.message : String(error),
      schemaValid: false,
      schemaErrors: [],
    };
  }
}

export class ExecuTorchAdapter implements RuntimeAdapter {
  private loaded = false;
  private loadMs: number | null = null;
  private observedBackend: string | null = null;
  private currentLoadClass: RunContext["loadClass"] = "unknown";

  constructor(
    private readonly bridge: ExecuTorchBridge,
    private readonly artifact: ExecuTorchArtifact,
  ) {}

  capabilities(): AdapterCapabilities {
    return {
      runtime: "executorch",
      runtimeVersion: RUNTIME_VERSION,
      structuredOutput: false,
      cancellation: true,
      nativeStats: [
        "timeToFirstToken",
        "completionTime",
        "promptTokens",
        "generatedTokens",
        "tokensPerSecond",
      ],
      knownLimitations: [
        "ExecuTorch TextLLMRunner generation is not a native JSON Schema constraint.",
        "Backend-specific PTE files are distinct deployable artifacts.",
        "The QVAC GGUF and ExecuTorch PTE artifacts are not byte-identical.",
      ],
    };
  }

  async load(loadClass: RunContext["loadClass"] = "unknown"): Promise<void> {
    if (this.loaded) return;
    this.currentLoadClass = loadClass;
    const started = performance.now();
    const metadata = await this.bridge.load(this.artifact);
    this.loadMs = Math.round(performance.now() - started);
    this.observedBackend = metadata.backend;
    this.loaded = true;
  }

  async generate(incidentCase: IncidentCase, context: RunContext): Promise<unknown> {
    if (!this.loaded) {
      throw new Error("ExecuTorch adapter must load a model before generation.");
    }

    let generation: ExecuTorchGeneration;
    try {
      generation = await this.bridge.generate({
        prompt: flattenIncidentPrompt(incidentCase),
        outputSchema: modelOutputSchema,
        temperature: 0,
        maxNewTokens: 256,
        sequenceLength: 2048,
      });
    } catch (error) {
      return this.errorResult(incidentCase, context, "generation", error);
    }

    const bridgeValidation = validateNativeGeneration(generation);
    if (!bridgeValidation.valid) {
      return this.errorResult(
        incidentCase,
        context,
        "validation",
        new Error(`Native bridge result failed validation: ${bridgeValidation.errors.join("; ")}`),
        typeof generation.rawOutput === "string" ? generation.rawOutput : "",
      );
    }

    const parsed = parseOutput(generation.rawOutput);
    const checks = parsed.parsedOutput
      ? evaluateModelOutput(incidentCase, parsed.parsedOutput)
      : [{
          name: "modelOutputSchema",
          passed: false,
          detail: parsed.parseError ?? "Model output could not be parsed.",
        }];
    const cloud = new SpyCloudClient();
    const policy = await routeIncident({
      classification: incidentCase.classification,
      modelOutput: parsed.parsedOutput,
      cloudClient: cloud,
    });

    return {
      schemaVersion: "1.0",
      runId: context.runId,
      caseId: incidentCase.id,
      testedAt: context.testedAt,
      runtime: {
        name: "executorch",
        version: RUNTIME_VERSION,
        adapterVersion: ADAPTER_VERSION,
        model: {
          family: this.artifact.family,
          artifactFormat: "PTE",
          quantization: this.artifact.quantization,
          promptTemplate: PROMPT_TEMPLATE,
          generationParameters: {
            temperature: 0,
            maxNewTokens: 256,
            sequenceLength: 2048,
            artifactId: this.artifact.artifactId,
            artifactSha256: this.artifact.artifactSha256,
            tokenizerId: this.artifact.tokenizerId,
          },
        },
      },
      device: { ...context.device, backend: this.observedBackend },
      network: context.network,
      lifecycle: {
        loadClass: context.loadClass ?? this.currentLoadClass,
        loadMs: this.loadMs,
        unloadSucceeded: null,
      },
      generation: {
        rawOutput: generation.rawOutput,
        parsedOutput: parsed.parsedOutput,
        parseError: parsed.parseError,
        timeToFirstTokenMs: generation.timeToFirstTokenMs,
        completionMs: generation.completionMs,
        promptTokens: generation.promptTokens,
        generatedTokens: generation.generatedTokens,
        tokensPerSecond: generation.tokensPerSecond,
      },
      evaluation: {
        schemaValid: parsed.schemaValid,
        passed: parsed.schemaValid && checks.every((check) => check.passed),
        checks,
      },
      policy,
      cancellation: null,
      error: null,
    };
  }

  async cancel(requestId: string): Promise<void> {
    await this.bridge.cancel(requestId);
  }

  async unload(): Promise<boolean> {
    if (!this.loaded) return true;
    this.loaded = false;
    try {
      await this.bridge.unload();
      return true;
    } catch {
      return false;
    }
  }

  private errorResult(
    incidentCase: IncidentCase,
    context: RunContext,
    category: "generation" | "validation" | "unknown",
    error: unknown,
    rawOutput = "",
  ): unknown {
    return {
      schemaVersion: "1.0",
      runId: context.runId,
      caseId: incidentCase.id,
      testedAt: context.testedAt,
      runtime: {
        name: "executorch",
        version: RUNTIME_VERSION,
        adapterVersion: ADAPTER_VERSION,
        model: {
          family: this.artifact.family,
          artifactFormat: "PTE",
          quantization: this.artifact.quantization,
          promptTemplate: PROMPT_TEMPLATE,
          generationParameters: {
            temperature: 0,
            maxNewTokens: 256,
            sequenceLength: 2048,
            artifactId: this.artifact.artifactId,
            artifactSha256: this.artifact.artifactSha256,
            tokenizerId: this.artifact.tokenizerId,
          },
        },
      },
      device: { ...context.device, backend: this.observedBackend },
      network: context.network,
      lifecycle: {
        loadClass: context.loadClass,
        loadMs: this.loadMs,
        unloadSucceeded: null,
      },
      generation: {
        rawOutput,
        parsedOutput: null,
        parseError: null,
        timeToFirstTokenMs: null,
        completionMs: null,
        promptTokens: null,
        generatedTokens: null,
        tokensPerSecond: null,
      },
      evaluation: { schemaValid: false, passed: false, checks: [] },
      policy: {
        classification: incidentCase.classification,
        allowedRoute: "human_review",
        cloudCallCount: 0,
        passed: true,
        reason: "Generation failed; no external route is attempted.",
      },
      cancellation: null,
      error: {
        category,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
