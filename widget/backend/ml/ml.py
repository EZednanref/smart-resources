import numpy as np
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS
import tensorflow as tf
from tensorflow import keras
from sklearn.preprocessing import MinMaxScaler
from collections import deque
import threading
import time
import requests
import os

app = Flask(__name__)
CORS(app)

# Constantes
MAX_SECONDS = 300
CAP_CPU = 50
CAP_MEM = 10
# Paramètres entrainement :
BATCH_SIZE = 8
EPOCHS = 5


class CPURAMPredictor:
    def __init__(self, sequence_length=30, prediction_horizon=120):
        """
        sequence_length: nombre de points historiques (30 secondes)
        prediction_horizon: horizon de prédiction (30-120 secondes)
        """
        self.sequence_length = sequence_length
        self.prediction_horizon = prediction_horizon

        self.cpu_history = deque(maxlen=MAX_SECONDS)
        self.ram_history = deque(maxlen=MAX_SECONDS)
        self.process_history = deque(maxlen=MAX_SECONDS)

        self.cpu_scaler = MinMaxScaler()
        self.ram_scaler = MinMaxScaler()

        self.cpu_model = None
        self.ram_model = None

        self.is_trained = False
        self.lock = threading.Lock()

        print("[DEBUG] ml.py : init")

    def create_model(self, input_shape):
        """Modèle choisi : Même si le temps d'entrainement est plus long, le LSTM à un meilleur traitement des longues séquences"""
        # Test
        model = keras.Sequential(
            [
                keras.layers.LSTM(64, input_shape=input_shape, return_sequences=True),
                keras.layers.Dropout(0.2),
                keras.layers.LSTM(32, return_sequences=False),
                keras.layers.Dropout(0.2),
                keras.layers.Dense(32, activation="relu"),
                keras.layers.Dense(1),
            ]
        )

        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=0.001),
            loss="mse",
            metrics=["mae"],
        )

        return model

    def add_data_point(self, cpu_percent, ram_percent, processes):
        """Ajouter un point de données"""
        with self.lock:
            self.cpu_history.append(cpu_percent)
            self.ram_history.append(ram_percent)

            process_features = self._extract_process_features(processes)
            self.process_history.append(process_features)

    def _extract_process_features(self, processes):
        if not processes:
            return {
                "total_processes": 0,
                "high_cpu_count": 0,
                "high_mem_count": 0,
                "avg_cpu": 0,
                "avg_mem": 0,
            }

        total = len(processes)
        high_cpu = sum(1 for p in processes if p.get("cpu", 0) > CAP_CPU)
        high_mem = sum(1 for p in processes if p.get("memory", 0) > CAP_MEM)
        avg_cpu = np.mean([p.get("cpu", 0) for p in processes])
        avg_mem = np.mean([p.get("memory", 0) for p in processes])

        return {
            "total_processes": total,
            "high_cpu_count": high_cpu,
            "high_mem_count": high_mem,
            "avg_cpu": avg_cpu,
            "avg_mem": avg_mem,
        }

    # Normaliser les données pour l'entrainement
    def prepare_training_data(self, data, scaler):
        if len(data) < self.sequence_length + 10:
            return None, None

        data_array = np.array(data).reshape(-1, 1)
        scaled_data = scaler.fit_transform(data_array)

        X, y = [], []
        for i in range(len(scaled_data) - self.sequence_length - 1):
            X.append(scaled_data[i : i + self.sequence_length])
            y.append(scaled_data[i + self.sequence_length])

        return np.array(X), np.array(y)

    # Ré-entraîner le modèle avec les nouvelles données
    def train_models(self):
        with self.lock:
            if len(self.cpu_history) < self.sequence_length + 20:
                print("[DEBUG] Pas assez de données")
                return False

            print("[DEBUG] Entraînement des deux modèles")

            X_cpu, y_cpu = self.prepare_training_data(
                list(self.cpu_history), self.cpu_scaler
            )

            X_ram, y_ram = self.prepare_training_data(
                list(self.ram_history), self.ram_scaler
            )

            if X_cpu is None or X_ram is None:
                return False

            # Si les modèles n'ont pas encore été entrainés, il faut les créer
            if self.cpu_model is None:
                self.cpu_model = self.create_model((self.sequence_length, 1))

            if self.ram_model is None:
                self.ram_model = self.create_model((self.sequence_length, 1))

            # Entraînement modèle CPU
            self.cpu_model.fit(
                X_cpu,
                y_cpu,
                epochs=EPOCHS,
                batch_size=BATCH_SIZE,
                verbose=0,
                validation_split=0.2,
            )

            # Entraînement modèle RAM
            self.ram_model.fit(
                X_ram,
                y_ram,
                epochs=EPOCHS,
                batch_size=BATCH_SIZE,
                verbose=0,
                validation_split=0.2,
            )

            self.is_trained = True
            print("[DEBUG] Modèles entraînés")
            return True

    def predict(self, steps=60):
        """Prédire les prochaines N secondes (30-120)"""
        if not self.is_trained:
            return None

        with self.lock:
            # Préparer les dernières données
            cpu_recent = np.array(
                list(self.cpu_history)[-self.sequence_length :]
            ).reshape(-1, 1)
            ram_recent = np.array(
                list(self.ram_history)[-self.sequence_length :]
            ).reshape(-1, 1)

            # Normaliser
            cpu_scaled = self.cpu_scaler.transform(cpu_recent)
            ram_scaled = self.ram_scaler.transform(ram_recent)

            # Prédictions itératives
            cpu_predictions = []
            ram_predictions = []

            cpu_input = cpu_scaled.copy()
            ram_input = ram_scaled.copy()

            for _ in range(min(steps, self.prediction_horizon)):
                # Prédire CPU
                cpu_pred = self.cpu_model.predict(
                    cpu_input.reshape(1, self.sequence_length, 1), verbose=0
                )
                cpu_predictions.append(cpu_pred[0][0])

                # Prédire RAM
                ram_pred = self.ram_model.predict(
                    ram_input.reshape(1, self.sequence_length, 1), verbose=0
                )
                ram_predictions.append(ram_pred[0][0])

                # Mettre à jour les inputs pour la prochaine prédiction
                cpu_input = np.append(cpu_input[1:], cpu_pred).reshape(-1, 1)
                ram_input = np.append(ram_input[1:], ram_pred).reshape(-1, 1)

            # Dénormaliser
            cpu_predictions = self.cpu_scaler.inverse_transform(
                np.array(cpu_predictions).reshape(-1, 1)
            ).flatten()

            ram_predictions = self.ram_scaler.inverse_transform(
                np.array(ram_predictions).reshape(-1, 1)
            ).flatten()

            # Limiter entre 0 et 100
            cpu_predictions = np.clip(cpu_predictions, 0, 100)
            ram_predictions = np.clip(ram_predictions, 0, 100)

            return {
                "cpu": cpu_predictions.tolist(),
                "ram": ram_predictions.tolist(),
                "timestamps": [i for i in range(len(cpu_predictions))],
            }


# Instance globale
predictor = CPURAMPredictor(sequence_length=30, prediction_horizon=120)


# Thread de collecte de données
def data_collector():
    """Collecter les données depuis le metrics-server toutes les secondes"""
    metrics_url = os.getenv("METRICS_URL", "http://metrics-server:3000/api/metrics")

    while True:
        try:
            response = requests.get(metrics_url, timeout=2)
            if response.status_code == 200:
                data = response.json()

                cpu_percent = data.get("cpu", {}).get("percentage", 0)
                ram_percent = data.get("memory", {}).get("percentage", 0)
                processes = data.get("processes", [])

                predictor.add_data_point(cpu_percent, ram_percent, processes)

                # Ré-entraîner le modèle toutes les 60 secondes
                if (
                    len(predictor.cpu_history) % 60 == 0
                    and len(predictor.cpu_history) > 50
                ):
                    threading.Thread(target=predictor.train_models).start()

        except Exception as e:
            print(f"❌ Erreur collecte: {e}")

        time.sleep(1)


# Démarrer la collecte en arrière-plan
collector_thread = threading.Thread(target=data_collector, daemon=True)
collector_thread.start()


# Routes API
@app.route("/health", methods=["GET"])
def health():
    return jsonify(
        {
            "status": "healthy",
            "is_trained": predictor.is_trained,
            "data_points": len(predictor.cpu_history),
        }
    )


@app.route("/predict", methods=["GET"])
def predict():
    """Endpoint de prédiction"""
    steps = int(request.args.get("steps", 60))  # Par défaut 60 secondes
    steps = min(max(steps, 30), 120)  # Entre 30 et 120 secondes

    if not predictor.is_trained:
        return jsonify(
            {
                "error": "Model not trained yet",
                "data_points": len(predictor.cpu_history),
                "required": predictor.sequence_length + 20,
            }
        ), 503

    predictions = predictor.predict(steps)

    if predictions is None:
        return jsonify({"error": "Prediction failed"}), 500

    return jsonify(
        {
            "predictions": predictions,
            "horizon_seconds": steps,
            "current_cpu": list(predictor.cpu_history)[-1]
            if predictor.cpu_history
            else 0,
            "current_ram": list(predictor.ram_history)[-1]
            if predictor.ram_history
            else 0,
        }
    )


@app.route("/history", methods=["GET"])
def history():
    """Retourner l'historique des données"""
    return jsonify(
        {
            "cpu": list(predictor.cpu_history),
            "ram": list(predictor.ram_history),
            "length": len(predictor.cpu_history),
        }
    )


@app.route("/metrics", methods=["GET"])
def metrics():
    """Métriques Prometheus"""
    output = []

    # Métrique: statut du modèle
    output.append("# HELP ml_model_trained Model training status")
    output.append("# TYPE ml_model_trained gauge")
    output.append(f"ml_model_trained {1 if predictor.is_trained else 0}")

    # Métrique: points de données
    output.append("# HELP ml_data_points Number of data points collected")
    output.append("# TYPE ml_data_points gauge")
    output.append(f"ml_data_points {len(predictor.cpu_history)}")

    return "\n".join(output), 200, {"Content-Type": "text/plain"}


if __name__ == "__main__":
    print("🤖 ML Predictor Service démarré")
    print(
        f"📊 Collecte depuis: {os.getenv('METRICS_URL', 'http://metrics-server:3000/api/metrics')}"
    )
    app.run(host="0.0.0.0", port=5000, debug=False)
