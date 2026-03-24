import enum
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.sql import func
from database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    user = "user"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    role = Column(String(20), default="user")
    created_at = Column(DateTime, server_default=func.now())


class TrainingSession(Base):
    __tablename__ = "training_sessions"

    id = Column(Integer, primary_key=True, index=True)
    library = Column(String(50), nullable=False)
    dataset = Column(String(50), nullable=False)
    status = Column(String(20), default="running")
    total_epochs = Column(Integer, default=20)
    current_epoch = Column(Integer, default=0)
    started_at = Column(DateTime, server_default=func.now())
    finished_at = Column(DateTime, nullable=True)


class TrainingMetric(Base):
    __tablename__ = "training_metrics"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("training_sessions.id"), nullable=True)
    library = Column(String(50), nullable=False)
    dataset = Column(String(50), nullable=False)
    epoch = Column(Integer, nullable=False)
    total_epochs = Column(Integer, default=20)
    accuracy = Column(Float, nullable=True)
    loss = Column(Float, nullable=True)
    cpu_usage = Column(Float, nullable=True)
    ram_usage = Column(Float, nullable=True)
    epoch_time = Column(Float, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
