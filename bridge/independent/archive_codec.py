"""Bounded stdlib-only archive stream decoding. Never executes archive content."""
import bz2
import json
import lzma
import sys


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ("bzip2", "xz", "lzma-alone"):
        raise ValueError("Invalid codec arguments")
    expected = int(sys.argv[2])
    if expected < 0 or expected > 256 * 1024 * 1024:
        raise ValueError("Expanded size exceeds decode bound")
    codec = sys.argv[1]
    decoder = (bz2.BZ2Decompressor() if codec == "bzip2" else
               lzma.LZMADecompressor(format=lzma.FORMAT_XZ if codec == "xz" else lzma.FORMAT_ALONE,
                                    memlimit=64 * 1024 * 1024))
    total = packed = 0
    while not decoder.eof:
        data = sys.stdin.buffer.read(65536) if decoder.needs_input else b""
        if decoder.needs_input and not data:
            raise ValueError("Truncated compressed stream")
        packed += len(data)
        if packed > 256 * 1024 * 1024:
            raise ValueError("Compressed size exceeds decode bound")
        output = decoder.decompress(data, max_length=min(65536, expected - total + 1))
        total += len(output)
        if total > expected:
            raise ValueError("Expanded bytes exceed declared size")
        sys.stdout.buffer.write(output)
    if decoder.unused_data or sys.stdin.buffer.read(1):
        raise ValueError("Trailing data or concatenated streams are unsupported")
    if total != expected:
        raise ValueError("Expanded size differs from declared size")
    sys.stdout.buffer.flush()
    sys.stderr.write(json.dumps({"codec": codec, "packed_bytes": packed, "expanded_bytes": total,
                                "python_version": sys.version.split()[0]}) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as failure:
        sys.stderr.write(str(failure)[:1000] + "\n")
        sys.exit(2)
