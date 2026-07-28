import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Device from "expo-device";
import * as FileSystem from "expo-file-system";
import {
  completion,
  loadModel,
  unloadModel,
  LLAMA_3_2_1B_INST_Q4_0,
} from "@qvac/sdk";
import inputs from "./generated/inputs.json";

/**
 * Physical-device QVAC runner for the lab contract.
 *
 * This is not a chat application. It runs the lab's fixture cases through QVAC
 * on the device and writes native-generation records. It performs no schema
 * validation, no expectation evaluation, and no routing decision. Those belong
 * to the desktop side so that one implementation of the contract governs both
 * runtimes.
 */

const RESULTS_DIRECTORY = `${FileSystem.documentDirectory}Results/`;

function deviceMetadata() {
  return {
    physical: Device.isDevice,
    marketingName: Device.modelName ?? "unknown",
    osName: Device.osName ?? "unknown",
    osVersion: Device.osVersion ?? "unknown",
    totalMemoryGb: Device.totalMemory
      ? Math.round(Device.totalMemory / 1e9)
      : null,
  };
}

export default function App() {
  const [status, setStatus] = useState("idle");
  const [lines, setLines] = useState([]);
  const [running, setRunning] = useState(false);

  const log = useCallback((line) => {
    setLines((previous) => [...previous, line]);
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    setLines([]);
    const device = deviceMetadata();

    if (!device.physical) {
      log("REFUSING: not a physical device. Simulator runs are not lab evidence.");
      setStatus("refused");
      setRunning(false);
      return;
    }

    log(`device: ${device.marketingName} ${device.osName} ${device.osVersion}`);
    log(`memory: ${device.totalMemoryGb ?? "unknown"} GB`);

    let modelId = null;
    const records = [];

    try {
      setStatus("loading model");
      const loadStarted = Date.now();
      modelId = await loadModel({ modelSrc: LLAMA_3_2_1B_INST_Q4_0 });
      const loadMs = Date.now() - loadStarted;
      log(`model loaded in ${loadMs} ms`);

      for (const [index, testCase] of inputs.cases.entries()) {
        setStatus(`case ${index + 1}/${inputs.cases.length}`);
        const requestId = `qvac-ios-${testCase.id}`;
        const started = Date.now();

        let record;
        try {
          const run = completion({
            modelId,
            history: [
              { role: "system", content: testCase.system },
              { role: "user", content: testCase.user },
            ],
            stream: true,
            generationParams: inputs.generationParams,
            responseFormat: {
              type: "json_schema",
              json_schema: {
                name: "incident_output",
                strict: true,
                schema: inputs.modelOutputSchema,
              },
            },
          });

          const final = await run.final;
          const stats = final.stats ?? {};
          record = {
            schemaVersion: "1.0",
            requestId,
            rawOutput: final.contentText ?? "",
            timeToFirstTokenMs: stats.timeToFirstToken ?? null,
            completionMs: Date.now() - started,
            promptTokens: stats.promptTokens ?? null,
            generatedTokens: stats.generatedTokens ?? null,
            tokensPerSecond: stats.tokensPerSecond ?? null,
            caseId: testCase.id,
            classification: testCase.classification,
            backend: stats.backendDevice ?? null,
            loadMs,
            loadClass: index === 0 ? "cold" : "warm",
            error: null,
          };
          log(`${testCase.id}: ${record.generatedTokens ?? "?"} tokens, ${record.completionMs} ms`);
        } catch (error) {
          record = {
            schemaVersion: "1.0",
            requestId,
            rawOutput: "",
            timeToFirstTokenMs: null,
            completionMs: null,
            promptTokens: null,
            generatedTokens: null,
            tokensPerSecond: null,
            caseId: testCase.id,
            classification: testCase.classification,
            backend: null,
            loadMs,
            loadClass: index === 0 ? "cold" : "warm",
            error: { category: "generation", message: String(error?.message ?? error) },
          };
          log(`${testCase.id}: ERROR ${record.error.message}`);
        }

        records.push(record);
      }

      setStatus("writing results");
      const payload = {
        evidenceClass: "device",
        promptTemplate: inputs.promptTemplate,
        generationParams: inputs.generationParams,
        device,
        runtime: { name: "qvac", version: "0.15.0" },
        records,
      };

      await FileSystem.makeDirectoryAsync(RESULTS_DIRECTORY, { intermediates: true });
      const path = `${RESULTS_DIRECTORY}qvac-ios-${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(path, JSON.stringify(payload, null, 2));
      log(`wrote ${path}`);

      // Printed with a stable prefix so the record can be recovered from device
      // logs when file sharing is unavailable.
      console.log(`LAB_NATIVE_RESULT=${JSON.stringify(payload)}`);
      setStatus("done");
    } catch (error) {
      log(`RUN FAILED: ${String(error?.message ?? error)}`);
      setStatus("failed");
    } finally {
      if (modelId) {
        try {
          await unloadModel({ modelId });
          log("model unloaded");
        } catch (error) {
          log(`unload failed: ${String(error?.message ?? error)}`);
        }
      }
      setRunning(false);
    }
  }, [log]);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Text style={styles.title}>Local AI Lab: QVAC</Text>
      <Text style={styles.subtitle}>
        {inputs.cases.length} fixture cases, prompt {inputs.promptTemplate}
      </Text>
      <Pressable
        style={[styles.button, running && styles.buttonDisabled]}
        onPress={run}
        disabled={running}
      >
        <Text style={styles.buttonText}>{running ? "Running" : "Run acceptance sequence"}</Text>
      </Pressable>
      <Text style={styles.status}>status: {status}</Text>
      <ScrollView style={styles.log}>
        {lines.map((line, index) => (
          <Text key={index} style={styles.logLine}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingTop: 72, paddingHorizontal: 20 },
  title: { fontSize: 22, fontWeight: "700" },
  subtitle: { fontSize: 13, color: "#666", marginTop: 4, marginBottom: 20 },
  button: { backgroundColor: "#1f6feb", borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  buttonDisabled: { backgroundColor: "#9db8dd" },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  status: { marginTop: 14, fontSize: 13, color: "#333" },
  log: { flex: 1, marginTop: 12, marginBottom: 24 },
  logLine: { fontSize: 12, fontFamily: "Menlo", color: "#222", marginBottom: 3 },
});
