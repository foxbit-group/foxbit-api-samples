// swift-tools-version:6.1
import PackageDescription

let package = Package(
    name: "FoxbitExample",
    platforms: [
        .macOS(.v13)
    ],
    dependencies: [
        // swift-crypto provides HMAC-SHA256 on Linux (CryptoKit is Apple-platform only).
        .package(url: "https://github.com/apple/swift-crypto.git", exact: "4.5.0")
    ],
    targets: [
        .executableTarget(
            name: "FoxbitExample",
            dependencies: [
                .product(name: "Crypto", package: "swift-crypto")
            ],
            path: "Sources"
        )
    ]
)
