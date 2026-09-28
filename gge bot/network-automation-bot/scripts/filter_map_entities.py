import json
from pathlib import Path

# Change this to your source JSON filename
SOURCE_FILE = Path(__file__).parent / "../data/entities.json"

# Output will be created in the SAME folder
OUTPUT_FILE = SOURCE_FILE.parent / "../../../public/data/map-entities.json"

# Entity names we want to keep
ALLOWED_NAMES = {
    "dragon",
    "fortress",
    "ice fortress",
}


def extract_map_entities():
    # Load original JSON
    with SOURCE_FILE.open("r", encoding="utf-8") as f:
        data = json.load(f)

    filtered = {}

    for key, info in data.items():
        # Example:
        # "1:fortress:1004:263"
        # "3:dragon:341:341"
        # "2:ice fortress:1004:1004"

        parts = key.split(":")

        if len(parts) < 4:
            continue

        entity_name = parts[1].strip().lower()

        if entity_name in ALLOWED_NAMES:
            filtered[key] = info

    # Save filtered entities
    with OUTPUT_FILE.open("w", encoding="utf-8") as f:
        json.dump(filtered, f, indent=2, ensure_ascii=False)

    print(f"Found {len(filtered)} matching entities.")
    print(f"Saved to: {OUTPUT_FILE}")


if __name__ == "__main__":
    extract_map_entities()