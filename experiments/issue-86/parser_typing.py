"""Reproduce the missing PEP 561 marker in links-notation 0.31.5."""

from links_notation import Parser

print(Parser().parse("(a b)"))
