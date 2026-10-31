import AppKit
import CoreText
import ImageIO
import QuartzCore
import ScreenSaver

private let tagline = "Your partner in performer tracking."
private let fadeDuration: CFTimeInterval = 4
/// Full cycle: the crossfade, then 12 seconds fully visible.
private let switchInterval: CFTimeInterval = 16

private enum Ink {
    static let space = CGColorSpace(name: CGColorSpace.sRGB)!
    static let ground = cg(0x0b, 0x0b, 0x0a, 1)
    static let veil = cg(0x0b, 0x0b, 0x0a, 0.42)
    static let ink = ns(0xf4, 0xf4, 0xf1)
    static let quiet = ns(0xa6, 0xa6, 0x9f)

    static func cg(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat) -> CGColor {
        CGColor(colorSpace: space, components: [r / 255, g / 255, b / 255, a])!
    }

    static func ns(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat) -> NSColor {
        NSColor(srgbRed: r / 255, green: g / 255, blue: b / 255, alpha: 1)
    }
}

/// One show clock for every screensaver process. Both displays read it, so they
/// change project together. Each display then takes its own photo from that project.
private enum ShowFile {
    struct Mark {
        var seed: UInt32
        var anchor: TimeInterval
    }

    private static let path = "/tmp/ffdimmen-show.txt"

    static func mark(for pool: [Photo]) -> Mark {
        let print = fingerprint(pool)
        if let existing = read(), existing.fingerprint == print {
            return existing.mark
        }
        var seed = UInt32(truncatingIfNeeded: UInt(Date().timeIntervalSince1970))
        if seed == 0 { seed = 1 }
        let created = Mark(seed: seed, anchor: Date().timeIntervalSince1970)
        let line = "\(created.seed) \(created.anchor) \(print)\n"
        if read() == nil, writeExclusive(line) {
            return created
        }
        if let existing = read(), existing.fingerprint == print {
            return existing.mark
        }
        try? line.write(toFile: path, atomically: true, encoding: .utf8)
        return read()?.mark ?? created
    }

    static func currentAnchor() -> TimeInterval? {
        read()?.mark.anchor
    }

    private static func fingerprint(_ pool: [Photo]) -> Int {
        var hash = pool.count
        for id in pool.map(\.id).sorted() {
            hash = hash &* 16777619 &+ id
        }
        return hash
    }

    private static func read() -> (mark: Mark, fingerprint: Int)? {
        guard let text = try? String(contentsOfFile: path, encoding: .utf8) else { return nil }
        let parts = text.split(whereSeparator: { $0 == " " || $0 == "\n" })
        guard parts.count >= 3,
              let seed = UInt32(parts[0]),
              let anchor = TimeInterval(parts[1]),
              let print = Int(parts[2]),
              seed != 0 else { return nil }
        return (Mark(seed: seed, anchor: anchor), print)
    }

    private static func writeExclusive(_ line: String) -> Bool {
        let fd = open(path, O_CREAT | O_EXCL | O_WRONLY, 0o644)
        if fd < 0 { return false }
        defer { close(fd) }
        let data = Array(line.utf8)
        let wrote = data.withUnsafeBytes { buffer in
            write(fd, buffer.baseAddress, buffer.count)
        }
        return wrote == data.count
    }
}

/// Shared project timeline for every display. One screen keeps its own photo mix and does not join.
/// Two displays stay on the same project and each take a different photo from that project.
private final class Ensemble {
    static let shared = Ensemble()
    private let lock = NSLock()
    private var members = 0
    private var anchor = Date().timeIntervalSince1970
    private var decks: [[Photo]] = []
    private var taken = Set<Int>()

    func join(_ pool: [Photo]) {
        lock.lock()
        defer { lock.unlock() }
        let mark = ShowFile.mark(for: pool)
        anchor = mark.anchor
        let fill = (members == 0 || decks.isEmpty) && !pool.isEmpty
        if fill {
            let lcg = LCG(seed: mark.seed)
            decks = projectDecks(pool) { lcg.next() }
        }
        members += 1
    }

    /// Left screen keeps slot 0. If a second view would land on the same slot, it takes the next free one.
    func claim(preferred: Int, count: Int) -> Int {
        lock.lock()
        defer { lock.unlock() }
        let limit = max(count, 1)
        var slot = min(max(0, preferred), limit - 1)
        if taken.contains(slot) {
            if let free = (0..<limit).first(where: { !taken.contains($0) }) {
                slot = free
            }
        }
        taken.insert(slot)
        return slot
    }

    func release(_ slot: Int) {
        lock.lock()
        taken.remove(slot)
        lock.unlock()
    }

    func leave() {
        lock.lock()
        defer { lock.unlock() }
        members = max(0, members - 1)
    }

    func playback(now: CFTimeInterval = Date().timeIntervalSince1970) -> (index: Int, since: CFTimeInterval, switches: Int) {
        lock.lock()
        if let shared = ShowFile.currentAnchor() {
            anchor = shared
        }
        let origin = anchor
        let count = decks.count
        lock.unlock()
        let elapsed = max(0, now - origin)
        let switches = Int(elapsed / switchInterval)
        let since = elapsed - CFTimeInterval(switches) * switchInterval
        let index = count == 0 ? 0 : switches % count
        return (index, since, switches)
    }

    func photo(switches: Int, slot: Int, screens: Int) -> Photo? {
        lock.lock()
        let decks = self.decks
        lock.unlock()
        guard !decks.isEmpty else { return nil }
        let count = decks.count
        let wrapped = ((switches % count) + count) % count
        let visit = max(0, switches) / count
        return screenPhoto(deck: decks[wrapped], slot: slot, screenCount: screens, visit: visit)
    }

    /// True when this screen will actually change picture. A lone photo stays put.
    func changes(slot: Int, screens: Int) -> Bool {
        guard let first = photo(switches: 0, slot: slot, screens: screens) else { return false }
        let steps = max(2, lockedCount() * 8)
        for step in 1..<steps {
            if photo(switches: step, slot: slot, screens: screens)?.id != first.id { return true }
        }
        return false
    }

    private func lockedCount() -> Int {
        lock.lock()
        defer { lock.unlock() }
        return decks.count
    }
}

/// One full-screen view. Several displays share a project and each keep their own photo.
/// The clock is drawn only on the display that holds the menu bar.
@objc(FFDimmenView)
public final class FFDimmenView: ScreenSaverView {
    private var pool: [Photo] = []
    private var photos: [Photo] = []
    private var images: [Int: CGImage] = [:]
    private var wordmark: Wordmark?
    private var lightFontName: String?
    private var cycleStart = CACurrentMediaTime()
    private var denseFrames = false
    private var reduceMotion = false
    /// Time and date last painted, so a still photo only redraws when the minute changes.
    private var drawnClockStamp = ""
    private var joinedEnsemble = false
    private var assignedSlot: Int?
    private var lastScreen: NSScreen?
    /// Screen frames when this wallpaper started. A later change means a display
    /// was plugged in or unplugged and the desktop window is the wrong size.
    private var screenBaseline: [CGRect]?
    private var screenObserver: NSObjectProtocol?
    private var screenChangeGeneration = 0
    private var wallpaperReadyAt: Date?
    private var lastReconcile = Date.distantPast
    private let dutchDate: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "nl_NL")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = "EEEE d MMMM"
        return formatter
    }()

    public override init?(frame: NSRect, isPreview: Bool) {
        super.init(frame: frame, isPreview: isPreview)
        animationTimeInterval = switchInterval
        prepare()
    }

    public required init?(coder: NSCoder) {
        super.init(coder: coder)
        animationTimeInterval = switchInterval
        prepare()
    }

    public override var hasConfigureSheet: Bool { false }

    public override func startAnimation() {
        pool = loadPhotoPool()
        photos = []
        images.removeAll()
        cycleStart = CACurrentMediaTime()
        denseFrames = false
        reduceMotion = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        drawnClockStamp = ""
        let mode = prepareSurface()
        if pool.isEmpty {
            NSLog("FF Dimmen: geen foto's gevonden in \(portfolioDataDirectory)")
        }
        switch mode {
        case .solo:
            NSLog("FF Dimmen: één vlak, klok aan")
        case .ensemble(let slot, let count, let clock):
            NSLog("FF Dimmen: scherm \(slot + 1) van \(count), klok \(clock ? "aan" : "uit")")
        }
        for layer in layers(for: mode) {
            warm(layer.photo)
        }
        if let next = upcoming(for: mode) {
            warm(next)
        }
        if holdsStill(mode) {
            animationTimeInterval = delayUntilNextMinute()
        } else {
            animationTimeInterval = min(switchInterval, delayUntilNextMinute())
        }
        coverScreen()
        screenBaseline = activeScreens().map(\.frame)
        wallpaperReadyAt = Date()
        setNeedsDisplay(bounds)
        super.startAnimation()
    }

    public override func stopAnimation() {
        leaveEnsemble()
        super.stopAnimation()
    }

    deinit {
        if let screenObserver {
            NotificationCenter.default.removeObserver(screenObserver)
        }
        leaveEnsemble()
    }

    /// Tahoe often creates the view at 0×0 and resizes it later. A paint at the
    /// old size must not count, or the clock stays missing after the real frame arrives.
    public override func setFrameSize(_ newSize: NSSize) {
        let changed = newSize != bounds.size
        super.setFrameSize(newSize)
        coverScreen()
        if changed {
            drawnClockStamp = ""
            needsDisplay = true
        }
    }

    public override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        autoresizingMask = [.width, .height]
        coverScreen()
        drawnClockStamp = ""
        needsDisplay = true
    }

    /// The wallpaper window keeps its old size when the built-in resolution
    /// changes, which happens when a display is plugged in or unplugged.
    /// Snap it to the screen it already belongs to, including a new size.
    /// Belonging is the left edge: never slide a window onto the other display.
    private var coveringScreen = false

    private func coverScreen() {
        guard !isPreview, !coveringScreen, let window else { return }
        let screens = activeScreens()
        let frame = window.frame
        guard let screen = screenOwning(frame, screens: screens) else { return }
        coveringScreen = true
        defer { coveringScreen = false }
        if !nearlyEqual(frame, screen.frame) {
            window.setFrame(screen.frame, display: true)
        }
        guard let host = superview else { return }
        let target = host.bounds
        if target.width > 1, target.height > 1, !self.frame.equalTo(target) {
            self.frame = target
        }
    }

    /// The display whose left edge matches this window. Width may be stale.
    /// If the left edges differ, use the screen that contains the window center.
    private func screenOwning(_ frame: CGRect, screens: [NSScreen]) -> NSScreen? {
        let aligned = screens.filter { abs($0.frame.minX - frame.minX) < 2 }
        if let match = aligned.min(by: { abs($0.frame.minY - frame.minY) < abs($1.frame.minY - frame.minY) }) {
            return match
        }
        let center = CGPoint(x: frame.midX, y: frame.midY)
        return screens.first { $0.frame.contains(center) }
    }

    private func nearlyEqual(_ a: CGRect, _ b: CGRect) -> Bool {
        abs(a.minX - b.minX) < 1 && abs(a.minY - b.minY) < 1 && abs(a.width - b.width) < 1 && abs(a.height - b.height) < 1
    }

    /// The desktop wallpaper can look right while the screensaver window is still
    /// the previous size. macOS ignores a resize of that window. Quit once so it
    /// opens a new one for the screens that are attached now.
    private func reconcileWindow() {
        guard !isPreview, let window, window.frame.width > 400, let wallpaperReadyAt else { return }
        let now = Date()
        guard now.timeIntervalSince(wallpaperReadyAt) > 2, now.timeIntervalSince(lastReconcile) > 1 else { return }
        lastReconcile = now
        let screens = activeScreens()
        guard let screen = screenOwning(window.frame, screens: screens) else { return }
        let expected = expectedCGFrame(screen, screens: screens)
        guard let actual = windowCGBounds(window) else { return }
        let frameMatches = nearlyEqual(actual, expected)
        let viewMatches = abs(bounds.width - screen.frame.width) < 2 && abs(bounds.height - screen.frame.height) < 2
        if frameMatches, viewMatches { return }
        let signature = screens.map { "\(Int($0.frame.width))x\(Int($0.frame.height))@\(Int($0.frame.minX)),\(Int($0.frame.minY))" }.joined(separator: "|")
        let path = "/tmp/ffdimmen-relaunch.txt"
        if (try? String(contentsOfFile: path, encoding: .utf8)) == signature { return }
        try? signature.write(toFile: path, atomically: true, encoding: .utf8)
        exit(0)
    }

    private func expectedCGFrame(_ screen: NSScreen, screens: [NSScreen]) -> CGRect {
        let primary = screens.first { abs($0.frame.minX) < 1 && abs($0.frame.minY) < 1 }
        let primaryHeight = primary?.frame.height ?? screen.frame.maxY
        return CGRect(
            x: screen.frame.minX,
            y: primaryHeight - screen.frame.maxY,
            width: screen.frame.width,
            height: screen.frame.height
        )
    }

    private func windowCGBounds(_ window: NSWindow) -> CGRect? {
        guard let list = CGWindowListCopyWindowInfo([.optionIncludingWindow], CGWindowID(window.windowNumber)) as? [[String: Any]],
              let raw = list.first?[kCGWindowBounds as String] else { return nil }
        var rect = CGRect.zero
        guard CFGetTypeID(raw as CFTypeRef) == CFDictionaryGetTypeID(),
              CGRectMakeWithDictionaryRepresentation(raw as! CFDictionary, &rect) else { return nil }
        return rect
    }

    public override func animateOneFrame() {
        let mode = prepareSurface()
        let minuteChanged = shouldDrawClock(mode) && clockStamp() != drawnClockStamp
        if holdsStill(mode) {
            if minuteChanged {
                setNeedsDisplay(bounds)
            }
            noteInterval(delayUntilNextMinute())
            return
        }

        let play = playback(for: mode)
        let fading = play.switches > 0 && play.since < fadeDuration
        if fading {
            if !denseFrames {
                denseFrames = true
                animationTimeInterval = 1.0 / 30.0
            }
            for layer in layers(for: mode) {
                warm(layer.photo)
            }
            setNeedsDisplay(bounds)
            return
        }
        if denseFrames || minuteChanged {
            denseFrames = false
            setNeedsDisplay(bounds)
        }
        if let next = upcoming(for: mode) {
            warm(next)
        }
        let untilPhoto = max(0.02, switchInterval - play.since)
        let untilWake = shouldDrawClock(mode) ? min(untilPhoto, delayUntilNextMinute()) : untilPhoto
        noteInterval(untilWake)
    }

    public override func draw(_ rect: NSRect) {
        coverScreen()
        reconcileWindow()
        let mode = prepareSurface()
        guard let context = NSGraphicsContext.current?.cgContext else { return }
        context.setFillColor(Ink.ground)
        context.fill(bounds)

        let layers = layers(for: mode)
        context.saveGState()
        context.clip(to: bounds)
        context.interpolationQuality = .high
        for layer in layers where layer.opacity > 0.004 {
            draw(layer.photo, opacity: layer.opacity, in: context)
        }
        context.restoreGState()

        context.setFillColor(Ink.veil)
        context.fill(bounds)

        drawMark(in: context)
        for layer in layers where layer.opacity > 0.004 {
            drawCaption(layer.photo, opacity: layer.opacity, in: context)
        }
        if shouldDrawClock(mode) {
            drawClock(in: context)
        }
    }

    private func prepare() {
        reduceMotion = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        registerFonts()
        if let url = Bundle(for: FFDimmenView.self).url(forResource: "ff-dimmen-woordmerk", withExtension: "svg"),
           let svg = try? String(contentsOf: url, encoding: .utf8) {
            wordmark = Wordmark.parse(svg: svg)
        }
        if wordmark == nil {
            NSLog("FF Dimmen: woordmerk ontbreekt in de bundle")
        }
        pool = loadPhotoPool()
        photos = mixPhotos(pool)
        for photo in photos.prefix(2) {
            warm(photo)
        }
        watchScreenChanges()
    }

    /// Unplugging the external display makes the MacBook a larger screen, but
    /// the desktop keeps the old wallpaper window and a black band stays around
    /// the photo. Quitting lets the wallpaper host open a new window at the
    /// size of the screen that remains. Same when the display is plugged back in.
    private func watchScreenChanges() {
        guard screenObserver == nil, !isPreview else { return }
        screenObserver = NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.screenConfigurationChanged()
        }
    }

    private func screenConfigurationChanged() {
        guard !isPreview, screenBaseline != nil else { return }
        screenChangeGeneration += 1
        let generation = screenChangeGeneration
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { [weak self] in
            guard let self, generation == self.screenChangeGeneration else { return }
            guard self.screensDifferFromBaseline() else { return }
            exit(0)
        }
    }

    private func screensDifferFromBaseline() -> Bool {
        guard let screenBaseline else { return false }
        let now = activeScreens().map(\.frame)
        guard now.count == screenBaseline.count else { return true }
        for (current, original) in zip(now, screenBaseline) where !nearlyEqual(current, original) {
            return true
        }
        return false
    }

    private func registerFonts() {
        let bundle = Bundle(for: FFDimmenView.self)
        for name in ["Montserrat-Light", "Montserrat-ExtraBold"] {
            guard let url = bundle.url(forResource: name, withExtension: "ttf") else { continue }
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            if name == "Montserrat-Light" {
                lightFontName = postScriptName(url)
            }
        }
    }

    private func postScriptName(_ url: URL) -> String? {
        guard let descriptors = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor],
              let descriptor = descriptors.first else { return nil }
        return CTFontDescriptorCopyAttribute(descriptor, kCTFontNameAttribute) as? String
    }

    private func font(size: CGFloat, tabular: Bool = false) -> NSFont {
        let resolved: NSFont
        if let lightFontName, let named = NSFont(name: lightFontName, size: size) {
            resolved = named
        } else {
            resolved = NSFont.systemFont(ofSize: size, weight: .light)
        }
        guard tabular else { return resolved }
        let descriptor = resolved.fontDescriptor.addingAttributes([
            .featureSettings: [
                [
                    NSFontDescriptor.FeatureKey.typeIdentifier: kNumberSpacingType,
                    NSFontDescriptor.FeatureKey.selectorIdentifier: kMonospacedNumbersSelector,
                ],
            ],
        ])
        return NSFont(descriptor: descriptor, size: size) ?? resolved
    }

    /// Wake just after the next minute so the painted time has already flipped.
    private func delayUntilNextMinute(from date: Date = Date()) -> CFTimeInterval {
        let parts = Calendar.current.dateComponents([.second, .nanosecond], from: date)
        let into = CFTimeInterval(parts.second ?? 0) + CFTimeInterval(parts.nanosecond ?? 0) / 1_000_000_000
        return max(0.05, (60 - into) + 0.02)
    }

    private func noteInterval(_ interval: CFTimeInterval) {
        if abs(animationTimeInterval - interval) > 0.01 {
            animationTimeInterval = interval
        }
    }

    private func timeString(_ date: Date) -> String {
        let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0)
    }

    private func dateString(_ date: Date) -> String {
        dutchDate.timeZone = .current
        return dutchDate.string(from: date).lowercased(with: Locale(identifier: "nl_NL"))
    }

    private func clockStamp(at date: Date = Date()) -> String {
        timeString(date) + "\n" + dateString(date)
    }

    /// Upper right, same Core Text frames as the tagline and the project line.
    /// Those already show on the live saver. CTLine image bounds are not used:
    /// in the host context they can come back empty and the old clock bailed out.
    private func drawClock(in context: CGContext) {
        guard bounds.width > 80, bounds.height > 80 else { return }
        let now = Date()
        let stamp = clockStamp(at: now)
        let scale = bounds.width < 1100 ? max(0.55, bounds.width / 1100) : 1
        let margin: CGFloat = bounds.width >= 900 ? 48 : 16
        let timeFont = font(size: 72 * scale, tabular: true)
        let dateFont = font(size: 20 * scale)
        let timeText = timeString(now)
        let dateText = dateString(now)
        let column = bounds.width - margin * 2
        let timeHeight = measure(timeText, font: timeFont, width: column, align: .right).height
        let dateHeight = measure(dateText, font: dateFont, width: column, align: .right).height
        let gap = 12 * scale
        // As a desktop background the view runs under the menu bar. Keep the
        // same edge margin, measured from the visible top instead of the bezel.
        let timeRect = CGRect(
            x: bounds.minX + margin,
            y: bounds.maxY - margin - clockTopInset() - timeHeight,
            width: column,
            height: timeHeight
        )
        let dateRect = CGRect(
            x: bounds.minX + margin,
            y: timeRect.minY - gap - dateHeight,
            width: column,
            height: dateHeight
        )
        draw(timeText, font: timeFont, color: Ink.ink, in: timeRect, align: .right, context: context)
        draw(dateText, font: dateFont, color: Ink.quiet, in: dateRect, align: .right, context: context)
        drawnClockStamp = stamp
    }

    /// Points where this view is covered by the menu bar. Zero while the
    /// screensaver hides the menu bar, so the idle clock stays in the corner.
    private func clockTopInset() -> CGFloat {
        guard let screen = hostScreen(), let window else { return 0 }
        let topInWindow = convert(CGPoint(x: bounds.midX, y: bounds.maxY), to: nil)
        let topOnScreen = window.convertPoint(toScreen: topInWindow)
        let covered = topOnScreen.y - screen.visibleFrame.maxY
        // A menu bar is a few dozen points. A larger gap means the wrong screen
        // was measured; do not shove the clock down the photo.
        return min(80, max(0, covered))
    }

    private enum Surface {
        case solo
        case ensemble(slot: Int, count: Int, clock: Bool)

        var showsClock: Bool {
            switch self {
            case .solo:
                return true
            case .ensemble(_, _, let clock):
                return clock
            }
        }
    }

    /// Clock only on the primary display when more than one screen is attached.
    /// A partial view on Denver must not grow its own clock.
    private func shouldDrawClock(_ mode: Surface) -> Bool {
        guard mode.showsClock else { return false }
        let screens = NSScreen.screens.filter { $0.frame.width >= 1 && $0.frame.height >= 1 }
        guard screens.count > 1, let screen = hostScreen() else { return true }
        return screen.frame.minX == 0 && screen.frame.minY == 0
    }

    /// One display, or the small preview in System Settings, keeps the single photo mix.
    /// Two or more full displays share one project and split its photos.
    private func prepareSurface() -> Surface {
        let mode = resolveSurface()
        switch mode {
        case .solo:
            if photos.isEmpty {
                if pool.isEmpty { pool = loadPhotoPool() }
                photos = mixPhotos(pool)
            }
        case .ensemble:
            joinEnsemble()
        }
        return mode
    }

    private func resolveSurface() -> Surface {
        if isPreview {
            return .solo
        }
        let screens = activeScreens()
        guard screens.count > 1, let screen = hostScreen(), window?.screen != nil else {
            return .solo
        }
        if bounds.width < screen.frame.width * 0.5 || bounds.height < screen.frame.height * 0.5 {
            return .solo
        }
        let preferred = screens.firstIndex { $0.frame.equalTo(screen.frame) } ?? 0
        let slot = stableSlot(preferred: preferred, count: screens.count)
        // The primary display is the one whose frame starts at the origin.
        // Denver sits beside it and has no menu bar, so it gets no clock.
        let clock = screen.frame.minX == 0 && screen.frame.minY == 0
        return .ensemble(slot: slot, count: screens.count, clock: clock)
    }

    /// Left to right, then bottom to top. Slot 0 and slot 1 then pick different photos.
    private func activeScreens() -> [NSScreen] {
        NSScreen.screens
            .filter { $0.frame.width >= 1 && $0.frame.height >= 1 }
            .sorted { lhs, rhs in
                if lhs.frame.minX != rhs.frame.minX { return lhs.frame.minX < rhs.frame.minX }
                return lhs.frame.minY < rhs.frame.minY
            }
    }

    private func stableSlot(preferred: Int, count: Int) -> Int {
        if let assignedSlot { return assignedSlot }
        let slot = Ensemble.shared.claim(preferred: preferred, count: count)
        assignedSlot = slot
        return slot
    }

    private func hostScreen() -> NSScreen? {
        let screens = activeScreens()
        if let screen = window?.screen, screens.contains(where: { $0.frame.equalTo(screen.frame) }) {
            lastScreen = screen
            return screen
        }
        if let window {
            let center = CGPoint(x: window.frame.midX, y: window.frame.midY)
            if let match = screens.first(where: { $0.frame.contains(center) }) {
                lastScreen = match
                return match
            }
        }
        return lastScreen
    }

    private func joinEnsemble() {
        guard !joinedEnsemble else { return }
        if pool.isEmpty { pool = loadPhotoPool() }
        joinedEnsemble = true
        Ensemble.shared.join(pool)
    }

    private func leaveEnsemble() {
        guard joinedEnsemble else { return }
        joinedEnsemble = false
        if let assignedSlot {
            Ensemble.shared.release(assignedSlot)
            self.assignedSlot = nil
        }
        Ensemble.shared.leave()
    }

    private func holdsStill(_ mode: Surface) -> Bool {
        if reduceMotion { return true }
        switch mode {
        case .solo:
            return photos.count < 2
        case .ensemble(let slot, let count, _):
            return !Ensemble.shared.changes(slot: slot, screens: count)
        }
    }

    private func playback(for mode: Surface) -> (index: Int, since: CFTimeInterval, switches: Int) {
        switch mode {
        case .solo:
            let elapsed = max(0, CACurrentMediaTime() - cycleStart)
            let switches = Int(elapsed / switchInterval)
            let since = elapsed - CFTimeInterval(switches) * switchInterval
            let index = photos.isEmpty ? 0 : switches % photos.count
            return (index, since, switches)
        case .ensemble:
            return Ensemble.shared.playback()
        }
    }

    private func layers(for mode: Surface) -> [(photo: Photo, opacity: CGFloat)] {
        switch mode {
        case .solo:
            return soloLayers()
        case .ensemble(let slot, let count, _):
            return ensembleLayers(slot: slot, count: count)
        }
    }

    private func soloLayers() -> [(photo: Photo, opacity: CGFloat)] {
        guard !photos.isEmpty else { return [] }
        if reduceMotion || photos.count < 2 {
            return [(photos[0], 1)]
        }
        let play = playback(for: .solo)
        if play.switches == 0 || play.since >= fadeDuration {
            return [(photos[play.index], 1)]
        }
        let progress = CGFloat(dimEase(play.since / fadeDuration))
        let previous = (play.index - 1 + photos.count) % photos.count
        return [(photos[previous], 1 - progress), (photos[play.index], progress)]
    }

    private func ensembleLayers(slot: Int, count: Int) -> [(photo: Photo, opacity: CGFloat)] {
        let play = Ensemble.shared.playback()
        guard let current = Ensemble.shared.photo(switches: play.switches, slot: slot, screens: count) else {
            return []
        }
        if reduceMotion || play.switches == 0 || play.since >= fadeDuration {
            return [(current, 1)]
        }
        guard let previous = Ensemble.shared.photo(switches: play.switches - 1, slot: slot, screens: count),
              previous.id != current.id else {
            return [(current, 1)]
        }
        let progress = CGFloat(dimEase(play.since / fadeDuration))
        return [(previous, 1 - progress), (current, progress)]
    }

    private func upcoming(for mode: Surface) -> Photo? {
        switch mode {
        case .solo:
            guard photos.count >= 2 else { return nil }
            let play = playback(for: .solo)
            return photos[(play.index + 1) % photos.count]
        case .ensemble(let slot, let count, _):
            let play = Ensemble.shared.playback()
            return Ensemble.shared.photo(switches: play.switches + 1, slot: slot, screens: count)
        }
    }

    private func warm(_ photo: Photo) {
        guard images[photo.id] == nil else { return }
        images[photo.id] = loadImage(photo)
        guard images[photo.id] != nil else { return }
        if images.count > 6 {
            var keep = Set(layers(for: resolveSurface()).map(\.photo.id))
            keep.insert(photo.id)
            images = images.filter { keep.contains($0.key) }
        }
    }

    private func draw(_ photo: Photo, opacity: CGFloat, in context: CGContext) {
        guard let image = images[photo.id] ?? loadNow(photo) else { return }
        let imageSize = CGSize(width: image.width, height: image.height)
        guard imageSize.width > 0, imageSize.height > 0 else { return }
        let focalX = focalFraction(photo.focalX)
        let focalY = focalFraction(photo.focalY)
        let scale = max(bounds.width / imageSize.width, bounds.height / imageSize.height)
        let drawn = CGSize(width: imageSize.width * scale, height: imageSize.height * scale)
        let rect = CGRect(
            x: bounds.minX + focalX * (bounds.width - drawn.width),
            y: bounds.minY + (1 - focalY) * (bounds.height - drawn.height),
            width: drawn.width,
            height: drawn.height
        )
        context.saveGState()
        context.setAlpha(opacity)
        context.draw(image, in: rect)
        context.restoreGState()
    }

    private func loadNow(_ photo: Photo) -> CGImage? {
        warm(photo)
        return images[photo.id]
    }

    /// Read the bytes in this process. ImageIO's URL loader can miss a file the
    /// sandbox is allowed to read, and a webp that will not decode falls through
    /// to the jpeg still of the same photo.
    private func loadImage(_ photo: Photo) -> CGImage? {
        let folder = (photo.path as NSString).deletingLastPathComponent
        var paths = [photo.path]
        for name in ["1600.jpg", "1600.webp", "800.webp"] {
            let path = (folder as NSString).appendingPathComponent(name)
            if !paths.contains(path) { paths.append(path) }
        }
        for path in paths {
            guard let data = try? Data(contentsOf: URL(fileURLWithPath: path), options: [.uncached]),
                  let source = CGImageSourceCreateWithData(data as CFData, nil),
                  let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { continue }
            return image
        }
        return nil
    }

    /// Same rounding as the site: one decimal on the percentage.
    private func focalFraction(_ value: Double) -> CGFloat {
        guard value.isFinite else { return 0.5 }
        let percent = min(100, max(0, (value * 1000).rounded() / 10))
        return CGFloat(percent / 100)
    }

    private func drawMark(in context: CGContext) {
        let scale = bounds.width < 1100 ? max(0.55, bounds.width / 1100) : 1
        let margin: CGFloat = bounds.width >= 900 ? 48 : 16
        let column = min(chWidth(size: 20 * scale) * 36, bounds.width - margin * 2)
        let taglineFont = font(size: 20 * scale)
        let textHeight = measure(tagline, font: taglineFont, width: column, align: .center).height
        let gap = 24 * scale
        let logoWidth = min(1080 * scale, bounds.width - margin * 2)
        let logoHeight = wordmark.map { logoWidth * $0.viewBox.height / $0.viewBox.width } ?? 0
        let group = (wordmark == nil ? 0 : logoHeight + gap) + textHeight
        var top = bounds.midY + group / 2

        if let wordmark, logoHeight > 0 {
            let logoRect = CGRect(
                x: bounds.midX - logoWidth / 2,
                y: top - logoHeight,
                width: logoWidth,
                height: logoHeight
            )
            context.addPath(wordmark.path(in: logoRect))
            context.setFillColor(Ink.ink.cgColor)
            context.fillPath()
            top = logoRect.minY - gap
        }

        let textRect = CGRect(
            x: bounds.midX - column / 2,
            y: top - textHeight,
            width: column,
            height: textHeight
        )
        draw(tagline, font: taglineFont, color: Ink.ink, in: textRect, align: .center, context: context)
    }

    private func drawCaption(_ photo: Photo, opacity: CGFloat, in context: CGContext) {
        let scale = bounds.width < 1100 ? max(0.55, bounds.width / 1100) : 1
        let margin: CGFloat = bounds.width >= 900 ? 48 : 16
        let width = min(560 * scale, bounds.width - margin * 2)
        let x = bounds.maxX - margin - width
        let titleFont = font(size: 17 * scale)
        let metaFont = font(size: 14 * scale)
        let colorTitle = Ink.ink.withAlphaComponent(opacity)
        let colorMeta = Ink.quiet.withAlphaComponent(opacity)
        let photographer = photo.photographer.trimmingCharacters(in: .whitespacesAndNewlines)
        let rows: [(String, NSFont, NSColor)] = [
            (photo.title.trimmingCharacters(in: .whitespacesAndNewlines), titleFont, colorTitle),
            (photo.role.trimmingCharacters(in: .whitespacesAndNewlines), metaFont, colorMeta),
            (metaLine(photo), metaFont, colorMeta),
            (photographer.isEmpty ? "" : "Foto \(photographer)", metaFont, colorMeta),
        ].filter { !$0.0.isEmpty }
        if rows.isEmpty { return }

        let gap = 8 * scale
        var y = bounds.minY + margin
        for row in rows.reversed() {
            let height = measure(row.0, font: row.1, width: width, align: .right).height
            draw(row.0, font: row.1, color: row.2, in: CGRect(x: x, y: y, width: width, height: height), align: .right, context: context)
            y += height + gap
        }
    }

    private func metaLine(_ photo: Photo) -> String {
        var parts: [String] = []
        let client = photo.client.trimmingCharacters(in: .whitespacesAndNewlines)
        let location = photo.location.trimmingCharacters(in: .whitespacesAndNewlines)
        if !client.isEmpty { parts.append(client) }
        if !location.isEmpty { parts.append(location) }
        if let year = photo.year { parts.append(String(year)) }
        return parts.joined(separator: " · ")
    }

    private func chWidth(size: CGFloat) -> CGFloat {
        let font = font(size: size)
        var glyph: CGGlyph = 0
        var character = UniChar(48)
        if !CTFontGetGlyphsForCharacters(font, &character, &glyph, 1) || glyph == 0 {
            return size * 0.62
        }
        var advance = CGSize.zero
        CTFontGetAdvancesForGlyphs(font, .horizontal, &glyph, &advance, 1)
        return advance.width > 0 ? advance.width : size * 0.62
    }

    private func measure(_ text: String, font: NSFont, width: CGFloat, align: NSTextAlignment) -> CGSize {
        let framesetter = CTFramesetterCreateWithAttributedString(attributed(text, font: font, color: Ink.ink, align: align))
        var fit = CFRange()
        let size = CTFramesetterSuggestFrameSizeWithConstraints(
            framesetter,
            CFRange(location: 0, length: text.utf16.count),
            nil,
            CGSize(width: width, height: 800),
            &fit
        )
        return CGSize(width: width, height: max(ceil(size.height), font.pointSize))
    }

    private func draw(
        _ text: String,
        font: NSFont,
        color: NSColor,
        in rect: CGRect,
        align: NSTextAlignment,
        context: CGContext
    ) {
        let framesetter = CTFramesetterCreateWithAttributedString(attributed(text, font: font, color: color, align: align))
        let frame = CTFramesetterCreateFrame(
            framesetter,
            CFRange(location: 0, length: text.utf16.count),
            CGPath(rect: rect, transform: nil),
            nil
        )
        context.saveGState()
        context.textMatrix = .identity
        CTFrameDraw(frame, context)
        context.restoreGState()
    }

    private func attributed(_ text: String, font: NSFont, color: NSColor, align: NSTextAlignment) -> NSAttributedString {
        let style = NSMutableParagraphStyle()
        style.alignment = align
        style.lineBreakMode = .byWordWrapping
        return NSAttributedString(string: text, attributes: [
            .font: font,
            .foregroundColor: color,
            NSAttributedString.Key(kCTForegroundColorAttributeName as String): color.cgColor,
            .paragraphStyle: style,
        ])
    }
}
