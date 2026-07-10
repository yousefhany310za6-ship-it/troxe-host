CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'pending',
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  error TEXT,
  server_id UUID REFERENCES servers(id),
  node_id UUID REFERENCES nodes(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  subject_type VARCHAR(50),
  subject_id UUID,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_type ON jobs(type);
CREATE INDEX idx_jobs_server ON jobs(server_id);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_subject ON events(subject_type, subject_id);
CREATE INDEX idx_events_created ON events(created_at);
