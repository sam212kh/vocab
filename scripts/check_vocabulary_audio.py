import json
import re
from pathlib import Path

from google.cloud import texttospeech


PROJECT_ROOT = Path(__file__).resolve().parent.parent

MANIFEST_FILE = PROJECT_ROOT / "public" / "data" / "manifest.json"
OUTPUT_DIR = PROJECT_ROOT / "public" / "audio" / "fa"

VOICE_NAME = "fa-IR-Standard-A"
LANGUAGE_CODE = "fa-IR"


def load_json_file(path: Path):
    text = path.read_text(encoding="utf-8").strip()

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
        text
    )

    text = re.sub(
        r"-+",
        "-",
        text
    )

    return text.strip("-")


def generate_audio(
        client: texttospeech.TextToSpeechClient,
        text: str,
        output_file: Path,
):
    synthesis_input = texttospeech.SynthesisInput(
        text=text
    )

    voice = texttospeech.VoiceSelectionParams(
        language_code=LANGUAGE_CODE,
        name=VOICE_NAME,
    )

    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
    )

    response = client.synthesize_speech(
        input=synthesis_input,
        voice=voice,
        audio_config=audio_config,
    )

    output_file.write_bytes(response.audio_content)


def main():
    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    manifest = load_json_file(MANIFEST_FILE)

    client = texttospeech.TextToSpeechClient()

    total = 0
    generated = 0
    skipped = 0
    failed = 0

    for course in manifest.get("courses", []):

        course_id = course.get("id")

        print()
        print("=" * 60)
        print(f"Course: {course.get('title')}")
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
                words = load_json_file(json_file)
            except Exception as e:
                print(
                    f"[ERROR] {json_file}: {e}"
                )
                continue

            for item in words:

                if not isinstance(item, dict):
                    continue

                word = item.get("word")

                if not word:
                    continue

                meaning = item.get("meaning")

                if not meaning:
                    continue

                filename = normalize_filename(word)

                if not filename:
                    continue

                output_file = (
                        OUTPUT_DIR /
                        f"{filename}.mp3"
                )

                total += 1

                if output_file.exists():
                    skipped += 1

                    print(
                        f"[SKIP] {word}"
                    )

                    continue

                try:

                    generate_audio(
                        client,
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
    main()