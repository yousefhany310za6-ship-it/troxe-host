CREATE TABLE IF NOT EXISTS allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID REFERENCES nodes(id) ON DELETE CASCADE,
  ip INET NOT NULL,
  port INT NOT NULL,
  server_id UUID,
  allocated_at TIMESTAMPTZ,
  UNIQUE(node_id, ip, port)
);

CREATE INDEX idx_allocations_node ON allocations(node_id);
CREATE INDEX idx_allocations_server ON allocations(server_id);
