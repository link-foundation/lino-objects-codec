"""Run the installed duplication checker against the pre-change JavaScript tree."""

from pathlib import Path
import subprocess
import tarfile
import tempfile

root = Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix="issue-65-duplication-") as directory:
    archive = Path(directory) / "baseline.tar"
    subprocess.run(["git", "archive", "f8549d3", "js", "-o", str(archive)], cwd=root, check=True)
    with tarfile.open(archive) as files:
        files.extractall(directory, filter="data")
    result = subprocess.run([str(root / "js/node_modules/.bin/jscpd"), "."], cwd=Path(directory) / "js")
    raise SystemExit(result.returncode)
