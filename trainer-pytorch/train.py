"""
Trainer PyTorch – Fashion MNIST & CIFAR-100
Communique uniquement via Kafka (training-metrics).
"""

import os
import time
import json
import logging

import psutil
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from torchvision import datasets, transforms
from kafka import KafkaProducer

KAFKA_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
DATASET_PATH = "/data/datasets/pytorch"
NUM_EPOCHS = 10  
BATCH_SIZE = 64
LEARNING_RATE = 1e-3

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("trainer-pytorch")


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


class FashionMNISTNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(1, 32, kernel_size=3, padding=1),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
        )
        self.classifier = nn.Sequential(
            nn.Linear(64 * 7 * 7, 128),
            nn.ReLU(inplace=True),
            nn.Dropout(0.25),
            nn.Linear(128, 10),
        )

    def forward(self, x):
        x = self.features(x)
        x = x.view(x.size(0), -1)
        return self.classifier(x)


class CIFAR100Net(nn.Module):
    def __init__(self):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(3, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
        )
        self.classifier = nn.Sequential(
            nn.Linear(128 * 4 * 4, 256),
            nn.ReLU(inplace=True),
            nn.Dropout(0.3),
            nn.Linear(256, 100),
        )

    def forward(self, x):
        x = self.features(x)
        x = x.view(x.size(0), -1)
        return self.classifier(x)


def train_model(producer, model, train_loader, test_loader, dataset_name):
    device = torch.device("cpu")
    model = model.to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=LEARNING_RATE)

    for epoch in range(1, NUM_EPOCHS + 1):
        model.train()
        epoch_start = time.time()

        running_loss = 0.0
        correct = 0
        total = 0

        for data, target in train_loader:
            data, target = data.to(device), target.to(device)
            optimizer.zero_grad()
            output = model(data)
            loss = criterion(output, target)
            loss.backward()
            optimizer.step()

            running_loss += loss.item()
            _, predicted = output.max(1)
            total += target.size(0)
            correct += predicted.eq(target).sum().item()

        model.eval()
        test_correct = 0
        test_total = 0
        with torch.no_grad():
            for data, target in test_loader:
                data, target = data.to(device), target.to(device)
                output = model(data)
                _, predicted = output.max(1)
                test_total += target.size(0)
                test_correct += predicted.eq(target).sum().item()

        epoch_time = time.time() - epoch_start
        accuracy = test_correct / test_total if test_total else 0.0
        avg_loss = running_loss / len(train_loader)

        metric = {
            "library": "pytorch",
            "dataset": dataset_name,
            "epoch": epoch,
            "total_epochs": NUM_EPOCHS,
            "accuracy": round(accuracy, 4),
            "loss": round(avg_loss, 4),
            "cpu_usage": round(psutil.cpu_percent(interval=None), 2),
            "ram_usage": round(psutil.virtual_memory().percent, 2),
            "epoch_time": round(epoch_time, 2),
            "status": "completed" if epoch == NUM_EPOCHS else "running",
        }

        producer.send("training-metrics", metric)
        producer.flush()

        logger.info(
            "[PyTorch/%s] Epoch %d/%d – acc=%.4f loss=%.4f time=%.2fs",
            dataset_name, epoch, NUM_EPOCHS, accuracy, avg_loss, epoch_time,
        )


def main():
    producer = get_producer()

    logger.info("Démarrage de l'entraînement Fashion MNIST …")
    transform_mnist = transforms.Compose([
        transforms.ToTensor(),
        transforms.Normalize((0.5,), (0.5,)),
    ])
    train_ds = datasets.FashionMNIST(DATASET_PATH, train=True, download=True, transform=transform_mnist)
    test_ds  = datasets.FashionMNIST(DATASET_PATH, train=False, download=True, transform=transform_mnist)
    small_train_ds = torch.utils.data.Subset(train_ds, range(2000))
    small_test_ds = torch.utils.data.Subset(test_ds, range(500))
    train_loader = DataLoader(small_train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=2)
    test_loader  = DataLoader(small_test_ds,  batch_size=BATCH_SIZE, shuffle=False, num_workers=2)

    train_model(producer, FashionMNISTNet(), train_loader, test_loader, "fashion_mnist")

    logger.info("Démarrage de l'entraînement CIFAR-100 …")
    transform_cifar = transforms.Compose([
        transforms.RandomHorizontalFlip(),
        transforms.RandomCrop(32, padding=4),
        transforms.ToTensor(),
        transforms.Normalize((0.5071, 0.4867, 0.4408), (0.2675, 0.2565, 0.2761)),
    ])
    transform_cifar_test = transforms.Compose([
        transforms.ToTensor(),
        transforms.Normalize((0.5071, 0.4867, 0.4408), (0.2675, 0.2565, 0.2761)),
    ])
    train_ds = datasets.CIFAR100(DATASET_PATH, train=True, download=True, transform=transform_cifar)
    test_ds  = datasets.CIFAR100(DATASET_PATH, train=False, download=True, transform=transform_cifar_test)
    small_train_ds = torch.utils.data.Subset(train_ds, range(2000))
    small_test_ds = torch.utils.data.Subset(test_ds, range(500))
    train_loader = DataLoader(small_train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=2)
    test_loader  = DataLoader(small_test_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=2)

    train_model(producer, CIFAR100Net(), train_loader, test_loader, "cifar100")

    logger.info("Tous les entraînements PyTorch sont terminés.")

    while True:
        time.sleep(60)


if __name__ == "__main__":
    main()
