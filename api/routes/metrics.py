from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional
from database import get_db
from models import TrainingMetric, User
from auth import get_current_user, require_admin

router = APIRouter(tags=["Metrics"])


@router.get("/accuracy")
def get_accuracy_metrics(
    library: Optional[str] = None,
    dataset: Optional[str] = None,
    limit: int = Query(default=200, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(TrainingMetric)
    if library:
        query = query.filter(TrainingMetric.library == library)
    if dataset:
        query = query.filter(TrainingMetric.dataset == dataset)

    metrics = query.order_by(TrainingMetric.created_at.asc()).limit(limit).all()
    return [
        {
            "library": m.library,
            "dataset": m.dataset,
            "epoch": m.epoch,
            "accuracy": m.accuracy,
            "loss": m.loss,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in metrics
    ]


@router.get("/speed")
def get_speed_metrics(
    library: Optional[str] = None,
    dataset: Optional[str] = None,
    limit: int = Query(default=200, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(TrainingMetric)
    if library:
        query = query.filter(TrainingMetric.library == library)
    if dataset:
        query = query.filter(TrainingMetric.dataset == dataset)

    metrics = query.order_by(TrainingMetric.created_at.asc()).limit(limit).all()
    return [
        {
            "library": m.library,
            "dataset": m.dataset,
            "epoch": m.epoch,
            "epoch_time": m.epoch_time,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in metrics
    ]


@router.get("/cpu")
def get_cpu_metrics(
    library: Optional[str] = None,
    dataset: Optional[str] = None,
    limit: int = Query(default=200, le=1000),
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """Réservé aux administrateurs."""
    query = db.query(TrainingMetric)
    if library:
        query = query.filter(TrainingMetric.library == library)
    if dataset:
        query = query.filter(TrainingMetric.dataset == dataset)

    metrics = query.order_by(TrainingMetric.created_at.asc()).limit(limit).all()
    return [
        {
            "library": m.library,
            "dataset": m.dataset,
            "epoch": m.epoch,
            "cpu_usage": m.cpu_usage,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in metrics
    ]


@router.get("/ram")
def get_ram_metrics(
    library: Optional[str] = None,
    dataset: Optional[str] = None,
    limit: int = Query(default=200, le=1000),
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """Réservé aux administrateurs."""
    query = db.query(TrainingMetric)
    if library:
        query = query.filter(TrainingMetric.library == library)
    if dataset:
        query = query.filter(TrainingMetric.dataset == dataset)

    metrics = query.order_by(TrainingMetric.created_at.asc()).limit(limit).all()
    return [
        {
            "library": m.library,
            "dataset": m.dataset,
            "epoch": m.epoch,
            "ram_usage": m.ram_usage,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in metrics
    ]


@router.get("/latest")
def get_latest_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Dernières métriques par combinaison library/dataset."""
    combos = (
        db.query(TrainingMetric.library, TrainingMetric.dataset).distinct().all()
    )

    results = []
    for library, dataset in combos:
        latest = (
            db.query(TrainingMetric)
            .filter(
                TrainingMetric.library == library,
                TrainingMetric.dataset == dataset,
            )
            .order_by(desc(TrainingMetric.created_at))
            .first()
        )
        if latest:
            entry = {
                "library": latest.library,
                "dataset": latest.dataset,
                "epoch": latest.epoch,
                "total_epochs": latest.total_epochs,
                "accuracy": latest.accuracy,
                "loss": latest.loss,
                "epoch_time": latest.epoch_time,
                "created_at": (
                    latest.created_at.isoformat() if latest.created_at else None
                ),
            }
            if current_user.role == "admin":
                entry["cpu_usage"] = latest.cpu_usage
                entry["ram_usage"] = latest.ram_usage
            results.append(entry)

    return results
