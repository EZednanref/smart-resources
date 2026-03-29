import logging
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from init_db import init_default_users
from kafka_utils import start_kafka_consumer
from routes import auth as auth_routes
from routes import training as training_routes
from routes import metrics as metrics_routes

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initialisation de la base de données …")
    init_default_users()
    logger.info("Démarrage du consumer Kafka …")
    task = asyncio.create_task(start_kafka_consumer())
    yield
    task.cancel()
    logger.info("Arrêt de l'API.")


app = FastAPI(title="Smart Resources API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router, prefix="/api/auth")
app.include_router(training_routes.router, prefix="/api/training")
app.include_router(metrics_routes.router, prefix="/api/metrics")


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
