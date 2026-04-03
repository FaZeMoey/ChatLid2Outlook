-- OAuth tokens (encrypted at rest)
CREATE TABLE IF NOT EXISTS tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,           -- 'microsoft' or 'ghl'
  owner_id TEXT NOT NULL,           -- staff_id for microsoft, location_id for ghl
  access_token TEXT NOT NULL,       -- encrypted
  refresh_token TEXT,               -- encrypted
  expires_at INTEGER,               -- unix timestamp
  extra JSON,                       -- additional data (e.g. microsoft user email)
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(provider, owner_id)
);

-- Staff mappings: links GHL users to their Microsoft/Outlook identity
CREATE TABLE IF NOT EXISTS staff_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ghl_user_id TEXT NOT NULL UNIQUE,
  ghl_user_name TEXT,
  microsoft_user_id TEXT,           -- from Graph /me
  microsoft_email TEXT,
  outlook_calendar_id TEXT,         -- defaults to primary calendar
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Sync map: deduplication — links GHL appointment IDs to Outlook event IDs
CREATE TABLE IF NOT EXISTS sync_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ghl_appointment_id TEXT,
  outlook_event_id TEXT,
  staff_mapping_id INTEGER REFERENCES staff_mappings(id),
  ghl_updated_at TEXT,
  outlook_updated_at TEXT,
  last_sync_direction TEXT,         -- 'ghl_to_outlook' or 'outlook_to_ghl'
  last_synced_at TEXT DEFAULT (datetime('now')),
  UNIQUE(ghl_appointment_id),
  UNIQUE(outlook_event_id)
);

-- Sync log: audit trail
CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  direction TEXT NOT NULL,           -- 'ghl_to_outlook' or 'outlook_to_ghl'
  action TEXT NOT NULL,              -- 'create', 'update', 'delete'
  ghl_appointment_id TEXT,
  outlook_event_id TEXT,
  staff_mapping_id INTEGER,
  status TEXT NOT NULL,              -- 'success', 'error', 'conflict'
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Microsoft Graph webhook subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_mapping_id INTEGER REFERENCES staff_mappings(id),
  subscription_id TEXT NOT NULL UNIQUE,
  resource TEXT NOT NULL,
  expiration_date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
