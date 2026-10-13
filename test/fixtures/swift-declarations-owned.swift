// Original declaration-bearing compiler fixture. No compiled function is run.
public protocol OwnedProtocol {}

public final class SealedBox: OwnedProtocol {
  public init() {}
}

public final class FinalLeaf {
  public init() {}
}

open class ExtensibleBox {
  public init() {}
}

public class ChildBox: ExtensibleBox {}

public struct PublicPacket { public init() {} }
internal struct InternalPacket { init() {} }
fileprivate struct FilePacket { init() {} }
private struct PrivatePacket { init() {} }

public enum Choice { case empty }
