FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install
COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY tsconfig*.json ./
COPY nest-cli.json ./

RUN npm run build

CMD ["node", "dist/main.js"]
