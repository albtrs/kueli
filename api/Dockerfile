FROM golang:1.22

WORKDIR /workspace

RUN go install github.com/cosmtrek/air@v1.51.0

COPY go.mod go.sum ./
RUN go mod download

EXPOSE 8080

CMD ["air", "-c", ".air.toml"]
