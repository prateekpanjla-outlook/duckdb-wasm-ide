# Multi-stage build for MCP Agent service

# Stage 1: Bundle JS dependencies (MCP SDK + AppBridge)
FROM node:18-alpine AS js-deps
WORKDIR /app
COPY package.json bundle_entry.js ./
RUN npm install && npx esbuild bundle_entry.js --bundle --format=esm --outfile=static/js/mcp-bundle.js --platform=browser --target=es2020

# Stage 2: Python dependencies
FROM python:3.12-slim AS py-deps
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Stage 3: Production
FROM python:3.12-slim
WORKDIR /app

# Copy Python packages
COPY --from=py-deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=py-deps /usr/local/bin/uvicorn /usr/local/bin/uvicorn

# Copy application code
COPY . .

# Copy bundled JS from stage 1
COPY --from=js-deps /app/static/js/mcp-bundle.js static/js/mcp-bundle.js

# Remove unnecessary files
RUN rm -rf node_modules bundle_entry.js package.json package-lock.json

ENV PORT=8080
ENV PYTHONIOENCODING=utf-8
ENV PYTHONUNBUFFERED=1

EXPOSE 8080

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
