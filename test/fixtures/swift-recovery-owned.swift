// Independently authored ABI recovery input. No compiled function is executed.
precedencegroup AssignmentPrecedence {
  assignment: true
  associativity: right
}

public struct Parcel<Element> {
  public init() {}
}

public struct Holder<Element> {
  public let value: Element
  public init(_ value: Element) { self.value = value }
}

public protocol OwnedTap {
  func ping()
}

public class OwnedBase {
  public init() {}
  public func ping() {}
}

public class OwnedChild: OwnedBase, OwnedTap {
  public override func ping() {}
}

extension Parcel: OwnedTap where Element: OwnedTap {
  public func ping() {}
}

public class GenericOwner<Element> {
  public init() {}
  public func ping() {}
}

public enum OwnedChoice {
  case empty
  case parcel(Parcel<OwnedBase>)
}
