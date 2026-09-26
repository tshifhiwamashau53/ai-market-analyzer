from dataclasses import dataclass

@dataclass
class SentimentResult:
    label: str
    score: float
    model: str

class FinBERTSentiment:
    def __init__(self, model_name: str = "ProsusAI/finbert"):
        self.model_name = model_name
        self._pipeline = None

    def load(self) -> bool:
        try:
            from transformers import pipeline
            self._pipeline = pipeline("text-classification", model=self.model_name, tokenizer=self.model_name, truncation=True)
            return True
        except Exception:
            self._pipeline = None
            return False

    def available(self) -> bool:
        return self._pipeline is not None

    def analyze(self, text: str) -> SentimentResult:
        if self._pipeline is None and not self.load():
            return SentimentResult("UNAVAILABLE", 0.0, self.model_name)
        result = self._pipeline(text, truncation=True)[0]
        return SentimentResult(result["label"].upper(), float(result["score"]), self.model_name)
