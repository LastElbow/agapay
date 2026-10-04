# Base image for building
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src

# Copy the project file and restore dependencies
# Note: Adjust the path if your csproj is in a different subdirectory
COPY ["agapay-backend/agapay-backend.csproj", "agapay-backend/"]
RUN dotnet restore "agapay-backend/agapay-backend.csproj"

# Copy the rest of the source code
COPY . .
WORKDIR "/src/agapay-backend"

# Build the application
RUN dotnet build "agapay-backend.csproj" -c $BUILD_CONFIGURATION -o /app/build

# Publish the application
FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "agapay-backend.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

# Final stage/image
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=publish /app/publish .

# Configure for Railway
# Railway will route traffic to this port. 
# We explicitly set it to 8080 and expose it.
ENV ASPNETCORE_HTTP_PORTS=${PORT:-8080}
EXPOSE 8080

ENTRYPOINT ["dotnet", "agapay-backend.dll"]
