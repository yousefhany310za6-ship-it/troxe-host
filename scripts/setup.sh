#!/bin/bash
set -e

echo "Troxe Host Setup"
echo "================"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Docker is not installed. Please install Docker first."
    echo "https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker compose &> /dev/null; then
    echo "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Copy .env if not exists
if [ ! -f .env ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    
    # Generate random secrets
    JWT_SECRET=$(openssl rand -hex 32)
    JWT_COOKIE_SECRET=$(openssl rand -hex 16)
    ENCRYPTION_KEY=$(openssl rand -base64 32)
    DB_PASSWORD=$(openssl rand -hex 16)
    
    # Update .env with generated secrets
    sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
    sed -i "s/JWT_COOKIE_SECRET=.*/JWT_COOKIE_SECRET=$JWT_COOKIE_SECRET/" .env
    sed -i "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$ENCRYPTION_KEY/" .env
    sed -i "s/DB_PASSWORD=.*/DB_PASSWORD=$DB_PASSWORD/" .env
    
    echo ".env created with random secrets."
else
    echo ".env already exists, skipping."
fi

echo ""
echo "Building and starting containers..."
echo ""

docker compose build
docker compose up -d

echo ""
echo "Waiting for services to start..."
sleep 10

echo ""
echo "Running database migrations..."
docker compose exec panel npm run db:migrate --workspace=panel

echo ""
echo "Seeding database with default data..."
docker compose exec panel npm run db:seed --workspace=panel

echo ""
echo "=================================="
echo "Troxe Host is ready!"
echo "=================================="
echo ""
echo "Frontend:  http://localhost:3000"
echo "API:       http://localhost:3001"
echo "Health:    http://localhost:3001/health"
echo ""
echo "Admin Credentials:"
echo "  Email:    admin@troxe.dev"
echo "  Password: admin12345"
echo ""
echo "IMPORTANT: Change these credentials in production!"
echo ""
