import logging
import asyncio
from datetime import datetime, timedelta
from database import SessionLocal, engine, Base
from models import User, TrainingSession, TrainingMetric
from auth import hash_password

logger = logging.getLogger(__name__)

DEFAULT_USERS = [
    {
        "username": "admin1",
        "password": "admin1",
        "first_name": "Admin",
        "last_name": "Premier",
        "role": "admin",
    },
    {
        "username": "admin2",
        "password": "admin2",
        "first_name": "Admin",
        "last_name": "Second",
        "role": "admin",
    },
    {
        "username": "user1",
        "password": "user1",
        "first_name": "Jean",
        "last_name": "Dupont",
        "role": "user",
    },
    {
        "username": "user2",
        "password": "user2",
        "first_name": "Marie",
        "last_name": "Martin",
        "role": "user",
    },
    {
        "username": "user3",
        "password": "user3",
        "first_name": "Pierre",
        "last_name": "Durand",
        "role": "user",
    },
]


def init_default_users():
    """Create DB tables and seed default users if they don't exist."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        for u in DEFAULT_USERS:
            if not db.query(User).filter(User.username == u["username"]).first():
                user = User(
                    username=u["username"],
                    password_hash=hash_password(u["password"]),
                    first_name=u["first_name"],
                    last_name=u["last_name"],
                    role=u["role"],
                )
                db.add(user)
                logger.info("Seeded user: %s (%s)", u["username"], u["role"])
        db.commit()
    except Exception as exc:
        logger.error("Error seeding users: %s", exc)
        db.rollback()
    finally:
        db.close()

async def trigger_auto_trainings():
    """Send automatic training commands to Kafka at startup."""
    try:
        from kafka_utils import send_training_command
        
        await asyncio.sleep(3)
        
        trainings = [
            {"library": "pytorch", "dataset": "cifar100"},
            {"library": "pytorch", "dataset": "fashion_mnist"},
            {"library": "tensorflow", "dataset": "cifar100"},
            {"library": "tensorflow", "dataset": "fashion_mnist"},
        ]
        
        for training in trainings:
            try:
                await send_training_command({
                    "action": "start",
                    **training
                })
                logger.info("Triggered training: %s / %s", training["library"], training["dataset"])
                await asyncio.sleep(1)  
            except Exception as e:
                logger.error("Failed to trigger training: %s", e)
    except Exception as exc:
        logger.error("Error in trigger_auto_trainings: %s", exc)
def init_test_data():
    """Seed test training sessions and metrics for demo purposes."""
