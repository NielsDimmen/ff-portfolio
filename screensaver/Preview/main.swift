import AppKit
import ScreenSaver

guard CommandLine.arguments.count >= 3 else {
    fputs("gebruik: preview FF\\ Dimmen.saver uit.png\n", stderr)
    exit(2)
}

let bundle = Bundle(path: CommandLine.arguments[1])!
do {
    try bundle.loadAndReturnError()
} catch {
    fputs("Bundle laden mislukt: \(error)\n", stderr)
    exit(1)
}

guard let principal = bundle.principalClass as? ScreenSaverView.Type else {
    let name = bundle.object(forInfoDictionaryKey: "NSPrincipalClass") as? String ?? "?"
    fputs("NSPrincipalClass \(name) is geen ScreenSaverView (\(String(describing: bundle.principalClass)))\n", stderr)
    exit(1)
}

let width = 1920
let height = 1080
guard let view = principal.init(frame: NSRect(x: 0, y: 0, width: width, height: height), isPreview: false) else {
    fputs("init mislukt\n", stderr)
    exit(1)
}

guard let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: width,
    pixelsHigh: height,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
) else {
    fputs("bitmap mislukt\n", stderr)
    exit(1)
}

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
view.draw(view.bounds)
NSGraphicsContext.restoreGraphicsState()

guard let png = rep.representation(using: .png, properties: [:]) else {
    fputs("png mislukt\n", stderr)
    exit(1)
}
try png.write(to: URL(fileURLWithPath: CommandLine.arguments[2]))
print(NSStringFromClass(principal))
