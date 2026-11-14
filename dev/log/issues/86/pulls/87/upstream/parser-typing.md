The Python wheel for `links-notation==0.31.5` contains annotated source, but mypy 2.4.1 treats the import as untyped because the distribution does not ship a `py.typed` marker.

Minimal reproduction in a clean environment:

```sh
python -m pip install links-notation==0.31.5 mypy==2.4.1
printf 'from links_notation import Parser\nParser().parse("(hello world)")\n' > parser_typing.py
mypy --no-incremental parser_typing.py
```

Result: `Skipping analyzing "links_notation": module is installed, but missing library stubs or py.typed marker [import-untyped]`.

Consumer: https://github.com/link-foundation/lino-objects-codec/pull/87 . The local workaround is `ignore_missing_imports = true` in the consumer's mypy configuration, which also prevents validating parser API use.

Please ship an empty `links_notation/py.typed` and include it in wheel/sdist package data, then test an installed-wheel consumer with mypy. If the annotations are intentionally incomplete, a partial stub package or an explicitly documented typing status would make that limitation clear. This report concerns packaging of existing annotations, rather than a request to change parser semantics.
