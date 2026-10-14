public struct Token { public init() {} }
public protocol Reading { func read() -> Token }
public protocol RefinedReading: Reading {}
open class Base: Reading {
  public required init(seed: Token) {}
  public convenience init() { self.init(seed: Token()) }
  open func read() -> Token { return Token() }
  open var item: Token { return Token() }
  public final func sealed(_ value: Token) -> Token { return value }
  public struct Nested { public init() {} }
}
public class Child: Base {
  public required init(seed: Token) { super.init(seed: seed) }
  public override func read() -> Token { return Token() }
  public override var item: Token { return Token() }
}
open class GenericBase<Element> { public init() {} }
public typealias TokenBase = GenericBase<Token>
public final class Specialized: TokenBase { public override init() {} }
public struct Container<Element: Reading> { public init() {} }
public enum Selection { case empty; case token(Token) }
extension Token: Reading { public func read() -> Token { return self } }
public func identity<Element>(_ value: Element) -> Element { return value }
public func make(_ value: Token) -> Token { return value }
public let globalToken = Token()
public actor Store {
  public init() {}
  public func read() -> Token { return Token() }
}
