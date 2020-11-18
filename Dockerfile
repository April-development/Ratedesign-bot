FROM node:14

WORKDIR /app

COPY package.json ./

RUN apt update
RUN yarn install

COPY . .

CMD ["yarn", "start"]