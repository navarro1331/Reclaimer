// Authored for independent compiler-to-demangler verification.
public struct Parcel<Value> {
    public let value: Value
    public init(_ value: Value) { self.value = value }
}

public enum BranchChoice {
    case idle
    case number(Int)
}

public protocol OwnedGauge {
    func measured() -> Int
}

public struct Gauge: OwnedGauge {
    public init() {}
    public func measured() -> Int { 41 }
}

public func increment(_ value: Int) -> Int { value + 1 }
public func echo<Value>(_ value: Value) -> Value { value }
public func delayed(_ value: Int) async -> Int { value }
public func façade(_ value: Int) -> Int { value }
