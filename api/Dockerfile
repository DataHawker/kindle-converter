FROM node:18-alpine

# Install sudo for file operations
RUN apk add --no-cache sudo

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Create directories
RUN mkdir -p /uploads /converted

EXPOSE 5678

CMD ["node", "server.js"]