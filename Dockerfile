FROM node:20-alpine AS builder

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package*.json ./
COPY tsconfig.json ./

RUN npm install && \
    npm cache clean --force

COPY src ./src

RUN npm run build

FROM node:20-alpine

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package*.json ./

RUN npm install --only=production && \
    npm cache clean --force

RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

COPY --from=builder /app/dist ./dist
COPY .env ./.env

RUN mkdir -p logs

EXPOSE 4000

ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_HEADLESS=true

CMD ["node", "dist/server.js"]
