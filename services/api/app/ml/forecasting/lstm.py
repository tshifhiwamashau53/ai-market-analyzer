from dataclasses import dataclass
from pathlib import Path
import numpy as np
import pandas as pd

@dataclass
class ForecastModelConfig:
    sequence_length: int = 60
    horizon: int = 7
    hidden_size: int = 64
    layers: int = 2

def build_sequences(df: pd.DataFrame, feature_columns: list[str], sequence_length: int = 60):
    values = df[feature_columns].astype(float).replace([np.inf, -np.inf], np.nan).dropna().to_numpy()
    if len(values) <= sequence_length:
        return np.empty((0, sequence_length, len(feature_columns))), np.empty((0,))
    x, y = [], []
    for i in range(sequence_length, len(values)):
        x.append(values[i-sequence_length:i])
        y.append(values[i, 0])
    return np.asarray(x, dtype=np.float32), np.asarray(y, dtype=np.float32)

def model_path(model_dir: str, symbol: str, timeframe: str) -> Path:
    safe = f"{symbol.upper()}_{timeframe}".replace("/", "_").replace(" ", "_")
    return Path(model_dir) / f"{safe}.pt"

def training_contract() -> dict:
    return {
        "status": "interface_only",
        "purpose": "Define reproducible LSTM training inputs without pretending an untrained model is predictive.",
        "required_validation": ["walk_forward", "out_of_sample", "calibration", "regime_breakdown"],
    }
