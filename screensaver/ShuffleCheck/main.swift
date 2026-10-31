import Foundation

func sample(_ id: Int, _ projectId: Int) -> Photo {
    Photo(id: id, projectId: projectId, path: "", focalX: 0.5, focalY: 0.5, title: "", role: "", client: "", location: "", year: nil, photographer: "")
}

func fail(_ message: String) -> Never {
    fputs(message + "\n", stderr)
    exit(1)
}

let three = [sample(1, 10), sample(2, 10), sample(3, 10)]
let one = [sample(4, 20)]
for slot in 0..<4 {
    if screenPhoto(deck: one, slot: slot, screenCount: 4, visit: 0)?.id != 4 {
        fail("Eén foto moet op elk scherm staan")
    }
}
let firstVisit = (0..<2).compactMap { screenPhoto(deck: three, slot: $0, screenCount: 2, visit: 0)?.id }
if Set(firstVisit).count != 2 { fail("Twee schermen kregen dezelfde foto terwijl het project er drie heeft") }
let tight = (0..<5).compactMap { screenPhoto(deck: three, slot: $0, screenCount: 5, visit: 0)?.id }
if Set(tight).count != 3 { fail("Te weinig foto's moeten wel alle drie gebruikt worden") }
let again = screenPhoto(deck: three, slot: 1, screenCount: 2, visit: 0)?.id
if again != firstVisit[1] { fail("Een scherm wisselde van foto binnen hetzelfde bezoek") }
let later = screenPhoto(deck: three, slot: 0, screenCount: 2, visit: 1)?.id
if later == firstVisit[0] { fail("Een volgend bezoek bleef op dezelfde foto plakken") }
for slot in 0..<2 {
    let left = screenPhoto(deck: three, slot: slot, screenCount: 2, visit: 3)?.projectId
    let right = screenPhoto(deck: three, slot: 0, screenCount: 2, visit: 3)?.projectId
    if left != right { fail("Schermen zaten niet in hetzelfde project") }
}

let lcg = LCG(seed: 7)
let decks = projectDecks([sample(1, 10), sample(2, 10), sample(3, 20), sample(4, 30), sample(5, 30)]) { lcg.next() }
if decks.flatMap({ $0.map(\.id) }).sorted() != [1, 2, 3, 4, 5] { fail("Projectstapels verliezen foto's") }
for deck in decks where Set(deck.map(\.projectId)).count != 1 {
    fail("Een stapel mengt twee projecten")
}

let pool = loadPhotoPool()

if CommandLine.arguments.contains("--dump-pool") {
    let items = pool.map { ["id": $0.id, "projectId": $0.projectId] }
    let data = try JSONSerialization.data(withJSONObject: items)
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
    exit(0)
}

if let seedFlag = CommandLine.arguments.firstIndex(of: "--seed"), CommandLine.arguments.count > seedFlag + 1,
   let seed = UInt32(CommandLine.arguments[seedFlag + 1]) {
    let lcg = LCG(seed: seed)
    let mixed = mixPhotos(pool) { lcg.next() }
    print(mixed.map { "\($0.id):\($0.projectId)" }.joined(separator: " "))
    exit(0)
}

if pool.isEmpty {
    fputs("Geen foto's in \(portfolioDataDirectory)\n", stderr)
    exit(1)
}

let ids = pool.map(\.id)
if Set(ids).count != ids.count {
    fputs("Dubbele media-id in de pool\n", stderr)
    exit(1)
}
for photo in pool where !FileManager.default.fileExists(atPath: photo.path) {
    fputs("Bestand ontbreekt: \(photo.path)\n", stderr)
    exit(1)
}

if dimEase(0) != 0 || dimEase(1) != 1 {
    fputs("Dimcurve raakt de uiteinden niet\n", stderr)
    exit(1)
}
var previous = 0.0
for step in 1...8 {
    let value = dimEase(Double(step) / 8)
    if value + 0.000_001 < previous || value > 1 {
        fputs("Dimcurve is niet stijgend\n", stderr)
        exit(1)
    }
    previous = value
}

var counts: [Int: Int] = [:]
for photo in pool {
    counts[photo.projectId, default: 0] += 1
}

for trial in 0..<200 {
    let mixed = mixPhotos(pool)
    if mixed.count != pool.count || Set(mixed.map(\.id)) != Set(ids) {
        fputs("Shuffle verliest foto's (ronde \(trial))\n", stderr)
        exit(1)
    }
    // rotateSeam draait de reeks zo dat de lus van laatste naar eerste van project wisselt.
    if counts.count > 1, let first = mixed.first, let last = mixed.last, first.projectId == last.projectId {
        let order = mixed.map { "\($0.id):\($0.projectId)" }.joined(separator: " ")
        fputs("De lus plakt project \(first.projectId) aan zichzelf.\n\(order)\n", stderr)
        exit(1)
    }
    for (projectId, count) in counts {
        let run = maxProjectRun(mixed, projectId: projectId)
        // Het grootste project wordt gespreid. Kleinere projecten mogen in een korte reeks
        // van twee of drie blijven staan, zoals de site dat ook doet.
        let allowed = max(3, allowedProjectRun(count: count, total: pool.count))
        if run > allowed {
            let order = mixed.map { "\($0.id):\($0.projectId)" }.joined(separator: " ")
            fputs("Project \(projectId) staat \(run) keer naast zichzelf, \(allowed) is het maximum.\n\(order)\n", stderr)
            exit(1)
        }
    }
}

let summary = counts.keys.sorted().map { "project \($0): \(counts[$0] ?? 0)" }.joined(separator: ", ")
print("\(pool.count) foto's (\(summary)). 200 shuffles, geen onnodige buren van hetzelfde project.")
