FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY backend/ml/requirements-ml.txt .
RUN pip install --no-cache-dir -r requirements-ml.txt

# COPIE du code Python ET du fichier HTML
COPY backend/ml/ml.py .
# On suppose que ml-dashboard.html est dans le dossier front/
COPY front/ml-dashboard.html . 

EXPOSE 5000

CMD ["python", "ml.py"]