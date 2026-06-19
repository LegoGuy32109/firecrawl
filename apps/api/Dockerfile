# syntax=docker/dockerfile:1
FROM node:22-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true

RUN corepack enable

# Docker build networks can be flaky with Debian mirrors. Keep the base image's
# HTTP sources so apt does not need bootstrapped CA certs, but add retries and
# force IPv4 to avoid common container IPv6 routing failures.
RUN set -eux; \
    printf 'Acquire::Retries "5";\nAcquire::ForceIPv4 "true";\nAcquire::http::Timeout "30";\nAcquire::https::Timeout "30";\n' > /etc/apt/apt.conf.d/80-retries

# Build Go shared library
FROM golang:1.24 AS go-build
WORKDIR /app
COPY sharedLibs/go-html-to-md ./sharedLibs/go-html-to-md

RUN cd sharedLibs/go-html-to-md && \
    go mod download && \
    go build -o libhtml-to-markdown.so -buildmode=c-shared html-to-markdown.go

FROM base AS build
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    build-essential \
    pkg-config \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# FoundationDB client library (libfdb_c + headers), needed by the
# `foundationdb` npm package at install time on arches without prebuilds
ARG FDB_VERSION=7.3.63
RUN ARCH=$(dpkg --print-architecture) && \
    case "$ARCH" in arm64) FDB_ARCH=aarch64 ;; *) FDB_ARCH=$ARCH ;; esac && \
    curl -fsSL -o /tmp/fdb-clients.deb \
      "https://github.com/apple/foundationdb/releases/download/${FDB_VERSION}/foundationdb-clients_${FDB_VERSION}-1_${FDB_ARCH}.deb" && \
    dpkg -i /tmp/fdb-clients.deb && rm /tmp/fdb-clients.deb

# Install Rust
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path \
    && chmod -R a+w $RUSTUP_HOME $CARGO_HOME

# Copy dependency manifests and native workspace sources first. The native
# workspace builds during install, so keep it in the dependency cache layer
# while avoiding invalidation from ordinary API source edits.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY native/package.json native/Cargo.toml native/build.rs ./native/
COPY native/src ./native/src

# Install dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/native/target \
    pnpm install --frozen-lockfile

# Copy the rest of the source after dependencies are installed.
COPY . .

# Build the application
RUN pnpm run build

# Remove dev dependencies
RUN pnpm prune --prod --ignore-scripts

# Runtime stage
FROM base AS runtime

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    git \
    procps \
    curl \
    && rm -rf /var/lib/apt/lists/*

# FoundationDB client library (libfdb_c + fdbcli)
ARG FDB_VERSION=7.3.63
RUN ARCH=$(dpkg --print-architecture) && \
    case "$ARCH" in arm64) FDB_ARCH=aarch64 ;; *) FDB_ARCH=$ARCH ;; esac && \
    curl -fsSL -o /tmp/fdb-clients.deb \
      "https://github.com/apple/foundationdb/releases/download/${FDB_VERSION}/foundationdb-clients_${FDB_VERSION}-1_${FDB_ARCH}.deb" && \
    dpkg -i /tmp/fdb-clients.deb && rm /tmp/fdb-clients.deb

EXPOSE 8080
WORKDIR /app

# Copy built application
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/native ./native

# Copy Go shared library
COPY --from=go-build /app/sharedLibs/go-html-to-md/libhtml-to-markdown.so ./sharedLibs/go-html-to-md/

CMD ["node", "dist/src/harness.js", "--start-docker"]
