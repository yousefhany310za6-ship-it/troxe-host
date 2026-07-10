export type ServerStatus =
  | "install_pending"
  | "installing"
  | "installing_failed"
  | "running"
  | "starting"
  | "stopping"
  | "stopped"
  | "crashed";

export type NodeType = "online" | "offline" | "maintenance";

export type ActorType = "user" | "api_key" | "daemon" | "system";

export interface User {
  id: string;
  username: string;
  email: string;
  totpEnabled: boolean;
  rootAdmin: boolean;
  suspended: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Node {
  id: string;
  name: string;
  locationId: string;
  fqdn: string;
  publicIp: string;
  privateIp: string | null;
  daemonListenPort: number;
  sftpPort: number;
  totalMemoryMb: number;
  totalDiskMb: number;
  allocatedMemoryMb: number;
  allocatedDiskMb: number;
  status: NodeType;
  maintenanceMode: boolean;
  lastHeartbeatAt: Date | null;
  createdAt: Date;
}

export interface Server {
  id: string;
  name: string;
  nodeId: string;
  ownerId: string;
  eggId: string;
  allocationId: string;
  memoryMb: number;
  diskMb: number;
  cpuPercent: number;
  pidLimit: number;
  status: ServerStatus;
  runtimeId: string | null;
  runtimeType: "docker" | "containerd" | "podman";
  dockerImage: string;
  startupCommand: string;
  environment: Record<string, string>;
  installedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Allocation {
  id: string;
  nodeId: string;
  ip: string;
  port: number;
  serverId: string | null;
  allocatedAt: Date | null;
}

export interface Egg {
  id: string;
  name: string;
  nestId: string;
  dockerImage: string;
  startupCommand: string;
  installScript: string | null;
  configFiles: string[];
  variables: EggVariable[];
  configFrom: string | null;
  copyScriptFrom: string | null;
  maxDatabases: number;
  maxAllocations: number;
  maxBackups: number;
  defaultMemoryMb: number;
  defaultDiskMb: number;
  defaultCpuPercent: number;
  defaultPidLimit: number;
  securityOverrides: Record<string, unknown>;
  createdAt: Date;
}

export interface EggVariable {
  name: string;
  description?: string;
  defaultValue: string;
  type: "string" | "number" | "boolean" | "option";
  options?: string[];
  envVariable: string;
}

export interface Nest {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
}

export interface Backup {
  id: string;
  serverId: string;
  name: string;
  storagePath: string | null;
  sizeBytes: number | null;
  sha256Hash: string | null;
  status: "building" | "completed" | "failed" | "restoring";
  completedAt: Date | null;
  createdAt: Date;
}

export interface Database {
  id: string;
  serverId: string;
  databaseHostId: string;
  name: string;
  username: string;
  remote: string;
  createdAt: Date;
}

export interface Schedule {
  id: string;
  serverId: string;
  name: string;
  cronExpression: string;
  isActive: boolean;
  tasks: ScheduleTask[];
  lastRunAt: Date | null;
  createdAt: Date;
}

export interface ScheduleTask {
  type: "command" | "power" | "backup" | "announce";
  payload: string;
}

export interface Subuser {
  id: string;
  userId: string;
  serverId: string;
  permissions: ServerPermissions;
  createdAt: Date;
}

export interface ServerPermissions {
  control: {
    start: boolean;
    stop: boolean;
    restart: boolean;
    console: boolean;
  };
  file: {
    read: boolean;
    write: boolean;
    delete: boolean;
    upload: boolean;
    create: boolean;
  };
  backup: {
    create: boolean;
    read: boolean;
    delete: boolean;
  };
  database: {
    create: boolean;
    read: boolean;
    delete: boolean;
  };
  schedule: {
    create: boolean;
    read: boolean;
    delete: boolean;
  };
  websocket: {
    connect: boolean;
  };
}

export interface ActivityLog {
  id: string;
  actorId: string | null;
  actorType: ActorType;
  event: string;
  subjectType: string | null;
  subjectId: string | null;
  data: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  permissions: Record<string, boolean>;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: "pending" | "active" | "completed" | "failed" | "delayed";
  attempts: number;
  maxAttempts: number;
  error: string | null;
  serverId: string | null;
  nodeId: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface Location {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
}

export interface DatabaseHost {
  id: string;
  name: string;
  host: string;
  port: number;
  maxDatabases: number;
  createdAt: Date;
}

export interface WebSocketMessage {
  event: string;
  args: string[];
}

export interface ServerStats {
  memoryBytes: number;
  memoryLimitBytes: number;
  cpuAbsolute: number;
  network: {
    rxBytes: number;
    txBytes: number;
  };
  uptime: number;
  state: string;
  diskBytes: number;
}
