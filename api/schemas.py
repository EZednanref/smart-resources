from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class UserCreate(BaseModel):
    username: str
    password: str
    first_name: str
    last_name: str


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    first_name: str
    last_name: str
    role: str

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class TrainingStartRequest(BaseModel):
    library: Optional[str] = None
    dataset: Optional[str] = None


class MetricResponse(BaseModel):
    library: str
    dataset: str
    epoch: int
    total_epochs: int
    accuracy: Optional[float] = None
    loss: Optional[float] = None
    cpu_usage: Optional[float] = None
    ram_usage: Optional[float] = None
    epoch_time: Optional[float] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
