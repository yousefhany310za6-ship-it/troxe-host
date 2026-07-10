CREATE TABLE IF NOT EXISTS nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  location_id UUID REFERENCES locations(id),
  fqdn VARCHAR(255) NOT NULL,
  public_ip INET NOT NULL,
  private_ip INET,
  daemon_token_id VARCHAR(32) NOT NULL,
  daemon_token_hash VARCHAR(255) NOT NULL,
  daemon_listen_port INT DEFAULT 8080,
  sftp_port INT DEFAULT 2022,
  total_memory_mb INT NOT NULL,
  total_disk_mb INT NOT NULL,
  allocated_memory_mb INT DEFAULT 0,
  allocated_disk_mb INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'online',
  maintenance_mode BOOLEAN DEFAULT false,
  last_heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_nodes_location ON nodes(location_id);
CREATE INDEX idx_nodes_status ON nodes(status);
