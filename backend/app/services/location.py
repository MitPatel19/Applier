"""Location parsing, normalization and matching.

Handles the free-form location strings job boards use ("Thunder Bay, ON", "Remote - Ontario",
"Canada (Remote)", "Toronto, Ontario, Canada") and answers the question "is this job somewhere
the user wants to work?" with a human-readable reason.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

CANADA = "Canada"
USA = "United States"

PROVINCES: dict[str, str] = {
    "ON": "Ontario",
    "QC": "Quebec",
    "BC": "British Columbia",
    "AB": "Alberta",
    "MB": "Manitoba",
    "SK": "Saskatchewan",
    "NS": "Nova Scotia",
    "NB": "New Brunswick",
    "NL": "Newfoundland and Labrador",
    "PE": "Prince Edward Island",
    "YT": "Yukon",
    "NT": "Northwest Territories",
    "NU": "Nunavut",
}

US_STATES: dict[str, str] = {
    "CA": "California",
    "NY": "New York",
    "WA": "Washington",
    "TX": "Texas",
    "MA": "Massachusetts",
    "IL": "Illinois",
    "MI": "Michigan",
    "MN": "Minnesota",
    "FL": "Florida",
    "CO": "Colorado",
    "OR": "Oregon",
    "GA": "Georgia",
    "PA": "Pennsylvania",
    "NJ": "New Jersey",
    "VA": "Virginia",
    "NC": "North Carolina",
    "OH": "Ohio",
    "AZ": "Arizona",
    "UT": "Utah",
    "WI": "Wisconsin",
}

# Well-known cities -> (display name, province/state code, country)
CITIES: dict[str, tuple[str, str, str]] = {
    "thunder bay": ("Thunder Bay", "ON", CANADA),
    "toronto": ("Toronto", "ON", CANADA),
    "waterloo": ("Waterloo", "ON", CANADA),
    "kitchener": ("Kitchener", "ON", CANADA),
    "ottawa": ("Ottawa", "ON", CANADA),
    "mississauga": ("Mississauga", "ON", CANADA),
    "markham": ("Markham", "ON", CANADA),
    "hamilton": ("Hamilton", "ON", CANADA),
    "london": ("London", "ON", CANADA),
    "guelph": ("Guelph", "ON", CANADA),
    "burlington": ("Burlington", "ON", CANADA),
    "sudbury": ("Sudbury", "ON", CANADA),
    "greater sudbury": ("Sudbury", "ON", CANADA),
    "sault ste. marie": ("Sault Ste. Marie", "ON", CANADA),
    "sault ste marie": ("Sault Ste. Marie", "ON", CANADA),
    "kenora": ("Kenora", "ON", CANADA),
    "kingston": ("Kingston", "ON", CANADA),
    "windsor": ("Windsor", "ON", CANADA),
    "barrie": ("Barrie", "ON", CANADA),
    "winnipeg": ("Winnipeg", "MB", CANADA),
    "vancouver": ("Vancouver", "BC", CANADA),
    "victoria": ("Victoria", "BC", CANADA),
    "burnaby": ("Burnaby", "BC", CANADA),
    "calgary": ("Calgary", "AB", CANADA),
    "edmonton": ("Edmonton", "AB", CANADA),
    "regina": ("Regina", "SK", CANADA),
    "saskatoon": ("Saskatoon", "SK", CANADA),
    "montreal": ("Montreal", "QC", CANADA),
    "montréal": ("Montreal", "QC", CANADA),
    "quebec city": ("Quebec City", "QC", CANADA),
    "halifax": ("Halifax", "NS", CANADA),
    "fredericton": ("Fredericton", "NB", CANADA),
    "moncton": ("Moncton", "NB", CANADA),
    "st. john's": ("St. John's", "NL", CANADA),
    "charlottetown": ("Charlottetown", "PE", CANADA),
    "whitehorse": ("Whitehorse", "YT", CANADA),
    "yellowknife": ("Yellowknife", "NT", CANADA),
    "iqaluit": ("Iqaluit", "NU", CANADA),
    "seattle": ("Seattle", "WA", USA),
    "new york": ("New York", "NY", USA),
    "san francisco": ("San Francisco", "CA", USA),
    "austin": ("Austin", "TX", USA),
    "boston": ("Boston", "MA", USA),
    "chicago": ("Chicago", "IL", USA),
    "minneapolis": ("Minneapolis", "MN", USA),
    "duluth": ("Duluth", "MN", USA),
    "detroit": ("Detroit", "MI", USA),
    "denver": ("Denver", "CO", USA),
}

COUNTRIES: dict[str, str] = {
    "canada": CANADA,
    "ca": CANADA,
    "can": CANADA,
    "united states": USA,
    "united states of america": USA,
    "usa": USA,
    "us": USA,
    "u.s.": USA,
    "u.s.a.": USA,
    "america": USA,
    "united kingdom": "United Kingdom",
    "uk": "United Kingdom",
    "north america": "North America",
}

_REMOTE_RE = re.compile(r"\b(remote|work from home|wfh|telecommute|anywhere|distributed)\b", re.IGNORECASE)
_HYBRID_RE = re.compile(r"\bhybrid\b", re.IGNORECASE)
_NOISE_RE = re.compile(r"\b(hybrid|on-?site|in[- ]office|in[- ]person|first|only|based|friendly|position|role)\b",
                       re.IGNORECASE)
_SPLIT_RE = re.compile(r"\s*(?:,|;|\||/|\(|\)|\s[-–—]\s|^[-–—]\s|\s[-–—]$|:)\s*")


@dataclass
class ParsedLocation:
    raw: str
    city: str | None = None
    province: str | None = None  # province/state code, e.g. "ON"
    country: str | None = None
    is_remote: bool = False
    is_hybrid: bool = False

    @property
    def province_name(self) -> str | None:
        if not self.province:
            return None
        return PROVINCES.get(self.province) or US_STATES.get(self.province) or self.province

    @property
    def region(self) -> str | None:
        """Most specific non-city region: a province/state name or country."""
        return self.province_name or self.country

    def label(self) -> str:
        """Canonical display label, e.g. "Thunder Bay, ON", "Ontario", "Remote — Canada"."""
        if self.city:
            place = f"{self.city}, {self.province}" if self.province else self.city
        else:
            place = self.province_name or self.country or ""
        if self.is_remote:
            return f"Remote — {place}" if place else "Remote"
        return place

    def as_fields(self) -> dict[str, Any]:
        return {"city": self.city, "province": self.province, "country": self.country}


def _match_region(part: str) -> tuple[str | None, str | None]:
    """Return (province_code, country) for a province/state/country token, else (None, None)."""
    token = part.strip().strip(".")
    low = token.lower()
    upper = token.upper()
    if upper in PROVINCES and (token.isupper() or len(token) == 2):
        return upper, CANADA
    for code, name in PROVINCES.items():
        if low == name.lower() or (code == "QC" and low in {"québec", "quebec province"}):
            return code, CANADA
    if low in COUNTRIES:
        # "CA" alone most often means Canada on Canadian boards; after a US city it's California (handled by caller).
        return None, COUNTRIES[low]
    if upper in US_STATES and token.isupper():
        return upper, USA
    for code, name in US_STATES.items():
        if low == name.lower():
            return code, USA
    return None, None


def parse_location(text: str | None) -> ParsedLocation:
    """Parse a free-form location string into city / province / country / remote parts."""
    raw = (text or "").strip()
    loc = ParsedLocation(raw=raw)
    if not raw:
        return loc
    loc.is_remote = bool(_REMOTE_RE.search(raw))
    loc.is_hybrid = bool(_HYBRID_RE.search(raw))
    cleaned = _REMOTE_RE.sub(" ", raw)
    cleaned = _NOISE_RE.sub(" ", cleaned)
    parts = [p.strip(" .-–—") for p in _SPLIT_RE.split(cleaned) if p and p.strip(" .-–—")]
    for part in parts:
        low = part.lower()
        if low in CITIES and not loc.city:
            city, prov, country = CITIES[low]
            loc.city, loc.province, loc.country = city, loc.province or prov, loc.country or country
            continue
        if part.upper() == "CA" and loc.country == USA:  # "San Francisco, CA" is California
            loc.province = loc.province or "CA"
            continue
        prov, country = _match_region(part)
        if prov or country:
            loc.province = loc.province or prov
            loc.country = loc.country or country
            continue
        if not loc.city and not loc.province and re.fullmatch(r"[A-Za-zÀ-ÿ .'’-]{2,60}", part):
            loc.city = " ".join(w.capitalize() if w.islower() else w for w in part.split())
    if loc.province and not loc.country:
        loc.country = CANADA if loc.province in PROVINCES else USA if loc.province in US_STATES else None
    return loc


def normalize_location(text: str | None) -> str:
    """Canonical label for a location string ("" when empty)."""
    parsed = parse_location(text)
    if parsed.city or parsed.province or parsed.country or parsed.is_remote:
        return parsed.label()
    return (text or "").strip()


def _region_contains(region: ParsedLocation, place: ParsedLocation) -> bool:
    """True when ``place`` lies inside ``region`` (a country, province or city)."""
    if region.city:
        return bool(place.city) and place.city.lower() == region.city.lower() and (
            not region.province or not place.province or region.province == place.province)
    if region.province:
        return place.province == region.province
    if region.country:
        return place.country == region.country
    return False


def _remote_region_covers(region: ParsedLocation, job: ParsedLocation) -> bool:
    """A remote job open to ``job``'s scope satisfies the user's remote ``region``."""
    if region.province:
        # A province-specific preference is met by that province, or by a country-wide remote role.
        return job.province == region.province or (not job.province and job.country == region.country)
    return region.country == job.country


def location_matches(job_fields: dict[str, Any], target_locations: list[str],
                     remote_regions: list[str] | None = None) -> tuple[bool, str]:
    """Decide whether a job's location fits the user's targets.

    ``job_fields`` carries ``location``/``city``/``province``/``country``/``work_arrangement``.
    Remote jobs match when they are open to one of ``remote_regions`` or to a region containing
    one of the target locations (you can work remotely from Thunder Bay for a Canada-wide role).
    Returns ``(matches, reason)``.
    """
    remote_regions = remote_regions or []
    targets = [parse_location(t) for t in target_locations if t and t.strip()]
    remote_targets = [parse_location(r) for r in remote_regions if r and r.strip()]
    # Targets written like "Remote Canada" are remote regions, not physical places.
    remote_targets += [t for t in targets if t.is_remote]
    targets = [t for t in targets if not t.is_remote]
    if not targets and not remote_targets:
        return True, "No location preference set"

    parsed = parse_location(job_fields.get("location"))
    job = ParsedLocation(
        raw=parsed.raw,
        city=job_fields.get("city") or parsed.city,
        province=job_fields.get("province") or parsed.province,
        country=job_fields.get("country") or parsed.country,
        is_remote=(job_fields.get("work_arrangement") == "remote") or parsed.is_remote,
    )
    if job.province and not job.country:
        job.country = CANADA if job.province in PROVINCES else USA if job.province in US_STATES else None
    wanted = ", ".join([t.label() for t in targets] + [f"remote in {r.region or 'any region'}" for r in remote_targets])

    if job.is_remote:
        scope = job.province_name or job.country
        for region in remote_targets:
            if not region.region or not scope:
                return True, f"Remote role{f' open to {scope}' if scope else ''} — matches your remote preference"
            if _remote_region_covers(region, job):
                return True, f"Remote role open to {scope} — matches your remote preference ({region.region})"
        for target in targets:
            if not scope or _region_contains(job, target):
                where = f" open to {scope}" if scope else ""
                return True, f"Remote role{where} — you can work from {target.label()}"
        return False, f"Remote role limited to {scope}, outside your target locations ({wanted})"

    if not (job.city or job.province or job.country):
        return True, "Location not specified in the posting"
    for target in targets:
        if _region_contains(target, job):
            if target.city:
                return True, f"In {job.label()} — one of your target locations"
            return True, f"{job.label()} is in {target.label()}, one of your target locations"
    return False, f"{job.label()} is outside your target locations ({wanted})"


def region_country(name: str | None) -> str | None:
    """Country that a location/region string belongs to (e.g. "Ontario" -> "Canada")."""
    return parse_location(name).country if name else None
