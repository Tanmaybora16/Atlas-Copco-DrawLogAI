# FROM python:3.10
# WORKDIR /app
# COPY requirements.txt .
# RUN pip install -r requirements.txt
# # RUN pip install cryptography
# COPY . .
# CMD ["gunicorn", "-b", "0.0.0.0:5000", "app:app"]

FROM python:3.10

WORKDIR /app

COPY requirements.txt .

RUN apt-get update && apt-get install -y tesseract-ocr && rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip \
    && pip install --no-cache-dir --default-timeout=300 --retries 10 -r requirements.txt

COPY . .

CMD ["gunicorn", "-b", "0.0.0.0:5000", "--chdir", "Atlashost", "app:app"]