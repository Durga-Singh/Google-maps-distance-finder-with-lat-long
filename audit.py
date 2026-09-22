#!/usr/bin/env python3
"""
Branch Pin Audit
-----------------
Compares branch lat/long values from a spreadsheet (e.g. exported from an
internal system) against the coordinates Google currently has for that
listing (via the Places API), flags branches whose pin has drifted beyond
a configurable threshold, and writes a report with a ready-to-click Google
Maps link for each flagged branch.

Usage:
    python audit.py --input branches.xlsx --output report.xlsx --threshold 20

Input file requirements (CSV or XLSX):
    Required columns:
        branch_code   - unique branch identifier
        branch_name   - branch name (used in the search query)
        excel_lat     - latitude from your source of truth
        excel_long    - longitude from your source of truth
    Optional columns (improve match accuracy — include at least one):
        address       - full/partial address, appended to the search query
        place_id      - a known Google Place ID (skips the text search,
                         goes straight to Place Details — most reliable)

Output file adds:
        current_lat, current_lng  - what Google has right now
        distance_m                - distance between excel and current pin
        status                    - "OK" or "NEEDS CORRECTION"
        maps_link                 - google.com/maps?q=<excel lat,long> for
                                     flagged rows, so the field team can
                                     open it and drag the pin to match
        match_confidence          - "place_id" / "text_search" / "not_found"

Requires a Google Maps Platform API key with the Places API enabled.
Set it as an environment variable (GOOGLE_MAPS_API_KEY) or pass --api-key.
See README.md for setup and quota/cost notes.
"""

import argparse
import math
import os
import sys
import time

import pandas as pd
import requests
from dotenv import load_dotenv

PLACES_FIND_PLACE_URL = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json"
PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"

REQUIRED_COLUMNS = ["branch_code", "branch_name", "excel_lat", "excel_long"]


def haversine_m(lat1, lon1, lat2, lon2):
    """Great-circle distance between two lat/long points, in meters."""
    r = 6371000  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return 2 * r * math.asin(math.sqrt(a))


def load_input(path: str) -> pd.DataFrame:
    if path.lower().endswith((".xlsx", ".xls")):
        df = pd.read_excel(path)
    else:
        df = pd.read_csv(path)

    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        sys.exit(
            f"Input file is missing required column(s): {missing}\n"
            f"Found columns: {list(df.columns)}"
        )

    if "address" not in df.columns:
        df["address"] = ""
    if "place_id" not in df.columns:
        df["place_id"] = ""

    return df


def get_coords_from_place_id(place_id: str, api_key: str, session: requests.Session):
    params = {"place_id": place_id, "fields": "geometry", "key": api_key}
    resp = session.get(PLACES_DETAILS_URL, params=params, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    if data.get("status") != "OK":
        return None
    loc = data["result"]["geometry"]["location"]
    return loc["lat"], loc["lng"]


def get_coords_from_text_search(query: str, api_key: str, session: requests.Session):
    params = {
        "input": query,
        "inputtype": "textquery",
        "fields": "geometry,place_id",
        "key": api_key,
    }
    resp = session.get(PLACES_FIND_PLACE_URL, params=params, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    if data.get("status") != "OK" or not data.get("candidates"):
        return None
    loc = data["candidates"][0]["geometry"]["location"]
    return loc["lat"], loc["lng"]


def audit_row(row, api_key, session, request_delay):
    branch_code = row["branch_code"]
    branch_name = row["branch_name"]
    address = str(row.get("address") or "").strip()
    place_id = str(row.get("place_id") or "").strip()

    coords = None
    confidence = "not_found"

    try:
        if place_id:
            coords = get_coords_from_place_id(place_id, api_key, session)
            if coords:
                confidence = "place_id"

        if coords is None:
            query = f"{branch_name} {address}".strip()
            coords = get_coords_from_text_search(query, api_key, session)
            if coords:
                confidence = "text_search"
    except requests.RequestException as exc:
        print(f"  [warn] {branch_code}: request failed ({exc})", file=sys.stderr)

    time.sleep(request_delay)  # be polite to the API / stay under QPS limits

    if coords is None:
        return pd.Series(
            {
                "current_lat": None,
                "current_lng": None,
                "distance_m": None,
                "status": "NOT FOUND",
                "maps_link": "",
                "match_confidence": confidence,
            }
        )

    current_lat, current_lng = coords
    distance = haversine_m(
        row["excel_lat"], row["excel_long"], current_lat, current_lng
    )

    return pd.Series(
        {
            "current_lat": current_lat,
            "current_lng": current_lng,
            "distance_m": round(distance, 2),
            "status": "PENDING",  # filled in after threshold is applied
            "maps_link": f"https://www.google.com/maps?q={row['excel_lat']},{row['excel_long']}",
            "match_confidence": confidence,
        }
    )


def main():
    parser = argparse.ArgumentParser(description="Audit branch pin locations against Google Maps.")
    parser.add_argument("--input", required=True, help="Path to input CSV/XLSX file.")
    parser.add_argument("--output", required=True, help="Path to write the report (CSV or XLSX).")
    parser.add_argument(
        "--threshold",
        type=float,
        default=20.0,
        help="Distance in meters beyond which a branch is flagged (default: 20).",
    )
    parser.add_argument(
        "--api-key",
        default=None,
        help="Google Maps API key. Defaults to GOOGLE_MAPS_API_KEY env var / .env file.",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.05,
        help="Seconds to wait between API calls (default: 0.05).",
    )
    args = parser.parse_args()

    load_dotenv()
    api_key = args.api_key or os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key:
        sys.exit(
            "No API key found. Pass --api-key or set GOOGLE_MAPS_API_KEY "
            "(e.g. in a .env file — see .env.example)."
        )

    df = load_input(args.input)
    print(f"Loaded {len(df)} branches from {args.input}")

    session = requests.Session()
    results = []
    for i, row in df.iterrows():
        print(f"[{i + 1}/{len(df)}] {row['branch_code']} – {row['branch_name']}")
        results.append(audit_row(row, api_key, session, args.delay))

    result_df = pd.concat([df.reset_index(drop=True), pd.DataFrame(results)], axis=1)

    def final_status(r):
        if r["match_confidence"] == "not_found":
            return "NOT FOUND"
        if r["distance_m"] > args.threshold:
            return "NEEDS CORRECTION"
        return "OK"

    result_df["status"] = result_df.apply(final_status, axis=1)
    result_df.loc[result_df["status"] != "NEEDS CORRECTION", "maps_link"] = ""

    if args.output.lower().endswith((".xlsx", ".xls")):
        result_df.to_excel(args.output, index=False)
    else:
        result_df.to_csv(args.output, index=False)

    flagged = (result_df["status"] == "NEEDS CORRECTION").sum()
    not_found = (result_df["status"] == "NOT FOUND").sum()
    print(
        f"\nDone. {flagged} branch(es) need correction, "
        f"{not_found} not found, report saved to {args.output}"
    )


if __name__ == "__main__":
    main()
