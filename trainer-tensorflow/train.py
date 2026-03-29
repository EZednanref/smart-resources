"""
Trainer TensorFlow/Keras – Fashion MNIST & CIFAR-100
Communique uniquement via Kafka (training-metrics).
"""

import os

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"  # Masquer les logs TF

import time
import json
import logging

import numpy as np
import psutil
import tensorflow as tf
from tensorflow import keras
from kafka import KafkaProducer

# ──────────────── Configuration ────────────────
KAFKA_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
DATASET_PATH = "/data/datasets/tensorflow"
NUM_EPOCHS = 20
BATCH_SIZE = 64

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("trainer-tensorflow")


# ──────────────── Kafka producer (with retries) ────────────────
def get_producer(max_retries: int = 60, wait: int = 5) -> KafkaProducer:
    for attempt in range(1, max_retries + 1):
        try:
            producer = KafkaProducer(
                bootstrap_servers=KAFKA_SERVERS,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            )
            logger.info("Connecté à Kafka")
            return producer
        except Exception as exc:
            logger.warning("Kafka pas prêt (%d/%d) : %s", attempt, max_retries, exc)
            time.sleep(wait)
    raise RuntimeError("Impossible de se connecter à Kafka")


# ──────────────── Callback Keras → Kafka ────────────────
class KafkaMetricsCallback(keras.callbacks.Callback):
    """Envoie les métriques de chaque epoch vers Kafka."""

    def __init__(self, producer, dataset_name, total_epochs, x_test, y_test):
        super().__init__()
        self.producer = producer
        self.dataset_name = dataset_name
        self.total_epochs = total_epochs
        self.x_test = x_test
        self.y_test = y_test
        self._epoch_start = None

    def on_epoch_begin(self, epoch, logs=None):
        self._epoch_start = time.time()

    def on_epoch_end(self, epoch, logs=None):
        epoch_time = time.time() - self._epoch_start

        # Évaluation sur le jeu de test
        test_loss, test_acc = self.model.evaluate(
            self.x_test, self.y_test, verbose=0
        )

        metric = {
            "library": "tensorflow",
            "dataset": self.dataset_name,
            "epoch": epoch + 1,
            "total_epochs": self.total_epochs,
            "accuracy": round(float(test_acc), 4),
            "loss": round(float(test_loss), 4),
            "cpu_usage": round(psutil.cpu_percent(interval=None), 2),
            "ram_usage": round(psutil.virtual_memory().percent, 2),
            "epoch_time": round(epoch_time, 2),
            "status": "completed" if (epoch + 1) == self.total_epochs else "running",
        }

        self.producer.send("training-metrics", metric)
        self.producer.flush()

        logger.info(
            "[TensorFlow/%s] Epoch %d/%d – acc=%.4f loss=%.4f time=%.2fs",
            self.dataset_name,
            epoch + 1,
            self.total_epochs,
            test_acc,
            test_loss,
            epoch_time,
        )


# ──────────────── Modèle Fashion MNIST ────────────────
def build_fashion_mnist_model():
    return keras.Sequential(
        [
            keras.layers.Conv2D(
                32, 3, padding="same", activation="relu", input_shape=(28, 28, 1)
            ),
            keras.layers.MaxPooling2D(),
            keras.layers.Conv2D(64, 3, padding="same", activation="relu"),
            keras.layers.MaxPooling2D(),
            keras.layers.Flatten(),
            keras.layers.Dense(128, activation="relu"),
            keras.layers.Dropout(0.25),
            keras.layers.Dense(10, activation="softmax"),
        ]
    )


# ──────────────── Modèle CIFAR-100 ────────────────
def build_cifar100_model():
    return keras.Sequential(
        [
            keras.layers.Conv2D(
                32, 3, padding="same", activation="relu", input_shape=(32, 32, 3)
            ),
            keras.layers.BatchNormalization(),
            keras.layers.MaxPooling2D(),
            keras.layers.Conv2D(64, 3, padding="same", activation="relu"),
            keras.layers.BatchNormalization(),
            keras.layers.MaxPooling2D(),
            keras.layers.Conv2D(128, 3, padding="same", activation="relu"),
            keras.layers.BatchNormalization(),
            keras.layers.MaxPooling2D(),
            keras.layers.Flatten(),
            keras.layers.Dense(256, activation="relu"),
            keras.layers.Dropout(0.3),
            keras.layers.Dense(100, activation="softmax"),
        ]
    )


# ──────────────── Main ────────────────
def main():
    producer = get_producer()

    # ── Fashion MNIST ──
    logger.info("Démarrage de l'entraînement Fashion MNIST …")
    (x_train, y_train), (x_test, y_test) = keras.datasets.fashion_mnist.load_data()
    x_train = x_train.reshape(-1, 28, 28, 1).astype("float32") / 255.0
    x_test = x_test.reshape(-1, 28, 28, 1).astype("float32") / 255.0

    model = build_fashion_mnist_model()
    model.compile(
        optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"]
    )
    cb = KafkaMetricsCallback(producer, "fashion_mnist", NUM_EPOCHS, x_test, y_test)
    model.fit(
        x_train, y_train,
        epochs=NUM_EPOCHS,
        batch_size=BATCH_SIZE,
        verbose=0,
        callbacks=[cb],
    )

    # ── CIFAR-100 ──
    logger.info("Démarrage de l'entraînement CIFAR-100 …")
    (x_train, y_train), (x_test, y_test) = keras.datasets.cifar100.load_data()
    y_train = y_train.flatten()
    y_test = y_test.flatten()
    x_train = x_train.astype("float32") / 255.0
    x_test = x_test.astype("float32") / 255.0

    model = build_cifar100_model()
    model.compile(
        optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"]
    )
    cb = KafkaMetricsCallback(producer, "cifar100", NUM_EPOCHS, x_test, y_test)
    model.fit(
        x_train, y_train,
        epochs=NUM_EPOCHS,
        batch_size=BATCH_SIZE,
        verbose=0,
        callbacks=[cb],
    )

    logger.info("Tous les entraînements TensorFlow sont terminés.")

    # Maintient le conteneur en vie
    while True:
        time.sleep(60)


if __name__ == "__main__":
    main()
