CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(32) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  totp_secret VARCHAR(64),
  totp_enabled BOOLEAN DEFAULT false,
  recovery_codes TEXT[] DEFAULT '{}',
  root_admin BOOLEAN DEFAULT false,
  suspended BOOLEAN DEFAULT false,
  last_login_at TIMESTAMPTZ,
  last_login_ip INET,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
