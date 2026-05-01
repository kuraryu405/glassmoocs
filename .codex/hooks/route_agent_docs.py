#!/usr/bin/env python3
"""Route Codex prompts to the smallest useful set of agent docs."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


DOCS = {
    "docs/agent/architecture.md": {
        "label": "全体構造、主要関数、共通実装ルール、資料抽出 UI",
        "patterns": [
            r"\barchitecture\b",
            r"\bcontent(?:\.js)?\b",
            r"\bbackground(?:\.js)?\b",
            r"\bpopup(?:\.js)?\b",
            r"\boptions?\b",
            r"\bmanifest\b",
            r"\bDOM\b",
            r"資料",
            r"抽出",
            r"ページ内",
            r"UI",
            r"設定",
            r"構造",
            r"主要関数",
        ],
    },
    "docs/agent/messages.md": {
        "label": "runtime message / tabs.sendMessage / glassmoocs:* type",
        "patterns": [
            r"\bmessage\b",
            r"\bruntime\.sendMessage\b",
            r"\btabs\.sendMessage\b",
            r"\bMESSAGE_TYPES\b",
            r"glassmoocs:",
            r"メッセージ",
            r"sendMessage",
        ],
    },
    "docs/agent/download-state.md": {
        "label": "storage schema、DownloadState、queue、復旧",
        "patterns": [
            r"\bstorage\b",
            r"\bDownloadState\b",
            r"\bDownloadEntry\b",
            r"\bSummarizedEntry\b",
            r"\bdownload[- ]state\b",
            r"\bqueueDownloads\b",
            r"\bqueue\b",
            r"\brecoverStaleState\b",
            r"ダウンロード状態",
            r"状態",
            r"キュー",
            r"復旧",
            r"蓄積",
        ],
    },
    "docs/agent/slides-flow.md": {
        "label": "Google Slides、viewer URL、SVG export、PDF 化、capture fallback",
        "patterns": [
            r"\bslides?\b",
            r"\bGoogle Slides\b",
            r"\bdocs\.google\.com\b",
            r"\bPDF\b",
            r"\bSVG\b",
            r"\bcaptureVisibleTab\b",
            r"\babout:blank\b",
            r"\bbuildSlidesViewerUrl\b",
            r"/embed\b",
            r"/present\b",
            r"/pub\b",
            r"スライド",
            r"PDF化",
            r"キャプチャ",
        ],
    },
    "docs/agent/debugging.md": {
        "label": "構造化ログ、仮説 ID、再現手順、ブラウザ別ログ確認",
        "patterns": [
            r"\bdebug\b",
            r"\blog\b",
            r"\blogs\b",
            r"\bconsole\.log\b",
            r"\b7442\b",
            r"\b7443\b",
            r"\bhypothesis\b",
            r"\brepro\b",
            r"デバッグ",
            r"ログ",
            r"仮説",
            r"再現",
            r"調査",
        ],
    },
    "docs/agent/ci-release.md": {
        "label": "CI、release/dev build、dist/firefox、dist/chromium",
        "patterns": [
            r"\bCI\b",
            r"\bbuild\b",
            r"\brelease\b",
            r"\bdev build\b",
            r"\bdist/chromium\b",
            r"\bdist/firefox\b",
            r"\bchromium\b",
            r"\bfirefox\b",
            r"\bamo\b",
            r"\bpnpm\b",
            r"\bcorepack\b",
            r"ビルド",
            r"リリース",
        ],
    },
    "docs/agent/pr-rules.md": {
        "label": "PR 分割、コミット粒度、未コミット差分",
        "patterns": [
            r"\bPR\b",
            r"\bpull request\b",
            r"\bcommit\b",
            r"\bbranch\b",
            r"\breview\b",
            r"\bgit\b",
            r"コミット",
            r"差分",
            r"未コミット",
            r"粒度",
            r"レビュー",
        ],
    },
}


def read_prompt() -> str:
    raw = sys.stdin.read()
    if not raw.strip():
        return ""

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return raw

    if isinstance(payload, dict):
        prompt = payload.get("prompt")
        if isinstance(prompt, str):
            return prompt
    return raw


def route_docs(prompt: str, root: Path) -> list[str]:
    selected: list[str] = []
    for doc_path, meta in DOCS.items():
        if not (root / doc_path).is_file():
            continue
        for pattern in meta["patterns"]:
            if re.search(pattern, prompt, flags=re.IGNORECASE):
                selected.append(doc_path)
                break
    return selected


def build_context(selected: list[str]) -> str:
    lines = [
        "Glass MOOCs agent docs routing:",
        "今回の依頼では、AGENTS.md と HANDOFF.md を入口にしたうえで、必要な詳細文書だけ追加で確認してください。",
        "",
    ]

    for doc_path in selected:
        lines.append(f"- `{doc_path}`: {DOCS[doc_path]['label']}")

    lines.extend(
        [
            "",
            "上記以外の `docs/agent/*.md` は、作業中に必要だと判断した時だけ読んでください。",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    prompt = read_prompt()
    root = Path(__file__).resolve().parents[2]
    selected = route_docs(prompt, root)

    if not selected:
        return 0

    output = {
        "continue": True,
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": build_context(selected),
        },
    }
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
