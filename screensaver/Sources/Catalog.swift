import Foundation
import SQLite3

/// Portfolio data on this machine. The screensaver reads the SQLite file and
/// the media folder directly, so the website does not have to be running.
/// legacyScreenSaver may read the absolute path, but it cannot create the WAL
/// shared-memory file next to the database. `FileManager.fileExists` can also
/// report false for a file that `fopen` can still read.
let portfolioDataDirectory = "/Users/niels/Portofolio/.data"

private struct OpenedDB {
    var db: OpaquePointer
    var snapshotFolder: String?
}

/// Published covers and gallery photos, in the order `backgroundPhotos` pushes them.
/// Within a project the later shuffle randomises this order.
func loadPhotoPool(dataDir: String = portfolioDataDirectory) -> [Photo] {
    let dbPath = (dataDir as NSString).appendingPathComponent("db.sqlite")
    guard let opened = openPortfolioDatabase(at: dbPath) else {
        notePoolFailure("database niet te openen \(dbPath) \(readProbe(dbPath))")
        return []
    }
    let db = opened.db
    defer {
        sqlite3_close(db)
        if let folder = opened.snapshotFolder {
            try? FileManager.default.removeItem(atPath: folder)
        }
    }

    struct Project {
        var id: Int
        var title: String
        var role: String
        var client: String
        var location: String
        var year: Int?
        var coverId: Int?
    }

    var projects: [Project] = []
    query(db, """
        SELECT id, title_nl, role_nl, client, location, year, cover_media_id
        FROM projects
        WHERE published = 1
        ORDER BY sort_order ASC, id ASC
        """) { stmt in
        let year: Int? = sqlite3_column_type(stmt, 5) == SQLITE_NULL ? nil : Int(sqlite3_column_int(stmt, 5))
        let cover: Int? = sqlite3_column_type(stmt, 6) == SQLITE_NULL ? nil : Int(sqlite3_column_int(stmt, 6))
        projects.append(Project(
            id: Int(sqlite3_column_int(stmt, 0)),
            title: columnText(stmt, 1),
            role: columnText(stmt, 2),
            client: columnText(stmt, 3),
            location: columnText(stmt, 4),
            year: year,
            coverId: cover
        ))
    }

    struct Slot {
        var mediaId: Int
        var project: Project
    }
    var slots: [Slot] = []
    var seen = Set<Int>()
    func push(_ mediaId: Int?, _ project: Project) {
        guard let mediaId, !seen.contains(mediaId) else { return }
        guard imagePath(dataDir: dataDir, id: mediaId) != nil else { return }
        seen.insert(mediaId)
        slots.append(Slot(mediaId: mediaId, project: project))
    }
    for project in projects {
        push(project.coverId, project)
    }
    if !projects.isEmpty {
        let ids = projects.map { String($0.id) }.joined(separator: ",")
        let byId = Dictionary(uniqueKeysWithValues: projects.map { ($0.id, $0) })
        query(db, """
            SELECT media_id, project_id
            FROM project_media
            WHERE project_id IN (\(ids))
            ORDER BY id ASC
            """) { stmt in
            let mediaId = Int(sqlite3_column_int(stmt, 0))
            let projectId = Int(sqlite3_column_int(stmt, 1))
            if let project = byId[projectId] {
                push(mediaId, project)
            }
        }
    }
    if slots.isEmpty {
        notePoolFailure("geen leesbare foto's bij \(projects.count) projecten, \(readProbe((dataDir as NSString).appendingPathComponent("media/9/1600.webp")))")
        return []
    }

    let mediaIds = slots.map { String($0.mediaId) }.joined(separator: ",")
    var details: [Int: (focalX: Double, focalY: Double, photographer: String)] = [:]
    query(db, "SELECT id, focal_x, focal_y, photographer FROM media WHERE id IN (\(mediaIds))") { stmt in
        let id = Int(sqlite3_column_int(stmt, 0))
        details[id] = (sqlite3_column_double(stmt, 1), sqlite3_column_double(stmt, 2), columnText(stmt, 3))
    }

    let photos = slots.compactMap { slot -> Photo? in
        guard let detail = details[slot.mediaId], let path = imagePath(dataDir: dataDir, id: slot.mediaId) else {
            return nil
        }
        return Photo(
            id: slot.mediaId,
            projectId: slot.project.id,
            path: path,
            focalX: detail.focalX,
            focalY: detail.focalY,
            title: slot.project.title,
            role: slot.project.role,
            client: slot.project.client,
            location: slot.project.location,
            year: slot.project.year,
            photographer: detail.photographer
        )
    }
    if photos.isEmpty {
        notePoolFailure("foto's zonder focus of bestand")
        return []
    }
    notePoolStatus("ok \(photos.count) foto's")
    return photos
}

func loadSlideshow(dataDir: String = portfolioDataDirectory) -> [Photo] {
    mixPhotos(loadPhotoPool(dataDir: dataDir))
}

/// Prefer the 1600 still. Fall back the same way a slow connection would.
/// A readable file counts even when `fileExists` is wrong inside the sandbox.
func imagePath(dataDir: String, id: Int) -> String? {
    let folder = (dataDir as NSString).appendingPathComponent("media/\(id)")
    for name in ["1600.webp", "1600.jpg", "800.webp"] {
        let path = (folder as NSString).appendingPathComponent(name)
        if canRead(path) { return path }
    }
    return nil
}

/// Read-only open. WAL mode needs a writable index beside the database, and
/// the screensaver sandbox cannot create that file in `.data`. An empty WAL
/// can be ignored. Otherwise the database is copied into /tmp, where the
/// index is allowed.
private func openPortfolioDatabase(at dbPath: String) -> OpenedDB? {
    if posixSize(dbPath + "-wal") == 0, let db = openImmutable(dbPath) {
        if probe(db) {
            return OpenedDB(db: db, snapshotFolder: nil)
        }
        sqlite3_close(db)
    }
    if let db = openReadOnly(dbPath) {
        if probe(db) {
            return OpenedDB(db: db, snapshotFolder: nil)
        }
        sqlite3_close(db)
    }
    guard let folder = snapshotDatabase(dbPath) else { return nil }
    let copy = (folder as NSString).appendingPathComponent("db.sqlite")
    if let db = openReadOnly(copy) ?? openImmutable(copy) {
        if probe(db) {
            return OpenedDB(db: db, snapshotFolder: folder)
        }
        notePoolStatus("kopie niet leesbaar: \(String(cString: sqlite3_errmsg(db)))")
        sqlite3_close(db)
    }
    try? FileManager.default.removeItem(atPath: folder)
    return nil
}

/// Sees the checkpointed database and does not create a WAL index.
private func openImmutable(_ path: String) -> OpaquePointer? {
    let uri = "file:\(path)?immutable=1"
    var db: OpaquePointer?
    let flags = SQLITE_OPEN_READONLY | SQLITE_OPEN_URI
    let rc = sqlite3_open_v2(uri, &db, flags, nil)
    guard rc == SQLITE_OK, let db else {
        if let db { sqlite3_close(db) }
        return nil
    }
    sqlite3_exec(db, "PRAGMA query_only = ON;", nil, nil, nil)
    return db
}

private func openReadOnly(_ path: String) -> OpaquePointer? {
    var db: OpaquePointer?
    guard sqlite3_open_v2(path, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK, let db else {
        if let db { sqlite3_close(db) }
        return nil
    }
    sqlite3_busy_timeout(db, 3000)
    sqlite3_exec(db, "PRAGMA query_only = ON;", nil, nil, nil)
    return db
}

private func probe(_ db: OpaquePointer) -> Bool {
    var stmt: OpaquePointer?
    let prepared = sqlite3_prepare_v2(db, "SELECT 1 FROM projects LIMIT 1", -1, &stmt, nil)
    defer { sqlite3_finalize(stmt) }
    if prepared != SQLITE_OK { return false }
    let step = sqlite3_step(stmt)
    return step == SQLITE_ROW || step == SQLITE_DONE
}

private func snapshotDatabase(_ dbPath: String) -> String? {
    let folder = "/tmp/ffdimmen-\(UUID().uuidString)"
    if mkdir(folder, 0o700) != 0 {
        notePoolStatus("tijdelijke map mislukt: \(String(cString: strerror(errno)))")
        return nil
    }
    let dest = (folder as NSString).appendingPathComponent("db.sqlite")
    guard copyFile(from: dbPath, to: dest) else {
        notePoolStatus("kopie mislukt \(readProbe(dbPath))")
        try? FileManager.default.removeItem(atPath: folder)
        return nil
    }
    let wal = dbPath + "-wal"
    if posixSize(wal) > 0 {
        _ = copyFile(from: wal, to: dest + "-wal")
    }
    return folder
}

private func copyFile(from source: String, to dest: String) -> Bool {
    guard let input = fopen(source, "rb") else { return false }
    defer { fclose(input) }
    guard let output = fopen(dest, "wb") else { return false }
    defer { fclose(output) }
    let capacity = 1 << 20
    let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: capacity)
    defer { buffer.deallocate() }
    while true {
        let n = fread(buffer, 1, capacity, input)
        if n == 0 { return ferror(input) == 0 }
        if fwrite(buffer, 1, n, output) != n { return false }
    }
}

private func posixSize(_ path: String) -> Int {
    guard let file = fopen(path, "rb") else { return 0 }
    defer { fclose(file) }
    if fseek(file, 0, SEEK_END) != 0 { return 0 }
    return max(0, Int(ftell(file)))
}

private func canRead(_ path: String) -> Bool {
    if FileManager.default.isReadableFile(atPath: path) { return true }
    guard let file = fopen(path, "rb") else { return false }
    fclose(file)
    return true
}

private func readProbe(_ path: String) -> String {
    let exists = FileManager.default.fileExists(atPath: path)
    let readable = FileManager.default.isReadableFile(atPath: path)
    let opened = fopen(path, "rb")
    let error = opened == nil ? String(cString: strerror(errno)) : "ok"
    if let opened { fclose(opened) }
    return "exists=\(exists) readable=\(readable) fopen=\(error)"
}

private func notePoolFailure(_ message: String) {
    notePoolStatus(message)
}

private func notePoolStatus(_ message: String) {
    NSLog("FF Dimmen: \(message)")
    let line = message + "\n"
    guard let data = line.data(using: .utf8) else { return }
    let paths = [
        (NSTemporaryDirectory() as NSString).appendingPathComponent("ffdimmen-status.txt"),
        "/tmp/ffdimmen-status.txt",
    ]
    for path in paths {
        try? data.write(to: URL(fileURLWithPath: path))
    }
}

private func query(_ db: OpaquePointer, _ sql: String, _ row: (OpaquePointer) -> Void) {
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else {
        notePoolFailure("query mislukt: \(String(cString: sqlite3_errmsg(db)))")
        return
    }
    defer { sqlite3_finalize(stmt) }
    while true {
        let step = sqlite3_step(stmt)
        if step == SQLITE_ROW {
            row(stmt)
            continue
        }
        if step != SQLITE_DONE {
            notePoolFailure("query stap \(step): \(String(cString: sqlite3_errmsg(db)))")
        }
        return
    }
}

private func columnText(_ stmt: OpaquePointer, _ index: Int32) -> String {
    guard let bytes = sqlite3_column_text(stmt, index) else { return "" }
    return String(cString: bytes)
}
