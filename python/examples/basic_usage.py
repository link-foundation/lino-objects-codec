"""Basic usage examples for lino-objects-codec."""

from link_notation_objects_codec import (
    CircularReferenceError,
    decode,
    encode,
    encode_compact,
)


def main():
    print("=== Link Notation Objects Codec Examples ===\n")

    # Example 1: Basic types
    print("1. Basic Types:")
    basic_examples = [
        None,
        True,
        False,
        42,
        3.14,
        "Hello, World!",
        "Unicode: 你好世界 🌍",
    ]
    for obj in basic_examples:
        encoded = encode(obj)
        decoded = decode(encoded)
        print(f"  {obj!r:30} -> {encoded[:50]:50} -> {decoded!r}")
        assert decoded == obj or (obj != obj and decoded != decoded)  # Handle NaN

    # Example 2: Collections
    print("\n2. Collections:")
    list_example = [1, 2, 3, "hello", True]
    dict_example = {"name": "Alice", "age": 30, "active": True}

    print(f"  List: {list_example}")
    encoded_list = encode(list_example)
    print(f"  Encoded: {encoded_list}")
    decoded_list = decode(encoded_list)
    print(f"  Decoded: {decoded_list}")
    assert decoded_list == list_example

    print(f"\n  Dict: {dict_example}")
    encoded_dict = encode(dict_example)
    print(f"  Encoded: {encoded_dict}")
    decoded_dict = decode(encoded_dict)
    print(f"  Decoded: {decoded_dict}")
    assert decoded_dict == dict_example

    # Example 3: Nested structures
    print("\n3. Nested Structures:")
    nested = {
        "users": [
            {"id": 1, "name": "Alice", "admin": True},
            {"id": 2, "name": "Bob", "admin": False},
        ],
        "metadata": {"version": 1, "count": 2},
    }
    print(f"  Original: {nested}")
    encoded_nested = encode(nested)
    print(f"  Encoded length: {len(encoded_nested)} characters")
    decoded_nested = decode(encoded_nested)
    print(f"  Decoded: {decoded_nested}")
    assert decoded_nested == nested

    # Example 4: Circular references
    print("\n4. Circular References:")
    # Object identity is a property of the compact format, which names shared
    # nodes with ``obj_N`` ids. The readable format writes a plain tree, so it
    # rejects a cycle instead of silently unrolling it.

    # Self-referencing list
    lst = [1, 2, 3]
    lst.append(lst)
    print("  Created self-referencing list")
    encoded_circular = encode_compact(lst)
    print(f"  Encoded: {encoded_circular}")
    decoded_circular = decode(encoded_circular)
    print(f"  Decoded correctly: {decoded_circular[:3] == [1, 2, 3]}")
    print(f"  Circular reference preserved: {decoded_circular[3] is decoded_circular}")
    assert decoded_circular[3] is decoded_circular

    # Self-referencing dict
    d = {"name": "root"}
    d["self"] = d
    print("\n  Created self-referencing dict")
    encoded_dict_circular = encode_compact(d)
    print(f"  Encoded: {encoded_dict_circular}")
    decoded_dict_circular = decode(encoded_dict_circular)
    print(f"  Decoded correctly: {decoded_dict_circular['name'] == 'root'}")
    print(
        f"  Circular reference preserved: {decoded_dict_circular['self'] is decoded_dict_circular}"
    )
    assert decoded_dict_circular["self"] is decoded_dict_circular

    # Example 5: Shared references
    print("\n5. Shared Object References:")
    # Also a compact-format property, for the same reason.
    shared = {"shared": "data", "value": 42}
    container = {"first": shared, "second": shared, "third": shared}
    print("  Created container with 3 references to same object")
    encoded_shared = encode_compact(container)
    print(f"  Encoded: {encoded_shared}")
    decoded_shared = decode(encoded_shared)
    print(
        f"  All three references point to same object: {decoded_shared['first'] is decoded_shared['second'] is decoded_shared['third']}"
    )
    assert decoded_shared["first"] is decoded_shared["second"]
    assert decoded_shared["second"] is decoded_shared["third"]

    # Modify through one reference
    decoded_shared["first"]["modified"] = True
    print(
        f"  Modified through 'first', visible in 'second': {decoded_shared['second'].get('modified')}"
    )
    assert decoded_shared["second"]["modified"] is True

    # Example 6: Output formats
    print("\n6. Output Formats:")
    data = {
        "users": [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}],
        "count": 2,
    }

    # The default output is readable: values are written as they are.
    readable = encode(data)
    print("  Readable (default):")
    print(readable)

    # The compact form carries a type marker per value and base64 encodes strings.
    compact = encode_compact(data)
    print(f"  Compact: {compact}")

    # ``decode`` recognises both.
    print(
        "  Both decode back to the same value: "
        f"{decode(readable) == data and decode(compact) == data}"
    )
    assert decode(readable) == data
    assert decode(compact) == data

    # A cycle has no readable form; use the compact one.
    cyclic: dict[str, object] = {}
    cyclic["self"] = cyclic
    try:
        encode(cyclic)
        raise AssertionError("a cycle should not be writable as readable text")
    except CircularReferenceError as error:
        print(f"  Readable format rejects a cycle: {type(error).__name__}")

    print("\n=== All examples completed successfully! ===")


if __name__ == "__main__":
    main()
