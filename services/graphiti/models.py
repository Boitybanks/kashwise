"""Strict allowlisted input: no names, contact details, messages or exact locations."""

from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

Skill = Literal[
    'cleaning', 'gardening', 'tutoring', 'hair-beauty', 'repairs', 'painting',
    'catering', 'photography', 'moving', 'tech-support', 'automotive', 'other',
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Preferences(StrictModel):
    target_cents: Annotated[int, Field(strict=True, ge=100, le=10_000_000)]
    deadline: date
    area_slug: Annotated[str, Field(min_length=1, max_length=100, pattern=r'^[a-z0-9]+(?:-[a-z0-9]+)*$')]
    weekdays: Annotated[list[Annotated[int, Field(strict=True, ge=0, le=6)]], Field(min_length=1, max_length=7)]
    time_windows: Annotated[list[Literal['morning', 'afternoon', 'evening']], Field(min_length=1, max_length=3)]
    radius_km: Annotated[float, Field(ge=1, le=100)]
    skills: Annotated[list[Skill], Field(min_length=1, max_length=12)]

    @field_validator('weekdays', 'time_windows', 'skills')
    @classmethod
    def unique_values(cls, value):
        if len(value) != len(set(value)):
            raise ValueError('Entries must be unique')
        return value


class WorkerRequest(StrictModel):
    worker_id: UUID


class SaveRequest(WorkerRequest):
    preferences: Preferences

