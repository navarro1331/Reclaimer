import json
import pathlib
import signal
import sys
import time

signal.signal(signal.SIGTERM, signal.SIG_IGN)
pathlib.Path(sys.argv[1]).write_text(json.dumps({"ready": True, "dont_write_bytecode": sys.dont_write_bytecode}))
if sys.argv[2] == "overflow":
    sys.stdout.buffer.write(b"x" * (2 * 1024 * 1024))
    sys.stdout.buffer.flush()
time.sleep(60)
