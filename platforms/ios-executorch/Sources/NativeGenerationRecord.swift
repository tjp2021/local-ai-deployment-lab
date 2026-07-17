import Foundation

struct NativeGenerationRecord: Codable {
  let schemaVersion = "1.0"
  let requestId: String
  let rawOutput: String
  let timeToFirstTokenMs: Double?
  let completionMs: Double?
  let promptTokens: Int?
  let generatedTokens: Int?
  let tokensPerSecond: Double?

  enum CodingKeys: String, CodingKey {
    case schemaVersion
    case requestId
    case rawOutput
    case timeToFirstTokenMs
    case completionMs
    case promptTokens
    case generatedTokens
    case tokensPerSecond
  }
}
