CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  actor_type VARCHAR(50) NOT NULL,
  event VARCHAR(100) NOT NULL,
  subject_type VARCHAR(50),
  subject_id UUID,
  data JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_activity_logs_actor ON activity_logs(actor_id);
CREATE INDEX idx_activity_logs_event ON activity_logs(event);
CREATE INDEX idx_activity_logs_subject ON activity_logs(subject_type, subject_id);
CREATE INDEX idx_activity_logs_created ON activity_logs(created_at);
