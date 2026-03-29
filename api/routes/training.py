from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import TrainingSession, User
from auth import get_current_user
from schemas import TrainingStartRequest
from kafka_utils import send_training_command

router = APIRouter(tags=["Training"])


@router.get("/sessions")
def get_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sessions = (
        db.query(TrainingSession)
        .order_by(TrainingSession.started_at.desc())
        .all()
    )
    return [
        {
            "id": s.id,
            "library": s.library,
            "dataset": s.dataset,
            "status": s.status,
            "total_epochs": s.total_epochs,
            "current_epoch": s.current_epoch,
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "finished_at": s.finished_at.isoformat() if s.finished_at else None,
        }
        for s in sessions
    ]


@router.post("/start")
async def start_training(
    request: TrainingStartRequest,
    current_user: User = Depends(get_current_user),
):
    command = {
        "action": "start",
        "library": request.library,
        "dataset": request.dataset,
    }
    try:
        await send_training_command(command)
        return {"message": "Commande de training envoyée", "command": command}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur Kafka: {exc}")
