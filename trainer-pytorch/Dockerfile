FROM python:3.11-slim

WORKDIR /app

# Install PyTorch CPU-only (lighter)
RUN pip install --no-cache-dir \
    torch torchvision \
    --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY train.py .

CMD ["python", "-u", "train.py"]
