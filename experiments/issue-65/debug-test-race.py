"""Bounded reproduction of the tracing tests' shared-global race.

Compile once, then run the two existing tests concurrently in fresh processes.
CI reproduced the failure on Windows; scheduling can also reproduce it locally.
"""

import json
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
environment = {**os.environ, "RUST_BACKTRACE": "full"}
build = subprocess.run(
    ["cargo", "test", "--no-default-features", "--lib", "--no-run", "--message-format=json"],
    cwd=root / "rust", env=environment, text=True, capture_output=True, check=True,
)
binary = next(
    event["executable"] for line in build.stdout.splitlines()
    for event in [json.loads(line)] if event.get("executable")
)
for attempt in range(1, 1001):
    result = subprocess.run(
        [binary, "debug::tests", "--test-threads=2"], env=environment,
        text=True, capture_output=True,
    )
    if result.returncode:
        print(f"Failed on attempt {attempt}", flush=True)
        print(result.stdout, result.stderr)
        raise SystemExit(result.returncode)
print("Both tracing tests passed concurrently in all 1000 fresh processes.")
