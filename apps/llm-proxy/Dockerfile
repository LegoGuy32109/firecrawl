FROM node:20-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim

# Install codex CLI
RUN npm install -g @openai/codex

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY --from=build /app/dist ./dist

ENV PROXY_BACKEND=codex
ENV PROXY_TIMEOUT_MS=30000
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/index.js"]
