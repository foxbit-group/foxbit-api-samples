// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "FoxbitExamples",
    platforms: [
        .macOS(.v12)
    ],
    dependencies: [
        .package(url: "https://github.com/swift-server/async-http-client.git", from: "1.25.2"),
        .package(url: "https://github.com/apple/swift-crypto.git", from: "3.12.3")
    ],
    targets: [
        .executableTarget(
            name: "FoxbitExamples",
            dependencies: [
                .product(name: "AsyncHTTPClient", package: "async-http-client"),
                .product(name: "Crypto", package: "swift-crypto")
            ],
            path: "Sources"
        )
    ]
)
