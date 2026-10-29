"""Bounded checks of the indented wrapper and its upstream parser."""
from links_notation import Parser
from link_notation_objects_codec import format_indented, parse_indented

samples = [
    'line1\nline2', 'line1\n\nline2', '\n\n',
    '\n  indented\n\t \nroot:\n  key value\n',
    'line1\r\nline2', 'first "quote"\nsecond \'quote\'',
    '`reference`', '', 'null', '\x00\x01\x7f',
]
for value in samples:
    text = format_indented('doc', {'t': value})
    for label, parse in [('wrapper', parse_indented),
                         ('upstream', lambda t: Parser().parse('doc:\n' + t.split('\n', 1)[1]))]:
        try:
            result = parse(text)
            print(label, repr(value), repr(result))
        except Exception as error:
            print(label, repr(value), type(error).__name__, error)
