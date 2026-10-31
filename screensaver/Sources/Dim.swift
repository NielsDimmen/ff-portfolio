import Foundation

/// Same curve as `--dim-ease` on the site: cubic-bezier(.2, .7, .2, 1).
func dimEase(_ time: Double) -> Double {
    if time <= 0 { return 0 }
    if time >= 1 { return 1 }
    let x1 = 0.2
    let y1 = 0.7
    let x2 = 0.2
    let y2 = 1.0

    func sample(_ u: Double, _ a: Double, _ b: Double) -> Double {
        let omu = 1 - u
        return 3 * omu * omu * u * a + 3 * omu * u * u * b + u * u * u
    }

    func sampleDX(_ u: Double) -> Double {
        let omu = 1 - u
        return 3 * omu * omu * x1 + 6 * omu * u * (x2 - x1) + 3 * u * u * (1 - x2)
    }

    var u = time
    for _ in 0..<8 {
        let x = sample(u, x1, x2) - time
        let dx = sampleDX(u)
        if abs(dx) < 1e-6 { break }
        u = min(1, max(0, u - x / dx))
    }
    return sample(u, y1, y2)
}
