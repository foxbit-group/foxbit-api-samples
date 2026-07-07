FROM golang:1.26.4-alpine3.24 AS build
WORKDIR /src
COPY go.mod main.go ./
RUN CGO_ENABLED=0 go build -o /out/foxbit-example .

FROM alpine:3.24.1
# CA certificates are needed for TLS; copy them from the build image instead
# of installing a package.
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /out/foxbit-example /usr/local/bin/foxbit-example
CMD ["foxbit-example"]
