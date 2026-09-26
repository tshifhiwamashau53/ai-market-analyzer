from dataclasses import dataclass

@dataclass
class SentimentResult:
    label:str
    score:float
    model:str

class FinBERTSentiment:
    def __init__(self,model_name="ProsusAI/finbert"):
        self.model_name=model_name
        self._pipeline=None

    def available(self)->bool:
        return self._pipeline is not None

    def analyze(self,text:str)->SentimentResult:
        if self._pipeline is None:
            return SentimentResult("UNAVAILABLE",0.0,self.model_name)
        result=self._pipeline(text,truncation=True)[0]
        return SentimentResult(result["label"],float(result["score"]),self.model_name)
