# Build stage: compile the example with the .NET SDK.
FROM mcr.microsoft.com/dotnet/sdk:10.0.301-alpine3.24 AS build
WORKDIR /src
COPY FoxbitExample.csproj ./
RUN dotnet restore FoxbitExample.csproj
COPY Program.cs ./
RUN dotnet publish FoxbitExample.csproj -c Release -o /app --no-restore

# Runtime stage: only the compiled app on top of the .NET runtime.
FROM mcr.microsoft.com/dotnet/runtime:10.0.9-alpine3.24
WORKDIR /app
COPY --from=build /app ./
ENTRYPOINT ["dotnet", "FoxbitExample.dll"]
