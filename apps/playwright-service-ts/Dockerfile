FROM node:18-slim

WORKDIR /usr/src/app

# Keep the base image's HTTP Debian mirrors so apt does not need bootstrapped CA
# certs, but add retries and force IPv4 for transient container network issues.
RUN set -eux; \
    printf 'Acquire::Retries "5";\nAcquire::ForceIPv4 "true";\nAcquire::http::Timeout "30";\nAcquire::https::Timeout "30";\n' > /etc/apt/apt.conf.d/80-retries

COPY package*.json ./
RUN npm install

ENV PLAYWRIGHT_BROWSERS_PATH=/usr/local/share/playwright

# Install Playwright dependencies
RUN npx playwright install chromium --with-deps

COPY . .

RUN npm run build

ARG PORT
ENV PORT=${PORT}

EXPOSE ${PORT}

CMD [ "npm", "start" ]
