# CampfireValley Backend Docker Configuration
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create party_box directory
RUN mkdir -p /app/party_box

# Expose MCP server port
EXPOSE 8080

# Set environment variables
ENV PYTHONPATH=/app
ENV OLLAMA_URL=http://host.docker.internal:11434
ENV REDIS_URL=redis://redis:6379
ENV PARTY_BOX_PATH=/app/party_box

# Run the MCP server
CMD ["python", "mcp_server.py"]