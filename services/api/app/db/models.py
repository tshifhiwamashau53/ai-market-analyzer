from datetime import datetime
from sqlalchemy.orm import DeclarativeBase,Mapped,mapped_column
from sqlalchemy import String,Float,DateTime,Text

class Base(DeclarativeBase): pass

class AnalysisRecord(Base):
    __tablename__="analysis_records"
    id:Mapped[int]=mapped_column(primary_key=True,autoincrement=True)
    symbol:Mapped[str]=mapped_column(String(32),index=True)
    action:Mapped[str]=mapped_column(String(16))
    direction:Mapped[str]=mapped_column(String(16))
    current_price:Mapped[float]=mapped_column(Float)
    confidence:Mapped[float]=mapped_column(Float)
    entry:Mapped[float|None]=mapped_column(Float,nullable=True)
    stop_loss:Mapped[float|None]=mapped_column(Float,nullable=True)
    take_profit:Mapped[float|None]=mapped_column(Float,nullable=True)
    setup:Mapped[str]=mapped_column(String(128))
    reasons:Mapped[str]=mapped_column(Text)
    created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow,index=True)
