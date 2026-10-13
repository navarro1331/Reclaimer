// Original owned input for compiler and static metadata inspection; never executed.
using System.Runtime.InteropServices;

public sealed class OwnedProbe
{
    public int Count { get; }
    public OwnedProbe(int count) { Count = count; }
    public int Compose(int addend) => Count * 5 + addend;
}

public static class Program
{
    [UnmanagedCallersOnly(EntryPoint = "owned_sum")]
    public static int Sum(int first, int second) => first + second;
    public static void Main()
    {
        var probe = new OwnedProbe(7);
        Console.WriteLine(typeof(OwnedProbe).FullName);
        Console.WriteLine(probe.Compose(11));
    }
}
