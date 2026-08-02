"""
インメモリのデータストア(声紋・章)と、state.jsonへの永続化。

プロトタイプ用の簡易実装。本番ではDBに置き換える前提。
"""

import json

from config import STATE_PATH, logger

voice_profiles_db: dict = {}   # id -> dict
chapters_db: dict = {}         # id -> dict


def save_state() -> None:
    tmp = STATE_PATH.with_suffix(".json.tmp")
    tmp.write_text(
        json.dumps({"voice_profiles": voice_profiles_db, "chapters": chapters_db}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    tmp.replace(STATE_PATH)


def load_state() -> None:
    if not STATE_PATH.exists():
        return
    try:
        state = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except Exception:
        logger.exception("state.jsonの読み込みに失敗したため、空の状態で起動します")
        return
    voice_profiles_db.update(state.get("voice_profiles", {}))
    chapters_db.update(state.get("chapters", {}))
    # 前回実行中に中断された処理は失敗扱いにする(UIのスピナーが永久に回るのを防ぐ)
    for chapter in chapters_db.values():
        for key in ("draft_status", "final_status"):
            if chapter.get(key) == "generating":
                chapter[key] = "failed"
                chapter["error"] = "サーバー再起動により処理が中断されました。もう一度実行してください。"


load_state()
