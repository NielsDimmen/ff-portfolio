import Foundation

/// One show photo before it is drawn. `projectId` is what the shuffle spreads on.
struct Photo: Equatable {
    var id: Int
    var projectId: Int
    var path: String
    var focalX: Double
    var focalY: Double
    var title: String
    var role: String
    var client: String
    var location: String
    var year: Int?
    var photographer: String
}

/// Same sequence as `Math.random` stand-in used by the parity check.
/// Numerical Recipes LCG, low 32 bits, matching `Math.imul` in the Node fixture.
final class LCG {
    private var state: UInt32

    init(seed: UInt32) {
        state = seed
    }

    func next() -> Double {
        state = 1664525 &* state &+ 1013904223
        return Double(state) / 4_294_967_296.0
    }
}

/// Same order as `mixSlides` / `spread` / `rotateSeam` in `app/server/public/content.ts`.
func mixPhotos(_ photos: [Photo], random: @escaping () -> Double = { Double.random(in: 0..<1) }) -> [Photo] {
    var order: [Int] = []
    var grouped: [Int: [Photo]] = [:]
    for photo in photos {
        if grouped[photo.projectId] == nil {
            order.append(photo.projectId)
            grouped[photo.projectId] = []
        }
        grouped[photo.projectId]?.append(photo)
    }
    let pools = order.compactMap { grouped[$0] }
        .map { shuffle($0, random: random) }
        .sorted { $0.count > $1.count }
    return rotateSeam(spread(pools, random: random), random: random)
}

/// Largest project forms the gaps. The other projects sit in those gaps, mixed the same way.
private func spread(_ groups: [[Photo]], random: @escaping () -> Double) -> [Photo] {
    guard let primary = groups.first else { return [] }
    let rest = Array(groups.dropFirst())
    if rest.isEmpty { return primary }
    let separators = spread(rest, random: random)
    let gaps = max(separators.count, 1)
    let base = primary.count / gaps
    let extra = primary.count % gaps
    let extraGaps = Set(shuffle(Array(0..<gaps), random: random).prefix(extra))
    var result: [Photo] = []
    var cursor = 0
    for gap in 0..<gaps {
        let count = base + (extraGaps.contains(gap) ? 1 : 0)
        for _ in 0..<count {
            if cursor < primary.count {
                result.append(primary[cursor])
                cursor += 1
            }
        }
        if gap < separators.count {
            result.append(separators[gap])
        }
    }
    return result
}

/// Rotate so the loop from the last photo back to the first also changes project, when that is possible.
private func rotateSeam(_ photos: [Photo], random: () -> Double) -> [Photo] {
    if photos.count < 2 { return photos }
    var seams: [Int] = []
    for index in photos.indices {
        let next = photos[(index + 1) % photos.count]
        if photos[index].projectId != next.projectId {
            seams.append(index)
        }
    }
    if seams.isEmpty { return photos }
    var pick = Int(random() * Double(seams.count))
    if pick >= seams.count { pick = seams.count - 1 }
    if pick < 0 { pick = 0 }
    let seam = seams[pick]
    let start = (seam + 1) % photos.count
    return Array(photos[start...]) + Array(photos[..<start])
}

private func shuffle<T>(_ items: [T], random: () -> Double) -> [T] {
    var copy = items
    if copy.count < 2 { return copy }
    for index in stride(from: copy.count - 1, through: 1, by: -1) {
        var swap = Int(random() * Double(index + 1))
        if swap > index { swap = index }
        if swap < 0 { swap = 0 }
        if swap != index {
            copy.swapAt(index, swap)
        }
    }
    return copy
}

/// One deck per project. The project order and the photos inside each deck are shuffled once.
/// Every screen reads the same decks, so they stay on the same project.
func projectDecks(_ photos: [Photo], random: @escaping () -> Double = { Double.random(in: 0..<1) }) -> [[Photo]] {
    var order: [Int] = []
    var grouped: [Int: [Photo]] = [:]
    for photo in photos {
        if grouped[photo.projectId] == nil {
            order.append(photo.projectId)
            grouped[photo.projectId] = []
        }
        grouped[photo.projectId]?.append(photo)
    }
    let decks = order.compactMap { grouped[$0] }.map { shuffle($0, random: random) }
    return shuffle(decks, random: random)
}

/// Photo for one screen during one visit to a project.
/// Screens share the visit, so they move to the next project together.
/// A photo is used once per visit while the deck has enough; a single photo fills every screen.
func screenPhoto(deck: [Photo], slot: Int, screenCount: Int, visit: Int) -> Photo? {
    guard !deck.isEmpty else { return nil }
    if deck.count == 1 { return deck[0] }
    let screens = max(1, screenCount)
    let place = min(max(0, slot), screens - 1)
    let offset = (max(0, visit) * screens) % deck.count
    return deck[(offset + place) % deck.count]
}

/// Longest run of one project, including the step from the last photo back to the first.
func maxProjectRun(_ photos: [Photo], projectId: Int) -> Int {
    let flags = photos.map { $0.projectId == projectId }
    let count = flags.count
    guard count > 0, flags.contains(true) else { return 0 }
    if flags.allSatisfy({ $0 }) { return count }
    var best = 0
    var run = 0
    for flag in flags + flags {
        if flag {
            run += 1
            best = max(best, min(run, count))
        } else {
            run = 0
        }
    }
    return best
}

/// Shortest worst-case run if every other photo is used as a separator.
func allowedProjectRun(count: Int, total: Int) -> Int {
    let others = total - count
    if others <= 0 { return count }
    return Int((Double(count) / Double(others)).rounded(.up))
}
