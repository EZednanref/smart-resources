FROM node:18-alpine
RUN apk add --no-cache util-linux procps
WORKDIR .
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "backend/js/metricsServer.js"]
