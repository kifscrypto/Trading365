"""Trading365 phase-2 ops automation helpers."""

import sys

# Windows consoles default to cp1252; scripts print arrows/dashes, so force
# UTF-8 with replacement fallback instead of crashing on encode.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
