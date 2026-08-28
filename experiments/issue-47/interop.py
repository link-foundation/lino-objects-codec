#!/usr/bin/env python3
"""Python side of the cross-implementation round trip (issue #47)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "python" / "src"))

from link_notation_objects_codec import decode_line, encode_line  # noqa: E402

#: The record every implementation writes.
RECORD = {
    "phase": "stream_end",
    "bytes": 2827,
    "complete": True,
    "server": {"host": "127.0.0.1", "port": 18878},
    "models": ["claude-haiku", "claude-opus"],
}


def main() -> None:
    mode, target = sys.argv[1], sys.argv[2]
    if mode == "write":
        Path(target).write_text(encode_line(RECORD) + "\n")
    elif mode == "read":
        for path in sorted(Path(target).glob("*.lino")):
            notation = path.read_text().strip()
            print(f"python reading {path.name}: {encode_line(decode_line(notation))}")
    else:
        raise SystemExit("usage: interop.py write <path> | read <dir>")


if __name__ == "__main__":
    main()
