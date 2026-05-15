ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest
FROM ${BUILD_FROM}

ENV LANG=C.UTF-8
ENV DATA_DIR=/data/car-cost-dashboard
ENV PORT=3000

RUN apk add --no-cache nodejs npm

WORKDIR /app

COPY package.json server.js ./
COPY public ./public
COPY data ./data
COPY run.sh /run.sh

RUN chmod a+x /run.sh

EXPOSE 3000

CMD ["/run.sh"]
