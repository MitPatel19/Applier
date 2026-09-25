"""In-memory sliding-window limiter for failed sign-in attempts.

This limiter lives in process memory, which is correct for a single API instance. When the
API runs as several instances (or workers), move the counters to a shared store such as Redis
(e.g. a sorted set per key trimmed to the window) so that limits apply across instances.
"""

from __future__ import annotations

import math
import threading
import time
from collections import deque


class FailureLimiter:
    """Blocks a key after ``max_failures`` failures within ``window_seconds``."""

    def __init__(self, max_failures: int, window_seconds: int):
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self._failures: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> deque[float]:
        attempts = self._failures.setdefault(key, deque())
        while attempts and now - attempts[0] >= self.window_seconds:
            attempts.popleft()
        if not attempts:
            self._failures.pop(key, None)
        return attempts

    def retry_after(self, key: str) -> int:
        """Seconds until ``key`` may try again, or 0 when it is not blocked."""
        now = time.monotonic()
        with self._lock:
            attempts = self._prune(key, now)
            if len(attempts) < self.max_failures:
                return 0
            return max(1, math.ceil(self.window_seconds - (now - attempts[0])))

    def record_failure(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            attempts = self._prune(key, now)
            attempts.append(now)
            self._failures[key] = attempts

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._failures.clear()


# 5 failed sign-ins per email + IP address within 15 minutes.
login_limiter = FailureLimiter(max_failures=5, window_seconds=15 * 60)


def login_key(email: str, ip: str | None) -> str:
    return f"{email.lower()}|{ip or 'unknown'}"
