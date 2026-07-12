CREATE TABLE IF NOT EXISTS server_transfers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id     UUID REFERENCES servers(id) ON DELETE CASCADE,
  old_node_id   UUID REFERENCES nodes(id),
  new_node_id   UUID REFERENCES nodes(id),
  old_allocation_id UUID REFERENCES allocations(id),
  new_allocation_id UUID REFERENCES allocations(id),
  status        VARCHAR(50) DEFAULT 'pending',
  error         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
