CREATE TABLE IF NOT EXISTS servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  node_id UUID REFERENCES nodes(id),
  owner_id UUID REFERENCES users(id),
  egg_id UUID REFERENCES eggs(id),
  allocation_id UUID,
  memory_mb INT NOT NULL DEFAULT 1024,
  disk_mb INT NOT NULL DEFAULT 10240,
  cpu_percent DECIMAL(5,2) DEFAULT 100,
  pid_limit INT DEFAULT 1024,
  status VARCHAR(30) DEFAULT 'install_pending',
  runtime_id VARCHAR(64),
  runtime_type VARCHAR(20) DEFAULT 'docker',
  docker_image VARCHAR(255) NOT NULL,
  startup_command TEXT NOT NULL,
  environment JSONB DEFAULT '{}',
  installed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_servers_node ON servers(node_id);
CREATE INDEX idx_servers_owner ON servers(owner_id);
CREATE INDEX idx_servers_egg ON servers(egg_id);
CREATE INDEX idx_servers_status ON servers(status);
