FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 AUTOSALONE_DATA_DIR=/data AUTOSALONE_HOST=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-ita tesseract-ocr-eng && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN mkdir -p /data
CMD ["sh","-c","uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8765}"]
