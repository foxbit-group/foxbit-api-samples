FROM python:3.14.6-slim-bookworm

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY example.py ./

CMD ["python", "example.py"]
