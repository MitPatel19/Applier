"""Minimal RFC 5545 iCalendar export for interviews."""

from __future__ import annotations

from datetime import datetime, timedelta

from app.models import Interview, utcnow

KIND_LABELS = {
    "phone_screen": "Phone screen",
    "recruiter": "Recruiter interview",
    "technical": "Technical interview",
    "behavioral": "Behavioral interview",
    "onsite": "On-site interview",
    "final": "Final interview",
    "other": "Interview",
}


def _escape(text: str) -> str:
    return (text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
            .replace("\r\n", "\\n").replace("\n", "\\n"))


def _fold(line: str) -> str:
    """Fold lines longer than 75 octets (RFC 5545 §3.1)."""
    encoded = line.encode()
    if len(encoded) <= 75:
        return line
    parts: list[str] = []
    current = b""
    for ch in line:
        b = ch.encode()
        if len(current) + len(b) > (75 if not parts else 74):
            parts.append(current.decode())
            current = b""
        current += b
    parts.append(current.decode())
    return "\r\n ".join(parts)


def _stamp(value: datetime) -> str:
    return value.strftime("%Y%m%dT%H%M%SZ")


def interview_ics(interview: Interview, *, domain: str = "applier.app") -> str:
    """Calendar file for a scheduled interview (times are UTC)."""
    assert interview.scheduled_at is not None
    app = interview.application
    kind = KIND_LABELS.get(interview.kind, "Interview")
    start = interview.scheduled_at
    end = start + timedelta(minutes=interview.duration_minutes or 60)
    description = [f"{kind} for {app.job_title} at {app.company_name}."]
    if interview.interviewers:
        description.append("Interviewers: " + ", ".join(interview.interviewers))
    if interview.meeting_url:
        description.append(f"Join: {interview.meeting_url}")
    if interview.notes:
        description.append(f"Notes: {interview.notes}")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Applier//Interview Calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:interview-{interview.id}@{domain}",
        f"DTSTAMP:{_stamp(utcnow())}",
        f"DTSTART:{_stamp(start)}",
        f"DTEND:{_stamp(end)}",
        f"SUMMARY:{_escape(f'{kind}: {app.job_title} at {app.company_name}')}",
        f"DESCRIPTION:{_escape(chr(10).join(description))}",
    ]
    location = interview.location or interview.meeting_url
    if location:
        lines.append(f"LOCATION:{_escape(location)}")
    if interview.meeting_url:
        lines.append(f"URL:{interview.meeting_url}")
    lines += [
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "DESCRIPTION:Interview reminder",
        "TRIGGER:-PT30M",
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(_fold(line) for line in lines) + "\r\n"
