FROM node:10

# Create app directory
WORKDIR /usr/src/app

COPY packgage.json ./
COPY yarn.lock

RUN yarn install

COPY . .

EXPOSE 2775
CMD ["yarn", "start"]
