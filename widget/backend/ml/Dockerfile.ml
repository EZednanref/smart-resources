FROM python:3.10-slim

WORKDIR .

RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY backend/ml/requirements-ml.txt .

RUN pip install --no-cache-dir -r requirements-ml.txt

COPY backend/ml/ml.py .

EXPOSE 5000

CMD ["python", "ml.py"]
