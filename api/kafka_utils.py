import json
import asyncio
import logging
from datetime import datetime

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from sqlalchemy.orm import Session
from database import SessionLocal
from models import TrainingMetric, TrainingSession
from config import KAFKA_BOOTSTRAP_SERVERS

logger = logging.getLogger(__name__)


async def get_kafka_producer() -> AIOKafkaProducer:
    producer = AIOKafkaProducer(
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
    )
    await producer.start()
    return producer


async def send_training_command(command: dict):
    producer = await get_kafka_producer()
    try:
        await producer.send_and_wait("training-commands", command)
    finally:
        await producer.stop()


def _store_metric(data: dict):
    """Persist a single metric message to PostgreSQL."""
    db: Session = SessionLocal()
    try:
        # Upsert session
        session = (
            db.query(TrainingSession)
            .filter(
                TrainingSession.library == data.get("library"),
                TrainingSession.dataset == data.get("dataset"),
                TrainingSession.status == "running",
            )
            .first()
        )
        if session is None:
            session = TrainingSession(
                library=data.get("library"),
                dataset=data.get("dataset"),
                status="running",
                total_epochs=data.get("total_epochs", 20),
            )
            db.add(session)
            db.commit()
            db.refresh(session)

        metric = TrainingMetric(
            session_id=session.id,
            library=data.get("library"),
            dataset=data.get("dataset"),
            epoch=data.get("epoch"),
            total_epochs=data.get("total_epochs", 20),
            accuracy=data.get("accuracy"),
            loss=data.get("loss"),
            cpu_usage=data.get("cpu_usage"),
            ram_usage=data.get("ram_usage"),
            epoch_time=data.get("epoch_time"),
        )
        db.add(metric)

        session.current_epoch = data.get("epoch")
        if data.get("status") == "completed":
            session.status = "completed"
            session.finished_at = datetime.utcnow()

        db.commit()
        logger.info(
            "Stored metric: %s/%s epoch %s",
            data.get("library"),
            data.get("dataset"),
            data.get("epoch"),
        )
    except Exception as exc:
        logger.error("Error storing metric: %s", exc)
        db.rollback()
    finally:
        db.close()


async def start_kafka_consumer():
    """Background task — consumes training-metrics and persists them."""
    consumer = None
    while True:
        try:
            consumer = AIOKafkaConsumer(
                "training-metrics",
                bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                value_deserializer=lambda m: json.loads(m.decode("utf-8")),
                group_id="api-metrics-consumer",
                auto_offset_reset="earliest",
            )
            await consumer.start()
            logger.info("Kafka consumer connected")
            break
        except Exception as exc:
            logger.warning("Waiting for Kafka … %s", exc)
            await asyncio.sleep(5)

    try:
        async for msg in consumer:
            try:
                _store_metric(msg.value)
            except Exception as exc:
                logger.error("Error processing message: %s", exc)
    except asyncio.CancelledError:
        pass
    finally:
        if consumer:
            await consumer.stop()
