from fastapi import APIRouter
from app.ml.forecasting.lstm import training_contract
from app.ml.evaluation import classification_metrics

router = APIRouter(prefix="/model", tags=["model"])

@router.get("/status")
async def model_status():
    return {
        "forecasting": training_contract(),
        "execution": "disabled",
        "note": "Predictions must be validated out-of-sample before being treated as reliable."
    }

@router.post("/classification-metrics")
async def model_metrics(payload: dict):
    metrics = classification_metrics(payload.get("y_true", []), payload.get("y_pred", []))
    return metrics.__dict__
