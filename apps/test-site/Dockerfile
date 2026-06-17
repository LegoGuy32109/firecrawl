# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY public ./public
COPY src ./src
COPY astro.config.mjs ./

RUN pnpm install --frozen-lockfile --dangerously-allow-all-builds
RUN pnpm build

EXPOSE 4321

CMD ["pnpm", "preview", "--host", "0.0.0.0", "--port", "4321", "--strictPort"]
