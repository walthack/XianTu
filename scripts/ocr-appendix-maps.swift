import AppKit
import Foundation
import Vision

struct Recognition: Codable {
    let text: String
    let confidence: Float
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

guard CommandLine.arguments.count == 3 else {
    fputs("usage: swift ocr-appendix-maps.swift input.jpg output.json\n", stderr)
    exit(2)
}

let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
guard let image = NSImage(contentsOf: input),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fputs("cannot load image\n", stderr)
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US"]
request.usesLanguageCorrection = true
request.minimumTextHeight = 0.006
try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])

let recognitions = (request.results ?? []).compactMap { observation -> Recognition? in
    guard let candidate = observation.topCandidates(1).first else { return nil }
    let box = observation.boundingBox
    return Recognition(
        text: candidate.string,
        confidence: candidate.confidence,
        x: box.midX,
        y: 1 - box.midY,
        width: box.width,
        height: box.height
    )
}.sorted { lhs, rhs in
    abs(lhs.y - rhs.y) > 0.015 ? lhs.y < rhs.y : lhs.x < rhs.x
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
try encoder.encode(recognitions).write(to: output)
