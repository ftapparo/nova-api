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

# Chromium antes do npm: mudanca no package.json nao invalida esta camada,
# entao o cache evita baixar e instalar o Chromium a cada deploy.
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

COPY package*.json ./

RUN npm install --only=production && \
    npm cache clean --force

COPY --from=builder /app/dist ./dist

# Termo de Uso e Política de Privacidade (PDF oficial + .md): lidos em
# runtime por src/v3/legal/ — o tsc não copia esses arquivos para dist/.
COPY legal ./legal

# .env NAO e copiado para a imagem: gravaria segredos numa camada visivel a
# qualquer "docker history". As variaveis chegam em runtime, via Environment
# variables da stack no Portainer.

RUN mkdir -p logs storage/exhaust

EXPOSE 4000

ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_HEADLESS=true

CMD ["node", "dist/server.js"]
