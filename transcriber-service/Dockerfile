# Dockerfile for Transcriber Service

FROM node:20-alpine

# Install OS-level dependencies for ffmpeg (fluent-ffmpeg needs the binary)
# Note: @ffmpeg-installer/ffmpeg provides its own binary, but adding ffmpeg ensures fallback
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code and build
COPY . .
RUN npm run build

# Expose the API port
EXPOSE 4000

# Start the application
CMD ["npm", "start"]
