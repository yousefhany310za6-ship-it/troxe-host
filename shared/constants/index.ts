export const API_PREFIX = "/api/v1";

export const CLIENT_API = `${API_PREFIX}/client`;
export const ADMIN_API = `${API_PREFIX}/admin`;
export const REMOTE_API = `${API_PREFIX}/remote`;

export const WEBSOCKET_EVENTS = {
  AUTH: "auth",
  SEND_COMMAND: "send command",
  SET_STATE: "set state",
  CONSOLE_OUTPUT: "console output",
  STATUS: "status",
  STATS: "stats",
  TOKEN_EXPIRING: "token expiring",
  JWT_ERROR: "jwt error",
  DAEMON_MESSAGE: "daemon message",
} as const;

export const SERVER_STATES = {
  START: "start",
  STOP: "stop",
  RESTART: "restart",
  KILL: "kill",
} as const;

export const KEY_PREFIXES = {
  CLIENT: "txc_",
  ADMIN: "txa_",
} as const;

export const PERMISSIONS = {
  CONTROL_START: "control.start",
  CONTROL_STOP: "control.stop",
  CONTROL_RESTART: "control.restart",
  CONTROL_CONSOLE: "control.console",
  FILE_READ: "file.read",
  FILE_WRITE: "file.write",
  FILE_DELETE: "file.delete",
  FILE_UPLOAD: "file.upload",
  FILE_CREATE: "file.create",
  BACKUP_CREATE: "backup.create",
  BACKUP_READ: "backup.read",
  BACKUP_DELETE: "backup.delete",
  DATABASE_CREATE: "database.create",
  DATABASE_READ: "database.read",
  DATABASE_DELETE: "database.delete",
  SCHEDULE_CREATE: "schedule.create",
  SCHEDULE_READ: "schedule.read",
  SCHEDULE_DELETE: "schedule.delete",
  WEBSOCKET_CONNECT: "websocket.connect",
} as const;

export const JOB_TYPES = {
  SERVER_CREATE: "server.create",
  SERVER_INSTALL: "server.install",
  SERVER_START: "server.start",
  SERVER_STOP: "server.stop",
  SERVER_RESTART: "server.restart",
  SERVER_DELETE: "server.delete",
  BACKUP_CREATE: "backup.create",
  BACKUP_DELETE: "backup.delete",
  BACKUP_RESTORE: "backup.restore",
} as const;

export const EVENT_TYPES = {
  SERVER_CREATED: "server.created",
  SERVER_STARTED: "server.started",
  SERVER_STOPPED: "server.stopped",
  SERVER_CRASHED: "server.crashed",
  SERVER_INSTALLED: "server.installed",
  SERVER_INSTALL_FAILED: "server.install_failed",
  BACKUP_CREATED: "backup.created",
  BACKUP_COMPLETED: "backup.completed",
  BACKUP_FAILED: "backup.failed",
  NODE_ONLINE: "node.online",
  NODE_OFFLINE: "node.offline",
  NODE_HEARTBEAT: "node.heartbeat",
} as const;
