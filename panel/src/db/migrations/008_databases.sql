CREATE TABLE IF NOT EXISTS database_hosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  host VARCHAR(255) NOT NULL,
  port INT DEFAULT 3306,
  username VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  max_databases INT DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS databases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  database_host_id UUID REFERENCES database_hosts(id),
  name VARCHAR(100) NOT NULL,
  username VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  remote VARCHAR(255) DEFAULT '%',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_databases_server ON databases(server_id);
