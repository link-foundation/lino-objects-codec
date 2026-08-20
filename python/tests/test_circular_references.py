"""Tests for encoding/decoding objects with circular references.

Object identity -- a cycle, or two keys pointing at the same object -- is a
property of the compact format, which names shared nodes with ``obj_N`` ids. The
readable format writes a plain tree and has nowhere to put those ids, so it
rejects a circular value instead of looping; that is covered by
``TestReadableFormatAndCircularReferences``. :func:`decode` reads both formats,
so it is used unaliased throughout.
"""

import pytest

from link_notation_objects_codec import (
    CircularReferenceError,
    decode,
)
from link_notation_objects_codec import (
    encode as encode_readable,
)
from link_notation_objects_codec import (
    encode_compact as encode,
)


class TestCircularReferences:
    """Tests for circular reference handling."""

    def test_self_referencing_list(self):
        """Test encoding/decoding a list that references itself."""
        lst = []
        lst.append(lst)

        encoded = encode(lst)
        # Verify correct Links Notation format with built-in self-reference syntax
        assert encoded == "(obj_0: list obj_0)"

        decoded = decode(encoded)

        # Check that it's a list containing itself
        assert isinstance(decoded, list)
        assert len(decoded) == 1
        assert decoded[0] is decoded

    def test_self_referencing_dict(self):
        """Test encoding/decoding a dict that references itself."""
        d = {}
        d["self"] = d

        encoded = encode(d)
        # Verify correct Links Notation format with built-in self-reference syntax
        assert encoded == "(obj_0: dict ((str c2VsZg==) obj_0))"

        decoded = decode(encoded)

        # Check that it's a dict containing itself
        assert isinstance(decoded, dict)
        assert "self" in decoded
        assert decoded["self"] is decoded

    def test_mutual_reference_lists(self):
        """Test encoding/decoding two lists referencing each other."""
        list1 = [1, 2]
        list2 = [3, 4]
        list1.append(list2)
        list2.append(list1)

        encoded = encode(list1)
        # Multi-link format is used to avoid parser bug with nested self-references
        expected = "(obj_0: list (int 1) (int 2) obj_1)\n(obj_1: list (int 3) (int 4) obj_0)"
        assert encoded == expected

        decoded = decode(encoded)

        # Check the structure
        assert len(decoded) == 3
        assert decoded[0] == 1
        assert decoded[1] == 2
        assert isinstance(decoded[2], list)
        assert len(decoded[2]) == 3
        assert decoded[2][0] == 3
        assert decoded[2][1] == 4
        # Check circular reference
        assert decoded[2][2] is decoded

    def test_mutual_reference_dicts(self):
        """Test encoding/decoding two dicts referencing each other."""
        dict1 = {"name": "dict1"}
        dict2 = {"name": "dict2"}
        dict1["other"] = dict2
        dict2["other"] = dict1

        encoded = encode(dict1)
        decoded = decode(encoded)

        # Check the structure
        assert decoded["name"] == "dict1"
        assert decoded["other"]["name"] == "dict2"
        # Check circular reference
        assert decoded["other"]["other"] is decoded

    def test_complex_circular_structure(self):
        """Test encoding/decoding complex structure with circular references."""
        # Create a tree-like structure with a back reference
        root = {"name": "root", "children": []}
        child1 = {"name": "child1", "parent": root}
        child2 = {"name": "child2", "parent": root}
        root["children"] = [child1, child2]

        encoded = encode(root)
        decoded = decode(encoded)

        # Check the structure
        assert decoded["name"] == "root"
        assert len(decoded["children"]) == 2
        assert decoded["children"][0]["name"] == "child1"
        assert decoded["children"][1]["name"] == "child2"
        # Check circular references
        assert decoded["children"][0]["parent"] is decoded
        assert decoded["children"][1]["parent"] is decoded

    def test_list_with_multiple_references_to_same_object(self):
        """Test encoding/decoding list with multiple references to same object."""
        shared = {"shared": "value"}
        lst = [shared, shared, shared]

        encoded = encode(lst)
        decoded = decode(encoded)

        # Check that all three items reference the same object
        assert len(decoded) == 3
        assert decoded[0] is decoded[1]
        assert decoded[1] is decoded[2]
        assert decoded[0] == {"shared": "value"}

    def test_dict_with_multiple_references_to_same_object(self):
        """Test encoding/decoding dict with multiple references to same object."""
        shared = ["shared", "list"]
        d = {"first": shared, "second": shared, "third": shared}

        encoded = encode(d)
        decoded = decode(encoded)

        # Check that all three values reference the same object
        assert decoded["first"] is decoded["second"]
        assert decoded["second"] is decoded["third"]
        assert decoded["first"] == ["shared", "list"]

    def test_deeply_nested_circular_reference(self):
        """Test encoding/decoding deeply nested structure with circular reference."""
        level1 = {"level": 1}
        level2 = {"level": 2, "parent": level1}
        level3 = {"level": 3, "parent": level2}
        level4 = {"level": 4, "parent": level3}
        level1["child"] = level2
        level2["child"] = level3
        level3["child"] = level4
        # Create circular reference
        level4["root"] = level1

        encoded = encode(level1)
        decoded = decode(encoded)

        # Navigate down the structure
        assert decoded["level"] == 1
        assert decoded["child"]["level"] == 2
        assert decoded["child"]["child"]["level"] == 3
        assert decoded["child"]["child"]["child"]["level"] == 4
        # Check circular reference back to root
        assert decoded["child"]["child"]["child"]["root"] is decoded

    def test_encoded_format_uses_builtin_references_not_ref_marker(self):
        """Cycles must encode as bare `obj_N` links, not `(ref obj_N)`. See issue #27."""
        d = {}
        d["self"] = d
        encoded = encode(d)

        # Self-reference must be a bare obj_0 link, not a (ref ...) wrapper.
        assert "obj_0" in encoded, encoded
        assert "(ref " not in encoded, encoded
        # The owner must be defined inline using the (obj_id: type ...) form.
        assert "(obj_0: dict" in encoded, encoded

    def test_decoder_rejects_legacy_ref_marker(self):
        """Legacy (ref X) form must be rejected as an unknown type marker."""
        legacy = "(dict obj_0 ((str c2VsZg==) (ref obj_0)))"
        with pytest.raises(ValueError, match=r"Unknown type marker:\s*ref"):
            decode(legacy)


class TestReadableFormatAndCircularReferences:
    """The readable format cannot name a shared node, so it refuses a cycle."""

    def test_readable_format_rejects_self_referencing_dict(self):
        """A dict holding itself cannot be written as a tree."""
        obj = {"name": "root"}
        obj["self"] = obj

        with pytest.raises(CircularReferenceError):
            encode_readable(obj)

    def test_readable_format_rejects_self_referencing_list(self):
        """A list holding itself cannot be written as a tree."""
        lst = [1, 2]
        lst.append(lst)

        with pytest.raises(CircularReferenceError):
            encode_readable(lst)

    def test_readable_format_writes_shared_object_twice(self):
        """A shared object is written once per place it appears."""
        shared = {"x": 1}

        text = encode_readable({"a": shared, "b": shared})
        decoded = decode(text)

        assert decoded == {"a": {"x": 1}, "b": {"x": 1}}
        # The values are equal but no longer the same object: only the compact
        # format keeps identity.
        assert decoded["a"] is not decoded["b"]
