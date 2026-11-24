# One image for every Cairnmoor stub. python:3.12-slim is published for amd64 and arm64 (Apple Silicon).
FROM python:3.12-slim
RUN useradd --system --uid 10001 cairnmoor
COPY stub.py /app/stub.py
USER cairnmoor
EXPOSE 8000
CMD ["python", "-u", "/app/stub.py"]
