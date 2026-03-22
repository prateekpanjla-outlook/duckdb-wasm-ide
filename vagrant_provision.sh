#!/bin/bash
set -e

echo "=== DuckDB WASM IDE — VM Provisioning ==="
echo "All operations use native VM filesystem only (no synced folders)"

# Prevent interactive prompts
export DEBIAN_FRONTEND=noninteractive

# ---- System packages ----
echo ">>> Installing system packages..."
apt-get update -qq
apt-get install -y -qq curl git build-essential python3 python3-pip

# ---- Node.js 20 LTS ----
echo ">>> Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y -qq nodejs

# ---- PostgreSQL 16 ----
echo ">>> Installing PostgreSQL 16..."
apt-get install -y -qq postgresql postgresql-contrib

# Configure PostgreSQL: allow local connections with password
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';" 2>/dev/null || true
sudo -u postgres createdb duckdb_ide 2>/dev/null || true

# Allow connections from localhost with password auth
sed -i 's/local\s*all\s*postgres\s*peer/local all postgres md5/' /etc/postgresql/*/main/pg_hba.conf
sed -i 's/local\s*all\s*all\s*peer/local all all md5/' /etc/postgresql/*/main/pg_hba.conf

# Allow connections from host machine
echo "host all all 0.0.0.0/0 md5" >> /etc/postgresql/*/main/pg_hba.conf
sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" /etc/postgresql/*/main/postgresql.conf

systemctl restart postgresql

# ---- Clone project (native filesystem) ----
echo ">>> Cloning project to native filesystem..."
PROJECT_DIR=/home/vagrant/duckdb-wasm-ide
if [ -d "$PROJECT_DIR" ]; then
    cd "$PROJECT_DIR" && git pull
else
    git clone https://github.com/prateekpanjla-outlook/duckdb-wasm-ide.git "$PROJECT_DIR"
fi
chown -R vagrant:vagrant "$PROJECT_DIR"

# ---- Backend setup ----
echo ">>> Setting up backend..."
cd "$PROJECT_DIR/server"
npm install --silent

# Create .env for server
cat > "$PROJECT_DIR/server/.env" << 'ENVEOF'
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=duckdb_ide
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=vagrant-dev-secret-key-change-in-production
JWT_EXPIRES_IN=7d
ENVEOF

# Initialize and seed database
echo ">>> Initializing database..."
cd "$PROJECT_DIR/server"
node -e "
  import('./utils/initDatabase.js').then(m => m.initDatabase ? m.initDatabase() : m.default()).then(() => {
    console.log('Database initialized');
    process.exit(0);
  }).catch(e => {
    console.error('DB init failed:', e.message);
    process.exit(1);
  });
" || echo "DB init: will retry manually"

echo ">>> Seeding database..."
node -e "
  import('./seed/seedQuestions.js').then(m => m.seedQuestions ? m.seedQuestions() : m.default()).then(() => {
    console.log('Questions seeded');
    process.exit(0);
  }).catch(e => {
    console.error('Seed failed:', e.message);
    process.exit(1);
  });
" || echo "Seed: will retry manually"

# ---- Frontend dependencies + Playwright ----
echo ">>> Installing frontend dependencies..."
cd "$PROJECT_DIR"
npm install --silent

echo ">>> Installing Playwright browsers..."
npx playwright install --with-deps chromium

# ---- Convenience: start services script ----
cat > /home/vagrant/start-services.sh << 'STARTEOF'
#!/bin/bash
echo "Starting PostgreSQL..."
sudo systemctl start postgresql

echo "Starting Express backend (port 3000)..."
cd /home/vagrant/duckdb-wasm-ide/server
node server.js &
sleep 2

echo "Starting static file server (port 8888)..."
cd /home/vagrant/duckdb-wasm-ide
python3 server.py 8888 &
sleep 1

echo ""
echo "=== Services running ==="
echo "  Frontend: http://localhost:8888  (Windows: http://localhost:8903)"
echo "  Backend:  http://localhost:3000  (Windows: http://localhost:3015)"
echo "  PostgreSQL: localhost:5432       (Windows: localhost:5447)"
STARTEOF
chmod +x /home/vagrant/start-services.sh
chown vagrant:vagrant /home/vagrant/start-services.sh

echo ""
echo "=== Provisioning complete ==="
echo "Run 'vagrant ssh' then './start-services.sh' to start everything"
