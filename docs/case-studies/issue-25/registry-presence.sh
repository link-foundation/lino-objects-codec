#!/usr/bin/env bash
# Reproduces the registry presence check for lino-objects-codec.
# Re-run this any time to re-validate the publication state.
set -u
echo "npm:    $(curl -sS -o /dev/null -w '%{http_code}' https://registry.npmjs.org/lino-objects-codec)"
echo "PyPI:   $(curl -sS -o /dev/null -w '%{http_code}' https://pypi.org/pypi/lino-objects-codec/json)"
echo "crates: $(curl -sS -o /dev/null -w '%{http_code}' https://crates.io/api/v1/crates/lino-objects-codec)"
echo "NuGet:  $(curl -sS -o /dev/null -w '%{http_code}' https://api.nuget.org/v3-flatcontainer/lino.objects.codec/index.json)"
