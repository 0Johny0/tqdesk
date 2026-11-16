from typing import List

from pydantic import BaseModel


class LoginIn(BaseModel):
    user: str
    pwd: str


class WatchIn(BaseModel):
    symbols: List[str]