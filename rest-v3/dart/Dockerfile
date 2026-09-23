FROM dart:3.12.2 AS build

WORKDIR /app

COPY pubspec.yaml pubspec.lock ./
RUN dart pub get

COPY bin/ bin/
RUN dart compile exe bin/main.dart -o /app/example

# Minimal runtime image: the AOT binary plus the Dart runtime libraries
# (which include the root certificates needed for HTTPS).
FROM scratch
COPY --from=build /runtime/ /
COPY --from=build /app/example /app/example

CMD ["/app/example"]
