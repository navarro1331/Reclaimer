// Independently authored compiler specimen; the test compiles but never runs it.
public static class RecoveryProof
{
    public const string Sentinel = "Reclaimer-owned-AOT α🚀";
    private static readonly byte[] Fibonacci = { 1, 2, 3, 5, 8, 13, 21 };
    private static readonly object BoxedProof = 173;

    public static void Main()
    {
        Console.WriteLine(Sentinel);
        Console.WriteLine(Fibonacci[(Environment.TickCount & int.MaxValue) % Fibonacci.Length]);
        Console.WriteLine(BoxedProof);
    }
}
