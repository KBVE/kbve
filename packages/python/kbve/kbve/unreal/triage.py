"""Find what a session spent its frames on, without being told what to look for.

An allow-list of interesting messages only catches what somebody already knew to
look for, which is the wrong shape for the question "why is this slow". Two
things the log already carries answer it without curation.

Every line is stamped with a frame counter, so the log is a frame-rate timeline
of the whole session. The slow stretches can be found rather than guessed at,
and whatever was logged inside them comes along for free -- at any severity,
including the Display lines a severity filter throws away.

And repetition is its own signal. A line printed nine thousand times is a defect
whatever severity it claims; that is how the per-frame LogMetal spam was found.
Templating the variable parts out of each message and counting what is left
surfaces that class on its own.
"""

import argparse
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path

# [2026.09.06-16.10.46:725][158]LogFoo: Warning: message
LINE_RE = re.compile(
    r"^\[(?P<stamp>\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}):(?P<ms>\d{3})\]"
    r"\[\s*(?P<frame>\d+)\]"
    r"(?:(?P<category>\w+): )?"
    r"(?:(?P<severity>Error|Warning|Display|Verbose|Fatal): )?"
    r"(?P<message>.*)$"
)

# The engine prints the frame counter modulo 1000, so it wraps. Unwrapping needs
# an assumption, and the honest one is the fewest wraps that keep the count
# moving forward: right whenever consecutive lines are under a thousand frames
# apart, which is nearly always, and flagged below when it might not be.
WRAP = 1000

# The fastest anything here plausibly runs. Used only to decide whether a gap
# was long enough to have hidden a wrap, which is what makes a rate a bound
# rather than a figure.
CEILING_FPS = 240.0

# What varies between two printings of "the same" message: numbers, quoted
# names, paths, addresses. Removing them is what makes a message countable.
TEMPLATE_SUBS = (
    (re.compile(r"0x[0-9a-fA-F]+"), "<addr>"),
    (re.compile(r"[/\\][\w./\\-]{3,}"), "<path>"),
    (re.compile(r"'[^']*'"), "'<name>'"),
    (re.compile(r'"[^"]*"'), '"<name>"'),
    (re.compile(r"-?\d+\.\d+"), "<f>"),
    (re.compile(r"\b\d+\b"), "<n>"),
)


def template(message: str) -> str:
    for pattern, replacement in TEMPLATE_SUBS:
        message = pattern.sub(replacement, message)
    return message.strip()


class Event:
    __slots__ = ("when", "frame", "category", "severity", "message", "raw")

    def __init__(self, when, frame, category, severity, message, raw):
        self.when = when
        self.frame = frame
        self.category = category or ""
        self.severity = severity or "Log"
        self.message = message
        self.raw = raw


def unwrap(previous: int, shown: int) -> int:
    """The smallest frame number at or after `previous` that ends in `shown`."""
    candidate = previous - (previous % WRAP) + shown
    return candidate if candidate >= previous else candidate + WRAP


def parse(path: Path) -> list[Event]:
    events: list[Event] = []
    frame = 0

    for raw in path.read_text(errors="replace").splitlines():
        match = LINE_RE.match(raw)
        if not match:
            continue

        when = datetime.strptime(match["stamp"], "%Y.%m.%d-%H.%M.%S") + timedelta(
            milliseconds=int(match["ms"])
        )
        frame = unwrap(frame, int(match["frame"]))
        events.append(
            Event(when, frame, match["category"], match["severity"], match["message"], raw)
        )

    return events


def slow_spans(events: list[Event], floor_fps: float):
    """Gaps between logged frames that ran under `floor_fps`, slowest first.

    A gap is only as trustworthy as it is short. Over a long one the counter may
    have wrapped more often than `unwrap` assumed, and the rate is then a lower
    bound rather than a figure -- marked rather than dropped, because a lower
    bound of nine frames a second is still the answer.
    """
    spans = []
    for before, after in zip(events, events[1:]):
        seconds = (after.when - before.when).total_seconds()
        frames = after.frame - before.frame
        if seconds <= 0.0 or frames <= 0:
            continue
        rate = frames / seconds
        if rate <= floor_fps:
            spans.append((before, after, rate, seconds * CEILING_FPS > WRAP))

    spans.sort(key=lambda span: span[2])
    return spans


def repeats(events: list[Event], top: int):
    counts: Counter[tuple[str, str, str]] = Counter()
    for event in events:
        counts[(event.category, event.severity, template(event.message))] += 1
    return counts.most_common(top)


def report(path: Path, floor_fps: float, top: int) -> int:
    events = parse(path)
    if not events:
        print(f"error: no timestamped lines in {path}", file=sys.stderr)
        return 1

    seconds = (events[-1].when - events[0].when).total_seconds()
    frames = events[-1].frame - events[0].frame
    rate = f"{frames / seconds:.1f} fps average" if seconds > 0 else "no elapsed time"
    print(f"==> {path}")
    print(f"    {len(events)} lines, {frames} frames over {seconds:.0f}s ({rate})")

    spans = slow_spans(events, floor_fps)
    print(f"\n--- stretches under {floor_fps:.0f} fps ({len(spans)}) ---")
    if not spans:
        print("    none")
    for before, after, span_rate, uncertain in spans[:top]:
        gap = (after.when - before.when).total_seconds()
        mark = "  (lower bound; the counter may have wrapped)" if uncertain else ""
        print(f"\n    {span_rate:6.1f} fps over {gap:6.2f}s   frames {before.frame}..{after.frame}{mark}")
        # What the engine said on either side. The cause is named here more
        # often than anywhere else, and at whatever severity it felt like.
        print(f"      from  {before.raw[:150]}")
        print(f"      to    {after.raw[:150]}")

    print(f"\n--- most repeated messages (top {top}) ---")
    printed = 0
    for (category, severity, shape), count in repeats(events, top):
        if count < 2:
            continue
        print(f"    {count:6d}  {category}: {severity}: {shape[:110]}")
        printed += 1
    if not printed:
        print("    nothing repeats")

    tally: defaultdict[str, int] = defaultdict(int)
    for event in events:
        tally[event.severity] += 1
    print("\n--- lines by severity ---")
    print("    " + "  ".join(f"{name}={count}" for name, count in sorted(tally.items())))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Find the slow stretches in an Unreal log and what was logged in them."
    )
    parser.add_argument("log", type=Path, nargs="?", help="a log to read; defaults to the project's")
    parser.add_argument("--project", type=Path, default=None, help="path to the .uproject")
    parser.add_argument("--log-prefix", default=None, help="basename the editor logs under")
    parser.add_argument("--previous", action="store_true", help="read the newest rotated backup")
    parser.add_argument("--fps", type=float, default=45.0, help="report stretches under this rate")
    parser.add_argument("--top", type=int, default=15, help="how many of each list to print")
    args = parser.parse_args(argv or sys.argv[1:])

    log = args.log
    if log is None:
        if not args.project or not args.log_prefix:
            parser.error("give a log, or --project and --log-prefix")
        logs = args.project.resolve().parent / "Saved" / "Logs"
        if args.previous:
            # The run before this one, which is the interesting one whenever a
            # session had to be killed: killing it is what rotated the log.
            backups = sorted(logs.glob(f"{args.log_prefix}-ue-backup-*.log"))
            if not backups:
                print(f"error: no rotated logs in {logs}", file=sys.stderr)
                return 1
            log = backups[-1]
        else:
            log = logs / f"{args.log_prefix}-ue.log"

    if not log.is_file():
        print(f"error: no log at {log}", file=sys.stderr)
        return 1
    return report(log, args.fps, args.top)
