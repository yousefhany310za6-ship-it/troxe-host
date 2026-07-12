CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_on_install  BOOLEAN DEFAULT true,
  email_on_crash    BOOLEAN DEFAULT true,
  email_on_remove   BOOLEAN DEFAULT true,
  email_on_api_key  BOOLEAN DEFAULT true,
  updated_at        TIMESTAMPTZ DEFAULT now()
);
