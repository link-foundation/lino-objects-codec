"""Writing an append-only log with one record per line (issue #43).

``encode_line`` keeps a record on one line, so appending is one write, a
compactor can cut the file at any newline, and ``grep``, ``tail -f`` and
``wc -l`` all treat one line as one event. ``decode_line`` reads a line back
exactly.
"""

from link_notation_objects_codec import decode_line, encode_line


def record(phase: str, num_bytes: int, complete: bool) -> dict:
    """Build a record of the shape an append-only log actually holds."""
    return {"phase": phase, "bytes": num_bytes, "complete": complete}


def main() -> None:
    print("=== Append-only log, one record per line ===\n")

    # Appending: each record becomes exactly one line of the file.
    entries = [
        record("stream_start", 0, False),
        record("stream_chunk", 1024, False),
        record("stream_end", 2827, True),
    ]
    log = "".join(f"{encode_line(entry)}\n" for entry in entries)
    print(log, end="")

    # Counting: one line is one event, so `wc -l` answers how many there were.
    lines = log.splitlines()
    print(f"\nrecords: {len(lines)}")

    # Reading: a line reader hands over one record at a time.
    decoded = decode_line(lines[-1])
    print(f"last record: {decoded}")
    assert decoded == record("stream_end", 2827, True)

    # Filtering: the text stays readable, so plain string tools still work.
    finished = [line for line in lines if "(complete true)" in line]
    print(f"finished records: {len(finished)}")


if __name__ == "__main__":
    main()
