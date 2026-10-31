import CoreGraphics
import Foundation

/// The wordmark from `brand/logo/ff-dimmen-woordmerk.svg`. Paths stay as drawn;
/// the fill is the caller's colour (light ink, never the amber glow).
struct Wordmark {
    var viewBox: CGRect
    var paths: [CGPath]

    static func parse(svg: String) -> Wordmark? {
        guard let viewBox = parseViewBox(svg) else { return nil }
        let paths = pathData(in: svg).compactMap(parsePath)
        guard paths.count == 8 else { return nil }
        return Wordmark(viewBox: viewBox, paths: paths)
    }

    func path(in dest: CGRect) -> CGPath {
        let scale = dest.width / viewBox.width
        var transform = CGAffineTransform(translationX: dest.minX, y: dest.maxY)
        transform = transform.scaledBy(x: scale, y: -scale)
        transform = transform.translatedBy(x: -viewBox.minX, y: -viewBox.minY)
        let combined = CGMutablePath()
        for path in paths {
            combined.addPath(path, transform: transform)
        }
        return combined
    }
}

private func parseViewBox(_ svg: String) -> CGRect? {
    guard let start = svg.range(of: "viewBox=\""),
          let end = svg[start.upperBound...].range(of: "\"") else { return nil }
    let raw = svg[start.upperBound..<end.lowerBound]
    let parts = raw.split { $0 == " " || $0 == "," }.compactMap { Double($0) }
    guard parts.count == 4, parts[2] > 0, parts[3] > 0 else { return nil }
    return CGRect(x: parts[0], y: parts[1], width: parts[2], height: parts[3])
}

private func pathData(in svg: String) -> [String] {
    var data: [String] = []
    var rest = Substring(svg)
    while let start = rest.range(of: "d=\"") {
        rest = rest[start.upperBound...]
        guard let end = rest.range(of: "\"") else { break }
        data.append(String(rest[..<end.lowerBound]))
        rest = rest[end.upperBound...]
    }
    return data
}

/// The logo file only uses absolute M, L, C and Z.
private func parsePath(_ d: String) -> CGPath? {
    let chars = Array(d)
    var index = 0

    func skipSeparators() {
        while index < chars.count, " \n\r\t,".contains(chars[index]) {
            index += 1
        }
    }

    func readNumber() -> CGFloat? {
        skipSeparators()
        guard index < chars.count else { return nil }
        let first = chars[index]
        if first.isLetter { return nil }
        let start = index
        if first == "+" || first == "-" { index += 1 }
        var digits = false
        var dot = false
        while index < chars.count {
            let char = chars[index]
            if char.isNumber {
                digits = true
                index += 1
            } else if char == ".", !dot {
                dot = true
                index += 1
            } else {
                break
            }
        }
        guard digits, let value = Double(String(chars[start..<index])) else { return nil }
        return CGFloat(value)
    }

    func readPoint() -> CGPoint? {
        guard let x = readNumber(), let y = readNumber() else { return nil }
        return CGPoint(x: x, y: y)
    }

    let path = CGMutablePath()
    var command: Character?
    while index < chars.count {
        skipSeparators()
        if index >= chars.count { break }
        if chars[index].isLetter {
            command = chars[index]
            index += 1
            if command == "Z" || command == "z" {
                path.closeSubpath()
                continue
            }
        }
        guard let active = command else { break }
        switch active {
        case "M":
            guard let point = readPoint() else { return path.isEmpty ? nil : path }
            path.move(to: point)
            command = "L"
        case "L":
            guard let point = readPoint() else { return path.isEmpty ? nil : path }
            path.addLine(to: point)
        case "C":
            guard let c1 = readPoint(), let c2 = readPoint(), let point = readPoint() else {
                return path.isEmpty ? nil : path
            }
            path.addCurve(to: point, control1: c1, control2: c2)
        default:
            return nil
        }
    }
    return path.isEmpty ? nil : path
}
