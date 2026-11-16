"""Compare Python 3.11 imports before/after #88, without modifying the checkout.

Run with the development environment's Python 3.11 interpreter:
    .venv/bin/python experiments/issue-88/reproduce.py
"""

import os
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASELINE = "0bd09811724b5cff90efb61bcc9846c6d975693d"


def import_codec(source: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [os.sys.executable, "-c", "from link_notation_objects_codec import encode, decode; "
         "assert decode(encode({'value': [1, 'hello', None]})) == {'value': [1, 'hello', None]}"],
        cwd=source.parent,
        env={**os.environ, "PYTHONPATH": str(source)},
        capture_output=True,
        text=True,
        check=False,
    )


with tempfile.TemporaryDirectory(prefix="issue-88-") as directory:
    source = Path(directory) / "src"
    files = subprocess.check_output(
        ["git", "ls-tree", "-r", "--name-only", BASELINE, "python/src"], cwd=ROOT, text=True
    ).splitlines()
    for name in files:
        path = source / Path(name).relative_to("python/src")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(subprocess.check_output(["git", "show", f"{BASELINE}:{name}"], cwd=ROOT))
    before = import_codec(source)
    assert before.returncode != 0 and "NameError: name '_Node' is not defined" in before.stderr
    print("Before: Python 3.11 import fails with NameError for _Node")
    after = import_codec(ROOT / "python/src")
    assert after.returncode == 0, after.stderr
    print("After: Python 3.11 import and nested-value round trip pass")
