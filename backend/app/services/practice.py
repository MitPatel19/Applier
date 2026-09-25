"""Heuristic feedback on practice interview answers (STAR structure, ownership, specificity)."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.models import utcnow
from app.schemas.tracking import PracticeEntry


def _rx(pattern: str) -> re.Pattern[str]:
    return re.compile(pattern, re.IGNORECASE)


@dataclass(frozen=True)
class StarPart:
    key: str
    label: str
    pattern: re.Pattern[str]
    missing_tip: str


STAR_PARTS: tuple[StarPart, ...] = (
    StarPart("situation", "Situation",
             _rx(r"\b(when i was|while (i was )?working|at my (last|previous|current)|in my (role|job|position)|"
                 r"during|last (year|summer|semester)|at the time|our team|the company|a client|a customer)\b"),
             "Open with one sentence of context: where you were and what was going on."),
    StarPart("task", "Task",
             _rx(r"\b(my (role|task|job|goal|responsibility) was|i was (asked|responsible|tasked|assigned)|i needed to|"
                 r"we needed to|the goal was|had to|was expected to|the problem was)\b"),
             "State your specific responsibility or goal — what you were asked to achieve."),
    StarPart("action", "Action",
             _rx(r"\bi (built|created|designed|implemented|wrote|led|organized|fixed|investigated|set up|configured|"
                 r"automated|analyzed|analysed|reached out|proposed|decided|tested|refactored|migrated|trained|"
                 r"documented|debugged|reviewed|added|replaced|rewrote|talked|worked with|started|used|walked)\b"),
             "Describe the steps YOU took, using strong verbs (\"I investigated…\", \"I rewrote…\")."),
    StarPart("result", "Result",
             _rx(r"\b(as a result|result(ed)? in|which (led|meant|reduced|increased|improved|saved|cut)|reduced|"
                 r"increased|improved|saved|cut|so that|the outcome|in the end|ended up|afterwards|now)\b|\d+\s?%"),
             "Finish with the outcome — what changed, ideally with a number (only if it's true)."),
)

FILLERS = _rx(r"\b(um+|uh+|like(?=,)|basically|actually|you know|kind of|sort of|literally|honestly)\b")
NUMBER = re.compile(r"\d")
IDEAL_MIN_WORDS, IDEAL_MAX_WORDS = 120, 320


def _length_score(words: int) -> tuple[int, str | None]:
    if words < 60:
        return 3, (f"Your answer is short ({words} words). Aim for about {IDEAL_MIN_WORDS}–{IDEAL_MAX_WORDS} words "
                   "(1–2 minutes spoken) so there's room for context and a result.")
    if words < IDEAL_MIN_WORDS:
        return 10, f"Good start at {words} words — one or two more sentences on your actions would strengthen it."
    if words > 450:
        return 5, (f"Your answer runs long ({words} words). Trim the background and keep the focus on your "
                   "actions and the result.")
    if words > IDEAL_MAX_WORDS:
        return 11, f"At {words} words it's slightly long; tighten the situation to one sentence."
    return 15, None


def _ownership(answer: str) -> tuple[int, str | None]:
    i_count = len(re.findall(r"\b(i|i'm|i've|my|me)\b", answer, re.IGNORECASE))
    we_count = len(re.findall(r"\b(we|we're|we've|our|us)\b", answer, re.IGNORECASE))
    if i_count == 0:
        return 0, "Say what you personally did — use \"I\" for your own actions."
    if we_count > i_count:
        return 5, (f"You said \"we\" {we_count} times and \"I\" {i_count} times. Interviewers want your contribution — "
                   "make clear which parts you did.")
    return 10, None


def evaluate(question: str, answer: str) -> PracticeEntry:
    """Score a practice answer 0–100 with actionable feedback lines."""
    text = answer.strip()
    words = len(text.split())
    feedback: list[str] = []
    score = 0

    present = [part for part in STAR_PARTS if part.pattern.search(text)]
    missing = [part for part in STAR_PARTS if part not in present]
    score += 15 * len(present)
    if present:
        feedback.append("Clear " + ", ".join(p.label.lower() for p in present) + " — good structure so far."
                        if missing else "All four STAR parts are there — well structured.")
    feedback += [p.missing_tip for p in missing]

    ownership_points, ownership_tip = _ownership(text)
    score += ownership_points
    if ownership_tip:
        feedback.append(ownership_tip)

    if NUMBER.search(text):
        score += 10
        feedback.append("Nice use of specifics — numbers make the result concrete and memorable.")
    else:
        feedback.append("Add one concrete detail — a number, timeframe or scale (tickets per week, time saved, "
                        "users affected) — if you have a true one.")

    length_points, length_tip = _length_score(words)
    score += length_points
    if length_tip:
        feedback.append(length_tip)

    fillers = FILLERS.findall(text)
    if len(fillers) >= 3:
        feedback.append(f"Watch filler words (used {len(fillers)} times). Pausing briefly sounds more confident.")
    else:
        score += 5

    return PracticeEntry(question=question.strip(), answer=text, feedback=feedback, score=max(0, min(100, score)),
                         created_at=utcnow())
