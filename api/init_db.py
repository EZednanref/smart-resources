import logging
from database import SessionLocal, engine, Base
from models import User
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
