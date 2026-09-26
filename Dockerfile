FROM node:22-alpine AS frontend

WORKDIR /app/frontend
COPY frontend/package.json frontend/tsconfig.json frontend/vite.config.ts frontend/index.html ./
COPY frontend/src ./src
RUN npm install && npm run build

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    LEARNING_LINKS_HOST=0.0.0.0 \
    LEARNING_LINKS_PORT=8000

WORKDIR /app
COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --no-cache-dir .

COPY --from=frontend /app/frontend/dist /app/frontend/dist
ENV LEARNING_LINKS_FRONTEND_DIST=/app/frontend/dist

EXPOSE 8000
CMD ["learning-links-api"]
