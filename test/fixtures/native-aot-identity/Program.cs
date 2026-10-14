// Newly authored metadata specimen. Tests compile it and never execute it.
namespace Reclaimer.Owned.Identity;

public sealed class LedgerWidget
{
    public int Serial;
    public string Label;
    public LedgerWidget(int serial, string label) { Serial = serial; Label = label; }
    public int Mix(int delta) => Serial + delta;
    public sealed class NestedLeaf { public int Depth; }
}

public static class IdentityProof
{
    private static readonly LedgerWidget FrozenWidget = new(73, "Identity-owned α🚀");
    private static readonly LedgerWidget.NestedLeaf FrozenLeaf = new() { Depth = 11 };
    public static void Main()
    {
        Console.WriteLine(typeof(LedgerWidget).Assembly.FullName);
        Console.WriteLine(typeof(LedgerWidget).FullName);
        foreach (var member in typeof(LedgerWidget).GetFields()) Console.WriteLine(member.Name);
        foreach (var member in typeof(LedgerWidget).GetMethods()) Console.WriteLine(member.Name);
        Console.WriteLine(typeof(LedgerWidget.NestedLeaf).FullName);
        foreach (var member in typeof(LedgerWidget.NestedLeaf).GetFields()) Console.WriteLine(member.Name);
        Console.WriteLine(FrozenWidget.Mix(Environment.TickCount) + FrozenLeaf.Depth);
    }
}
