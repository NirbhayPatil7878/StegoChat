FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy project files
COPY . /app

# Install system deps required for Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libjpeg-dev \
    zlib1g-dev \
 && rm -rf /var/lib/apt/lists/*

# Install python deps
RUN python -m pip install --upgrade pip setuptools wheel \
 && pip install --no-cache-dir -r backend/requirements.txt

# Expose port used by Flask
EXPOSE 5000

# Ensure uploads directory exists
RUN mkdir -p /app/uploads && chmod -R 755 /app/uploads

ENV FLASK_ENV=production

# Start the Flask app
CMD ["python", "backend/app.py"]
