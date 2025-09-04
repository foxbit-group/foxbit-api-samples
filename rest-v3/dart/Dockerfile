FROM dart:3.7.3 AS build

WORKDIR /app

COPY pubspec.* ./

RUN dart pub get

COPY . .

CMD ["dart", "run", "bin/main.dart"]
