"""Tests for formatting utilities (format_indented, parse_indented)."""

import pytest

from link_notation_objects_codec import (
    escape_reference,
    format_indented,
    parse_indented,
    unescape_reference,
)


class TestEscapeReference:
    """Tests for escape_reference function."""

    def test_simple_string(self):
        assert escape_reference("hello") == "hello"
        assert escape_reference("world") == "world"

    def test_numbers(self):
        assert escape_reference(42) == "42"
        assert escape_reference(3.14) == "3.14"
        assert escape_reference(-17) == "-17"

    def test_booleans(self):
        assert escape_reference(True) == "True"
        assert escape_reference(False) == "False"

    def test_string_with_spaces(self):
        result = escape_reference("hello world")
        assert result.startswith("'") or result.startswith('"')
        assert "hello world" in result

    def test_string_with_single_quotes(self):
        result = escape_reference("it's")
        assert result.startswith('"')
        assert result == '"it\'s"'

    def test_string_with_double_quotes(self):
        result = escape_reference('he said "hello"')
        assert result.startswith("'")
        assert result == "'he said \"hello\"'"

    def test_string_with_both_quotes(self):
        result = escape_reference('"it\'s" he said')
        assert result.startswith("'") or result.startswith('"')


class TestUnescapeReference:
    """Tests for unescape_reference function."""

    def test_simple_string(self):
        assert unescape_reference("hello") == "hello"

    def test_doubled_double_quotes(self):
        assert unescape_reference('he said ""hello""') == 'he said "hello"'

    def test_doubled_single_quotes(self):
        assert unescape_reference("it''s") == "it's"

    def test_none(self):
        assert unescape_reference(None) is None


class TestFormatIndented:
    """Tests for format_indented function."""

    def test_basic_object(self):
        result = format_indented(
            "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019",
            {
                "uuid": "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019",
                "status": "executed",
                "command": "echo test",
                "exitCode": "0",
            },
        )
        lines = result.split("\n")
        assert lines[0] == "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019"
        assert lines[1] == '  uuid "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019"'
        assert lines[2] == '  status "executed"'
        assert lines[3] == '  command "echo test"'
        assert lines[4] == '  exitCode "0"'

    def test_custom_indentation(self):
        result = format_indented("test-id", {"key": "value"}, indent="    ")
        lines = result.split("\n")
        assert lines[0] == "test-id"
        assert lines[1] == '    key "value"'

    def test_value_with_double_quotes(self):
        # Values containing double quotes are wrapped in single quotes (links-notation style)
        result = format_indented("test-id", {"message": 'He said "hello"'})
        lines = result.split("\n")
        assert lines[0] == "test-id"
        assert lines[1] == "  message 'He said \"hello\"'"

    def test_key_with_space(self):
        result = format_indented("test-id", {"key with space": "value"})
        lines = result.split("\n")
        assert lines[0] == "test-id"
        assert "'key with space'" in lines[1] or '"key with space"' in lines[1]

    def test_null_value(self):
        result = format_indented("test-id", {"key": None})
        lines = result.split("\n")
        assert lines[0] == "test-id"
        assert lines[1] == '  key "null"'

    def test_requires_id(self):
        with pytest.raises(ValueError, match="id is required"):
            format_indented("", {"key": "value"})

    def test_requires_dict(self):
        with pytest.raises(ValueError, match="obj must be a dict"):
            format_indented("test", [1, 2, 3])  # type: ignore


class TestParseIndented:
    """Tests for parse_indented function."""

    def test_basic_object(self):
        text = """6dcf4c1b-ff3f-482c-95ab-711ea7d1b019
  uuid "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019"
  status "executed"
  command "echo test"
  exitCode "0\""""

        identifier, obj = parse_indented(text)
        assert identifier == "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019"
        assert obj["uuid"] == "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019"
        assert obj["status"] == "executed"
        assert obj["command"] == "echo test"
        assert obj["exitCode"] == "0"

    def test_value_with_quotes(self):
        # Links-notation style: use single quotes to wrap value containing double quotes
        text = """test-id
  message 'He said "hello"'"""

        identifier, obj = parse_indented(text)
        assert identifier == "test-id"
        assert obj["message"] == 'He said "hello"'

    def test_empty_lines_are_skipped(self):
        text = """test-id

  key "value"

  another "value2\""""

        identifier, obj = parse_indented(text)
        assert identifier == "test-id"
        assert obj["key"] == "value"
        assert obj["another"] == "value2"

    def test_requires_text(self):
        with pytest.raises(ValueError, match="text is required"):
            parse_indented("")


class TestRoundtrip:
    """Roundtrip tests for format_indented/parse_indented."""

    def test_basic_roundtrip(self):
        original_id = "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019"
        original_obj = {
            "uuid": "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019",
            "status": "executed",
            "command": "echo test",
            "exitCode": "0",
        }

        formatted = format_indented(original_id, original_obj)
        parsed_id, parsed_obj = parse_indented(formatted)

        assert parsed_id == original_id
        assert parsed_obj == original_obj

    def test_roundtrip_with_quotes(self):
        original_id = "test-id"
        original_obj = {"message": 'He said "hello"'}

        formatted = format_indented(original_id, original_obj)
        parsed_id, parsed_obj = parse_indented(formatted)

        assert parsed_id == original_id
        assert parsed_obj == original_obj
