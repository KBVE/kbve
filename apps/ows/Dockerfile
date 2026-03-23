# OWS (Open World Server) — multi-service .NET 8 build
# Builds all 5 deployable services from one Dockerfile using --target.
#
# Usage:
#   docker build --target publicapi -t kbve/ows-publicapi .
#   docker build --target instancemanagement -t kbve/ows-instancemanagement .
#   docker build --target characterpersistence -t kbve/ows-characterpersistence .
#   docker build --target globaldata -t kbve/ows-globaldata .
#   docker build --target management -t kbve/ows-management .
#   docker build -t kbve/ows .  (default: publicapi)

# ============================================================================
# [STAGE: restore] — Restore all .NET dependencies (shared across services)
# ============================================================================
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS restore

WORKDIR /src

# Copy only .csproj files first for layer caching
COPY ows-shared/OWSShared.csproj ows-shared/
COPY ows-data/OWSData.csproj ows-data/
COPY ows-external-login/OWSExternalLoginProviders.csproj ows-external-login/
COPY ows-public-api/OWSPublicAPI.csproj ows-public-api/
COPY ows-instance-management/OWSInstanceManagement.csproj ows-instance-management/
COPY ows-character-persistence/OWSCharacterPersistence.csproj ows-character-persistence/
COPY ows-global-data/OWSGlobalData.csproj ows-global-data/
COPY ows-management/OWSManagement.csproj ows-management/
COPY ows-instance-launcher/OWSInstanceLauncher.csproj ows-instance-launcher/
COPY ows-benchmarks/OWSBenchmarks.csproj ows-benchmarks/
COPY ows-tests/OWSTests.csproj ows-tests/
COPY OWS.sln .

RUN dotnet restore OWS.sln

# ============================================================================
# [STAGE: source] — Copy all source code (shared across services)
# ============================================================================
FROM restore AS source

COPY ows-shared/ ows-shared/
COPY ows-data/ ows-data/
COPY ows-external-login/ ows-external-login/
COPY ows-public-api/ ows-public-api/
COPY ows-instance-management/ ows-instance-management/
COPY ows-character-persistence/ ows-character-persistence/
COPY ows-global-data/ ows-global-data/
COPY ows-management/ ows-management/

# ============================================================================
# [STAGE: build-publicapi]
# ============================================================================
FROM source AS build-publicapi
RUN dotnet publish ows-public-api/OWSPublicAPI.csproj -c Release -o /app/publish --no-restore

# ============================================================================
# [STAGE: build-instancemanagement]
# ============================================================================
FROM source AS build-instancemanagement
RUN dotnet publish ows-instance-management/OWSInstanceManagement.csproj -c Release -o /app/publish --no-restore

# ============================================================================
# [STAGE: build-characterpersistence]
# ============================================================================
FROM source AS build-characterpersistence
RUN dotnet publish ows-character-persistence/OWSCharacterPersistence.csproj -c Release -o /app/publish --no-restore

# ============================================================================
# [STAGE: build-globaldata]
# ============================================================================
FROM source AS build-globaldata
RUN dotnet publish ows-global-data/OWSGlobalData.csproj -c Release -o /app/publish --no-restore

# ============================================================================
# [STAGE: build-management] — includes Vue 3 frontend
# ============================================================================
FROM source AS build-management-dotnet
RUN dotnet publish ows-management/OWSManagement.csproj -c Release -o /app/publish --no-restore

FROM node:24-alpine AS build-management-vue
WORKDIR /wwwroot
COPY ows-management/wwwroot/package.json ows-management/wwwroot/package-lock.json* ./
RUN npm ci --ignore-scripts 2>/dev/null || npm install --ignore-scripts
COPY ows-management/wwwroot/ .
RUN npm run build

# ============================================================================
# Runtime base — HTTP only (no HTTPS certs in containers)
# ============================================================================
FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine AS runtime-base
ENV ASPNETCORE_URLS=http://+:80
EXPOSE 80

# ============================================================================
# Final service images
# ============================================================================
FROM runtime-base AS publicapi
WORKDIR /app
COPY --from=build-publicapi /app/publish .
ENTRYPOINT ["dotnet", "OWSPublicAPI.dll"]

FROM runtime-base AS instancemanagement
WORKDIR /app
COPY --from=build-instancemanagement /app/publish .
ENTRYPOINT ["dotnet", "OWSInstanceManagement.dll"]

FROM runtime-base AS characterpersistence
WORKDIR /app
COPY --from=build-characterpersistence /app/publish .
ENTRYPOINT ["dotnet", "OWSCharacterPersistence.dll"]

FROM runtime-base AS globaldata
WORKDIR /app
COPY --from=build-globaldata /app/publish .
ENTRYPOINT ["dotnet", "OWSGlobalData.dll"]

FROM runtime-base AS management
WORKDIR /app
COPY --from=build-management-dotnet /app/publish .
COPY --from=build-management-vue /wwwroot/dist ./wwwroot/dist
ENTRYPOINT ["dotnet", "OWSManagement.dll"]
