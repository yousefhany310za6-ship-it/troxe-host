CREATE TABLE IF NOT EXISTS eggs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  nest_id UUID REFERENCES nests(id),
  docker_image VARCHAR(255) NOT NULL,
  startup_command TEXT NOT NULL,
  install_script TEXT,
  config_files JSONB DEFAULT '[]',
  variables JSONB DEFAULT '[]',
  config_from UUID REFERENCES eggs(id),
  copy_script_from UUID REFERENCES eggs(id),
  max_databases INT DEFAULT 0,
  max_allocations INT DEFAULT 1,
  max_backups INT DEFAULT 5,
  default_memory_mb INT DEFAULT 1024,
  default_disk_mb INT DEFAULT 10240,
  default_cpu_percent DECIMAL(5,2) DEFAULT 100,
  default_pid_limit INT DEFAULT 1024,
  security_overrides JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_eggs_nest ON eggs(nest_id);
