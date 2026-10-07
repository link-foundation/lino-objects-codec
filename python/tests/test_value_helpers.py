from link_notation_objects_codec import (
    decode,
    decode_line,
    format_value_single_line,
    format_value_verbatim,
)


def test_public_value_helpers():
    for value in ["", "both \"quotes\" and 'quotes'", "line\n\nnext\r\n", "\\n %0A\t\0", "世界🌍"]:
        line = format_value_single_line(value)
        assert "\n" not in line and "\r" not in line
        assert decode_line(line) == value
        assert decode(format_value_verbatim(value)) == value
