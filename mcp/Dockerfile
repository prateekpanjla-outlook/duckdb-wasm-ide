# Multi-stage build for MCP Agent service
# Stage 1: Python dependencies
FROM python:3.12-slim AS dependencies
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: Production
FROM python:3.12-slim
WORKDIR /app

# Copy Python packages from build stage
COPY --from=dependencies /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=dependencies /usr/local/bin/uvicorn /usr/local/bin/uvicorn

# Copy application code
COPY . .

# Set environment
ENV PORT=8080
ENV PYTHONIOENCODING=utf-8
ENV PYTHONUNBUFFERED=1

EXPOSE 8080

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
