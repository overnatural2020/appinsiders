# Imagen única: compila el frontend (Vite) y lo sirve desde el backend (Express).
# Railway construye esto y expone el puerto $PORT.

# 1) Build del frontend
FROM node:20-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2) Backend + estáticos del frontend
FROM node:20-slim
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=frontend /app/frontend/dist /app/frontend/dist

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV FRONTEND_DIST=/app/frontend/dist
# $PORT lo inyecta Railway; el server usa process.env.PORT.
EXPOSE 8080
CMD ["node", "src/api/server.js"]
