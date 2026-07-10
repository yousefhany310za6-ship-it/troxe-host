CREATE TABLE IF NOT EXISTS backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  storage_path VARCHAR(500),
  size_bytes BIGINT,
  sha256_hash VARCHAR(64),
  status VARCHAR(20) DEFAULT 'building',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_backups_server ON backups(server_id);
