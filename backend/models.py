"""
APIリクエスト/レスポンスのPydanticモデル。
"""

from typing import Literal, Optional

from pydantic import BaseModel


class VoiceProfileOut(BaseModel):
    id: str
    label: str
    era_tag: Optional[str] = None
    source_type: str
    audio_url: str
    duration_sec: Optional[float] = None
    quality_note: Optional[str] = None


class ChapterCreate(BaseModel):
    title: str = ""
    body: str = ""


class ChapterUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    voice_profile_id: Optional[str] = None


class ChapterOut(BaseModel):
    id: str
    title: str
    body: str
    voice_profile_id: Optional[str] = None
    draft_status: Literal["idle", "generating", "done", "failed"]
    draft_audio_url: Optional[str] = None
    draft_source_body: Optional[str] = None
    draft_source: Optional[Literal["tts", "recording"]] = None
    final_status: Literal["idle", "generating", "done", "failed"]
    final_audio_url: Optional[str] = None
    error: Optional[str] = None


def chapter_out(chapter: dict) -> ChapterOut:
    # draft_audio_path は内部管理用(実ファイルパス)なのでレスポンスからは除く
    return ChapterOut(**{k: v for k, v in chapter.items() if k != "draft_audio_path"})


class ApplyVoiceRequest(BaseModel):
    voice_profile_id: str
