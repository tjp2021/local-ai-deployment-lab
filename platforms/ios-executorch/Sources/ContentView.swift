import SwiftUI

struct ContentView: View {
  @StateObject private var runner = ExecuTorchLabRunner()

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 18) {
          Text("ExecuTorch physical-device gate")
            .font(.title2.bold())

          Text(runner.status)
            .foregroundStyle(runner.filesAreReady ? .green : .secondary)

          GroupBox("Expected model path") {
            Text(runner.modelPath)
              .font(.caption.monospaced())
              .textSelection(.enabled)
          }

          GroupBox("Expected tokenizer path") {
            Text(runner.tokenizerPath)
              .font(.caption.monospaced())
              .textSelection(.enabled)
          }

          HStack {
            Button("Refresh") { runner.refreshStatus() }
              .buttonStyle(.bordered)

            Button(runner.isRunning ? "Running…" : "Run bounded smoke case") {
              runner.runSmokeCase()
            }
            .buttonStyle(.borderedProminent)
            .disabled(!runner.filesAreReady || runner.isRunning)

            if runner.isRunning {
              Button("Stop", role: .destructive) { runner.stop() }
            }
          }

          if !runner.output.isEmpty {
            GroupBox("Raw native-generation record") {
              Text(runner.output)
                .font(.caption.monospaced())
                .textSelection(.enabled)
            }
          }
        }
        .padding()
      }
      .navigationTitle("Local AI Lab")
    }
  }
}
