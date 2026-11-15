# Nexo institucional (MinDesSDE): API Express + portal
FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

# Primero solo las librerías (aprovecha la caché al reconstruir)
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Después el resto del código
COPY . .

# Puerto donde escucha la aplicación (hay que indicarlo también en Coolify)
EXPOSE 3000

CMD ["node", "backend/src/servidor.js"]
