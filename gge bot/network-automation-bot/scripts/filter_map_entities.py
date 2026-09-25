"""Filter data/entities.json down to the rows the website tracker needs.

The raw scan dump is dominated by "tower" rows (tens of thousands) that the
website ignores. This keeps only dragon/fortress/ice fortress rows and writes
them to the frontend's public/ folder so the site can fetch a small JSON file
at runtime instead of bundling the entire raw dump. Run this after the bot
updates data/entities.json, before publishing the site.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE_PATH = ROOT / "data" / "entities.json"
REPO_ROOT = ROOT.parent.parent
OUTPUT_PATH = REPO_ROOT / "public" / "data" / "map-entities.json"

TRACKED_KINDS = {"fortress", "dragon", "ice fortress"}


def main() -> None:
    entities = json.loads(SOURCE_PATH.read_text(encoding="utf-8"))
    filtered = {key: value for key, value in entities.items() if value.get("kind") in TRACKED_KINDS}

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(filtered, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(filtered)} of {len(entities)} entities to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
