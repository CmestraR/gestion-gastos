# Imagen base oficial y moderna de Node.js 20 LTS sobre Debian Bookworm (estable y con repositorios activos)
FROM node:20-bookworm-slim

# Instalar dependencias del sistema y Git
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Instalar EAS CLI de Expo globalmente dentro del contenedor
RUN npm install -g eas-cli

# Directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiar manifiestos de dependencias
COPY package*.json ./

# Instalar dependencias aisladas en el contenedor
RUN npm install

# Copiar el resto del código del proyecto
COPY . .

# Variables de entorno para Expo Metro Bundler en Docker
ENV EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0
ENV REACT_NATIVE_PACKAGER_HOSTNAME=localhost

# Exponer el puerto de Metro Bundler (8081)
EXPOSE 8081

# Comando por defecto: iniciar el servidor de desarrollo de Expo con túnel para celular
CMD ["npx", "expo", "start", "--tunnel"]
