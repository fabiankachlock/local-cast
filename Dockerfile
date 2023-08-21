FROM node:18-alpine as node

WORKDIR /src

COPY package.json package.json
COPY yarn.lock yarn.lock

RUN yarn --frozen-lockfile

COPY . . 

RUN yarn vite build

FROM golang:1.20-alpine as go

WORKDIR /src

COPY go.mod go.mod
COPY go.sum go.sum

RUN go mod download

COPY cmd/ ./cmd/

RUN go build -o server ./cmd/main.go


FROM alpine as prod

WORKDIR /app

COPY --from=go /src/server ./server
COPY --from=node /src/dist/ ./dist/

CMD [ "/app/server" ]