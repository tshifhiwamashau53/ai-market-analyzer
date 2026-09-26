import numpy as np
import pandas as pd

def volume_profile(df: pd.DataFrame, bins: int = 48) -> dict:
    if df.empty:
        return {"poc": None, "value_area_high": None, "value_area_low": None}
    prices = ((df["high"] + df["low"] + df["close"]) / 3).astype(float).to_numpy()
    volumes = df["volume"].astype(float).fillna(0).to_numpy()
    lo, hi = float(np.min(prices)), float(np.max(prices))
    if hi <= lo:
        return {"poc": lo, "value_area_high": hi, "value_area_low": lo}
    edges = np.linspace(lo, hi, bins + 1)
    bucket = np.clip(np.digitize(prices, edges) - 1, 0, bins - 1)
    profile = np.bincount(bucket, weights=volumes, minlength=bins)
    poc_idx = int(np.argmax(profile))
    poc = float((edges[poc_idx] + edges[poc_idx + 1]) / 2)
    total = profile.sum()
    if total <= 0:
        return {"poc": poc, "value_area_high": hi, "value_area_low": lo}
    target = total * 0.70
    left = right = poc_idx
    covered = profile[poc_idx]
    while covered < target and (left > 0 or right < bins - 1):
        left_score = profile[left - 1] if left > 0 else -1
        right_score = profile[right + 1] if right < bins - 1 else -1
        if right_score >= left_score and right < bins - 1:
            right += 1
            covered += profile[right]
        elif left > 0:
            left -= 1
            covered += profile[left]
        else:
            break
    return {
        "poc": poc,
        "value_area_high": float(edges[right + 1]),
        "value_area_low": float(edges[left]),
    }
