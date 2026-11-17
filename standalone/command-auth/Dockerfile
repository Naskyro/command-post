FROM node:24-alpine

# nginx for TLS-termination proxy; gettext for envsubst
RUN apk add --no-cache nginx gettext

# No npm install needed — only Node built-ins are used
WORKDIR /app
COPY server.mjs store.mjs operator.mjs ./

COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY start.sh /start.sh
RUN chmod +x /start.sh

# /data is mounted as a Railway persistent volume
RUN mkdir -p /data && chmod 700 /data

EXPOSE 8080

CMD ["/start.sh"]
