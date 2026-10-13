"""Build a 剪映 (JianYing) draft for the AIOS promo film: Remotion picture + narrated voice track.

The cue table comes from src/timeline.json — the same single source `npm run srt` exports — so the
voice track cannot drift from the burned-in captions. No subtitle track is created on purpose: the
hard subtitles are already rendered into the mp4, and a second set would double up on screen.

Usage (from video/):
    JY_SKILL_ROOT=<jianying-editor skill root> python scripts/jianying_draft.py [--dry-run]
"""

import argparse
import json
import os
import sys

if hasattr(sys.stdout, "reconfigure"):  # Windows console defaults to cp936 and mangles the cue text
    sys.stdout.reconfigure(encoding="utf-8")

VIDEO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DRAFT = "AIOS_promo_45s_narrated"
DEFAULT_SPEAKER = "zh_male_huoli"


def resolve_skill_root():
    candidates = [os.environ.get("JY_SKILL_ROOT", "")]
    home = os.path.expanduser("~")
    candidates.append(os.path.join(home, ".qoder-cn", "skills", "jianying-editor"))
    candidates.append(os.path.join(home, ".claude", "skills", "jianying-editor"))
    for path in candidates:
        if path and os.path.exists(os.path.join(path, "scripts", "jy_wrapper.py")):
            return os.path.abspath(path)
    raise SystemExit(
        "jianying-editor skill not found; set JY_SKILL_ROOT to its directory "
        f"(tried: {', '.join(c for c in candidates if c)})"
    )


def load_cues():
    with open(os.path.join(VIDEO_ROOT, "src", "timeline.json"), encoding="utf-8") as handle:
        timeline = json.load(handle)
    fps = timeline["fps"]
    cues = []
    offset = 0
    for scene in timeline["scenes"]:
        for caption in scene["captions"]:
            cues.append(
                {
                    "scene": scene["id"],
                    "start": (offset + caption["from"]) / fps,
                    "window": (caption["to"] - caption["from"]) / fps,
                    "text": caption["text"],
                }
            )
        offset += scene["frames"]
    return cues, timeline, offset / fps


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--draft", default=DEFAULT_DRAFT, help="剪映 draft project name")
    parser.add_argument(
        "--speaker",
        default=DEFAULT_SPEAKER,
        help="voice name; 剪映's own cloud TTS is tried first, edge-tts is the fallback",
    )
    parser.add_argument(
        "--mp4",
        default=os.path.join(VIDEO_ROOT, "out", "aios-promo.mp4"),
        help="picture track source (the Remotion render)",
    )
    parser.add_argument("--dry-run", action="store_true", help="print the cue table, synthesize nothing")
    args = parser.parse_args()

    cues, timeline, film_seconds = load_cues()

    print(f"timeline: {len(cues)} cues / {film_seconds:.2f}s @ {timeline['fps']}fps")
    for cue in cues:
        print(f"  {cue['start']:6.2f}s  [{cue['scene']:>6}]  {cue['text']}")
    if args.dry_run:
        return 0

    if not os.path.exists(args.mp4):
        raise SystemExit(f"picture source missing: {args.mp4}")

    skill_root = resolve_skill_root()
    sys.path.insert(0, os.path.join(skill_root, "scripts"))
    from jy_wrapper import JyProject

    # The skill probes media with ffprobe; the repo ships one inside the Remotion compositor.
    compositor_bin = os.path.join(VIDEO_ROOT, "node_modules", "@remotion", "compositor-win32-x64-msvc")
    if os.path.isdir(compositor_bin):
        os.environ["PATH"] = compositor_bin + os.pathsep + os.environ.get("PATH", "")

    project = JyProject(
        args.draft,
        width=timeline["width"],
        height=timeline["height"],
        overwrite=True,
    )
    # add_media_safe() would run its normalizer, which is hardcoded to scale/pad onto 1920x1080 and
    # would letterbox this 9:16 film. Staging + _add_video_safe is the same path without that step.
    staged = project._stage_local_asset(os.path.abspath(args.mp4))
    if project._add_video_safe(staged, 0, None, "Video") is None:
        raise SystemExit(f"picture import failed: {args.mp4}")

    failures = []
    for index, cue in enumerate(cues, start=1):
        # 「」 are caption punctuation; read aloud they turn into pauses the voice does not take.
        spoken = cue["text"].replace("「", "").replace("」", "")
        segment = project.add_tts_intelligent(
            spoken,
            speaker=args.speaker,
            start_time=cue["start"],
            track_name="VoiceOver",
        )
        if segment is None:
            failures.append(f"cue {index} ({cue['scene']} @ {cue['start']:.2f}s): {cue['text']}")
            print(f"  ✗ {index:2d}/{len(cues)} {cue['text']}")
        else:
            print(f"  ✓ {index:2d}/{len(cues)} {cue['start']:6.2f}s  {cue['text']}")

    if failures:
        print("\n配音合成失败：")
        for line in failures:
            print(f"  {line}")
        raise SystemExit(1)

    result = project.save()
    print(f"\n✔ draft saved: {result['draft_path']}")
    print("  打开剪映（需重启才会刷新草稿列表）→ 检查 → 手动导出。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
