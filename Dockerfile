FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    EDEN_DATA_DIR=/data \
    EDEN_HOST=0.0.0.0 \
    HF_HOME=/data/models

# FFmpeg renders everything; Inter is the default caption font.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fontconfig fonts-inter fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt requirements-core.txt ./
RUN pip install -r requirements.txt

COPY eden ./eden

RUN useradd --create-home eden && mkdir -p /data && chown eden:eden /data
USER eden
VOLUME /data
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status == 200 else 1)"

CMD ["uvicorn", "eden.asgi:app", "--host", "0.0.0.0", "--port", "8000"]
