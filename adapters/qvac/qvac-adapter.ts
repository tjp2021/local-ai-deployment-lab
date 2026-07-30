import {
  cancel as qvacCancel,
  completion as qvacCompletion,
  loadModel as qvacLoadModel,
  unloadModel as qvacUnloadModel,
  type CompletionFinal,
  type CompletionRun,
} from "@qvac/sdk";
import * as qvacSdk from "@qvac/sdk";
import modelOutputSchema from "../../contracts/model-output.schema.json" with { type: "json" };
import type { IncidentCase, ModelIncidentOutput } from "../../contracts/types.js";
import type {
  AdapterCapabilities,
  RunContext,
  RuntimeAdapter,
} from "../../runner/adapter.js";
import { evaluateModelOutput } from "../../runner/evaluation.js";
import { routeIncident, SpyCloudClient } from "../../runner/policy.js";
import { buildIncidentPrompt, PROMPT_TEMPLATE } from "../../runner/prompt.js";
import { validateModelOutput } from "../../runner/validation.js";

const ADAPTER_VERSION = "0.1.0";
const RUNTIME_VERSION = "0.15.0";
const LLAMA_3_2_1B_INST_Q4_0 = (
  qvacSdk as unknown as Record<string, unknown>
).LLAMA_3_2_1B_INST_Q4_0;

if (typeof LLAMA_3_2_1B_INST_Q4_0 !== "object" || LLAMA_3_2_1B_INST_Q4_0 === null) {
  throw new Error("QVAC SDK 0.15.0 did not expose the expected Llama 3.2 1B model descriptor.");
}

interface QvacClient {
  loadModel(options: { modelSrc: unknown }): Promise<string>;
  completion(params: {
    modelId: string;
    history: Array<{ role: "system" | "user"; content: string }>;
    stream: true;
    generationParams: Record<string, string | number | boolean>;
    responseFormat: {
      type: "json_schema";
      json_schema: {
        name: string;
        strict: true;
        schema: object;
      };
    };
  }): CompletionRun;
  cancel(params: { requestId: string }): Promise<void>;
  unloadModel(params: { modelId: string }): Promise<void>;
}

const realClient: QvacClient = {
  loadModel: (options) => qvacLoadModel(options as never),
  completion: (params) => qvacCompletion(params as never),
  cancel: qvacCancel,
  unloadModel: qvacUnloadModel,
};

function buildPrompt(incidentCase: IncidentCase): Array<{ role: "system" | "user"; content: string }> {
  const prompt = buildIncidentPrompt(incidentCase);
  return [
    {
      role: "system",
      content: prompt.system,
    },
    {
      role: "user",
      content: prompt.user,
    },
  ];
}

function parseOutput(
  final: CompletionFinal,
  validate: (value: unknown) => { valid: boolean; errors: string[] } = validateModelOutput,
): {
  rawOutput: string;
  parsedOutput: ModelIncidentOutput | null;
  parseError: string | null;
  schemaValid: boolean;
  schemaErrors: string[];
} {
  const rawOutput = final.contentText.trim();
  try {
    const candidate = JSON.parse(rawOutput) as unknown;
    const validation = validate(candidate);
    return {
      rawOutput,
      parsedOutput: validation.valid ? candidate as ModelIncidentOutput : null,
      parseError: validation.valid ? null : `Schema validation failed: ${validation.errors.join("; ")}`,
      schemaValid: validation.valid,
      schemaErrors: validation.errors,
    };
  } catch (error) {
    return {
      rawOutput,
      parsedOutput: null,
      parseError: error instanceof Error ? error.message : String(error),
      schemaValid: false,
      schemaErrors: [],
    };
  }
}

export interface QvacAdapterOptions {
  // Experimental schema variants (see scripts/run-vocab-curve.ts) swap both
  // the native constraint and the independent validator together, so the two
  // always agree on what "valid" means for a run.
  outputSchema?: object;
  validateOutput?: (value: unknown) => { valid: boolean; errors: string[] };
}

export class QvacAdapter implements RuntimeAdapter {
  private modelId: string | null = null;
  private loadMs: number | null = null;
  private currentLoadClass: RunContext["loadClass"] = "unknown";
  private readonly outputSchema: object;
  private readonly validateOutput: (value: unknown) => { valid: boolean; errors: string[] };

  constructor(
    private readonly client: QvacClient = realClient,
    options: QvacAdapterOptions = {},
  ) {
    this.outputSchema = options.outputSchema ?? modelOutputSchema;
    this.validateOutput = options.validateOutput ?? validateModelOutput;
  }

  capabilities(): AdapterCapabilities {
    return {
      runtime: "qvac",
      runtimeVersion: RUNTIME_VERSION,
      structuredOutput: true,
      cancellation: true,
      nativeStats: [
        "timeToFirstToken",
        "tokensPerSecond",
        "promptTokens",
        "generatedTokens",
        "backendDevice",
      ],
      knownLimitations: [
        "The QVAC GGUF artifact is not byte-identical to an ExecuTorch PTE artifact.",
        "Independent schema validation remains required after native json_schema generation.",
      ],
    };
  }

  async load(loadClass: RunContext["loadClass"] = "unknown"): Promise<void> {
    if (this.modelId !== null) return;
    this.currentLoadClass = loadClass;
    const started = performance.now();
    this.modelId = await this.client.loadModel({ modelSrc: LLAMA_3_2_1B_INST_Q4_0 });
    this.loadMs = Math.round(performance.now() - started);
  }

  async generate(incidentCase: IncidentCase, context: RunContext): Promise<unknown> {
    if (this.modelId === null) {
      throw new Error("QVAC adapter must load a model before generation.");
    }

    const started = performance.now();
    const run = this.client.completion({
      modelId: this.modelId,
      history: buildPrompt(incidentCase),
      stream: true,
      generationParams: {
        temp: 0,
        seed: 42,
        predict: 256,
      },
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "incident_output",
          strict: true,
          schema: this.outputSchema,
        },
      },
    });

    let final: CompletionFinal;
    try {
      final = await run.final;
    } catch (error) {
      return this.errorResult(incidentCase, context, "generation", error);
    }

    const completionMs = Math.round(performance.now() - started);
    const parsed = parseOutput(final, this.validateOutput);
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
    const stats = final.stats;

    return {
      schemaVersion: "1.0",
      runId: context.runId,
      caseId: incidentCase.id,
      testedAt: context.testedAt,
      runtime: {
        name: "qvac",
        version: RUNTIME_VERSION,
        adapterVersion: ADAPTER_VERSION,
        model: {
          family: "Llama 3.2 1B Instruct",
          artifactFormat: "GGUF",
          quantization: "Q4_0",
          promptTemplate: PROMPT_TEMPLATE,
          generationParameters: {
            temperature: 0,
            seed: 42,
            predict: 256,
            responseFormat: "json_schema",
          },
        },
      },
      device: {
        ...context.device,
        backend: stats?.backendDevice ?? null,
      },
      network: context.network,
      lifecycle: {
        loadClass: context.loadClass ?? this.currentLoadClass,
        loadMs: this.loadMs,
        unloadSucceeded: null,
      },
      generation: {
        rawOutput: parsed.rawOutput,
        parsedOutput: parsed.parsedOutput,
        parseError: parsed.parseError,
        timeToFirstTokenMs: stats?.timeToFirstToken ?? null,
        completionMs,
        promptTokens: stats?.promptTokens ?? null,
        generatedTokens: stats?.generatedTokens ?? null,
        tokensPerSecond: stats?.tokensPerSecond ?? null,
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
    await this.client.cancel({ requestId });
  }

  async unload(): Promise<boolean> {
    if (this.modelId === null) return true;
    const modelId = this.modelId;
    this.modelId = null;
    try {
      await this.client.unloadModel({ modelId });
      return true;
    } catch {
      return false;
    }
  }

  private errorResult(
    incidentCase: IncidentCase,
    context: RunContext,
    category: "generation" | "unknown",
    error: unknown,
  ): unknown {
    return {
      schemaVersion: "1.0",
      runId: context.runId,
      caseId: incidentCase.id,
      testedAt: context.testedAt,
      runtime: {
        name: "qvac",
        version: RUNTIME_VERSION,
        adapterVersion: ADAPTER_VERSION,
        model: {
          family: "Llama 3.2 1B Instruct",
          artifactFormat: "GGUF",
          quantization: "Q4_0",
          promptTemplate: PROMPT_TEMPLATE,
          generationParameters: { temperature: 0, seed: 42, predict: 256 },
        },
      },
      device: { ...context.device, backend: null },
      network: context.network,
      lifecycle: {
        loadClass: context.loadClass,
        loadMs: this.loadMs,
        unloadSucceeded: null,
      },
      generation: {
        rawOutput: "",
        parsedOutput: null,
        parseError: null,
        timeToFirstTokenMs: null,
        completionMs: null,
        promptTokens: null,
        generatedTokens: null,
        tokensPerSecond: null,
      },
      evaluation: {
        schemaValid: false,
        passed: false,
        checks: [],
      },
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
