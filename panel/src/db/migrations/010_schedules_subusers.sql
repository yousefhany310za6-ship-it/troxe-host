CREATE TABLE IF NOT EXISTS schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  cron_expression VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  tasks JSONB DEFAULT '[]',
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subusers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, server_id)
);

CREATE INDEX idx_schedules_server ON schedules(server_id);
CREATE INDEX idx_subusers_server ON subusers(server_id);
CREATE INDEX idx_subusers_user ON subusers(user_id);
