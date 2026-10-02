import asyncio
import json
import re
from pathlib import Path

import edge_tts


PROJECT_ROOT = Path(__file__).resolve().parent.parent

MANIFEST_FILE = PROJECT_ROOT / "public" / "data" / "manifest.json"
OUTPUT_DIR = PROJECT_ROOT / "public" / "audio" / "fa"

VOICE = "fa-IR-DilaraNeural"


def load_json_file(path: Path):
    text = path.read_text(encoding="utf-8").strip()

    # Support JSON wrapped in Markdown code fences
    if text.startswith("```"):
        lines = text.splitlines()

        if lines[0].startswith("```"):
            lines = lines[1:]

        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]

        text = "\n".join(lines)

    return json.loads(text)


def normalize_filename(text: str) -> str:
    text = text.strip().lower()

    text = re.sub(r"\s+", "-", text)

    text = re.sub(
        r'[<>:"/\\|?*]',
        "",
        text,
    )

    text = re.sub(
        r"-+",
        "-",
        text,
    )

    return text.strip("-")


async def generate_audio(
        text: str,
        output_file: Path,
):
    communicate = edge_tts.Communicate(
        text=text,
        voice=VOICE,
    )

    await communicate.save(str(output_file))


async def main():

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    manifest = load_json_file(
        MANIFEST_FILE
    )

    total = 0
    generated = 0
    skipped = 0
    failed = 0

    for course in manifest.get("courses", []):

        course_id = course.get("id")
        course_title = course.get("title")

        print()
        print("=" * 60)
        print(f"Course: {course_title}")
        print(f"ID: {course_id}")
        print("=" * 60)

        for lesson in course.get("lessons", []):

            lesson_id = lesson.get("id")
            relative_file = lesson.get("file")

            if not relative_file:
                continue

            json_file = (
                    MANIFEST_FILE.parent / relative_file
            ).resolve()

            if not json_file.exists():

                print(
                    f"[MISSING] {json_file}"
                )

                continue

            try:

                words = load_json_file(
                    json_file
                )

            except Exception as e:

                print(
                    f"[ERROR] {json_file}: {e}"
                )

                continue

            for item in words:

                if not isinstance(item, dict):
                    continue

                word = item.get("word")
                meaning = item.get("meaning")

                if not word or not meaning:
                    continue

                filename = normalize_filename(
                    word
                )

                if not filename:
                    continue

                output_file = (
                        OUTPUT_DIR /
                        f"{filename}.mp3"
                )

                total += 1

                # Resume-safe
                if output_file.exists():

                    skipped += 1

                    print(
                        f"[SKIP] {word}"
                    )

                    continue

                try:

                    await generate_audio(
                        meaning,
                        output_file,
                    )

                    generated += 1

                    print(
                        f"[OK] {word} -> {meaning}"
                    )

                except Exception as e:

                    failed += 1

                    print(
                        f"[FAILED] {word}: {e}"
                    )

    print()
    print("=" * 60)
    print("Finished")
    print("=" * 60)

    print(f"Total:     {total}")
    print(f"Generated: {generated}")
    print(f"Skipped:   {skipped}")
    print(f"Failed:    {failed}")


if __name__ == "__main__":
    asyncio.run(main())