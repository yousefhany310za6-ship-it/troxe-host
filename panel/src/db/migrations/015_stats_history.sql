CREATE TABLE IF NOT EXISTS server_stats_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id     UUID REFERENCES servers(id) ON DELETE CASCADE,
  memory_used   BIGINT DEFAULT 0,
  cpu_usage     DECIMAL(5,2) DEFAULT 0,
  disk_used     BIGINT DEFAULT 0,
  network_rx    BIGINT DEFAULT 0,
  network_tx    BIGINT DEFAULT 0,
  uptime        INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stats_history_server_time ON server_stats_history(server_id, created_at);
