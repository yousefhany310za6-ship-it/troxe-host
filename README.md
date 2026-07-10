# Troxe Host

A modern, self-hosted game server management panel built with security-first architecture. Manage game servers (Minecraft, Rust, Valheim, and more) through a beautiful web interface with full Docker container isolation.

![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-0.1.0-green)

---

## Table of Contents

- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Frontend Architecture](#frontend-architecture)
- [Node Agent](#node-agent)
- [Security](#security)
- [Internationalization](#internationalization)
- [Docker Deployment](#docker-deployment)
- [Development Setup](#development-setup)
- [Default Credentials](#default-credentials)

---

## Features

- **Server Management** - Create, start, stop, restart, reinstall, and delete game servers
- **Egg System** - Pre-configured templates (Minecraft Paper/Vanilla, Rust Oxide, Valheim) with custom Docker images, startup commands, and environment variables
- **Console Terminal** - Real-time WebSocket-based xterm.js console with command input
- **File Manager** - Browse, create, edit, rename, delete, upload, compress/decompress files
- **Backups** - Create, download, and delete server backups with configurable limits
- **Schedules** - Cron-based task scheduling (commands, power actions, backups, announcements)
- **Subusers** - Granular per-server permission sharing with other users
- **Resource Monitoring** - CPU, memory, disk, and network stats with history
- **Node Management** - Multi-node support with allocation pools, heartbeat monitoring, maintenance mode
- **Admin Dashboard** - User management, node/location/egg CRUD, system overview
- **Auth System** - JWT sessions, TOTP two-factor authentication, API keys, recovery codes
- **RBAC** - Role-based access control (admin, user, subuser with fine-grained permissions)
- **Theming Engine** - 5 built-in themes (Dark, Light, Midnight, Forest, Sunset) with CSS variable system
- **i18n** - 5 languages (English, Arabic with RTL, Spanish, French, German)
- **Activity Logging** - Full audit trail of all actions
- **Job Queue** - Async task processing via Redis + BullMQ

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER'S BROWSER                             │
│                                                                     │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐       │
│   │   Dashboard   │     │   Console    │     │  File Mgr    │       │
│   │   (Next.js)   │     │  (xterm.js)  │     │              │       │
│   └──────┬───────┘     └──────┬───────┘     └──────┬───────┘       │
│          │   REST API         │   WebSocket          │  REST API     │
└──────────┼───────────────────┼──────────────────────┼───────────────┘
           │                   │                      │
    ┌──────▼───────────────────▼──────────────────────▼───────┐
    │              NGINX REVERSE PROXY (port 80)              │
    │         /api/* ──> Panel   /* ──> Frontend               │
    │         WebSocket Upgrade Support                        │
    └──────┬──────────────────────────────────────┬───────────┘
           │                                      │
    ┌──────▼───────────┐                ┌─────────▼──────────┐
    │   PANEL API       │                │   NEXT.JS SSR      │
    │   (Fastify v5)    │                │   (Port 3000)      │
    │   (Port 3001)     │                │                    │
    │                   │                └────────────────────┘
    │  ┌─────────────┐  │
    │  │ Auth/JWT     │  │
    │  │ RBAC         │  │
    │  │ Zod Validate │  │
    │  └──────┬──────┘  │
    │         │         │
    │  ┌──────▼──────┐  │
    │  │  Event Bus   │──┼──────────────────────────────┐
    │  └──────┬──────┘  │                              │
    │         │         │                              │
    │  ┌──────▼──────┐  │    ┌──────────────────┐     │
    │  │  BullMQ     │  │    │  Redis (6379)     │     │
    │  │  Job Queue  │──┼───>│  Sessions + Queue  │     │
    │  └─────────────┘  │    └──────────────────┘     │
    │                   │                              │
    │  ┌─────────────┐  │    ┌──────────────────┐     │
    │  │  PostgreSQL  │<─┼───│  (5432)           │     │
    │  │  13 Tables   │  │    └──────────────────┘     │
    │  └─────────────┘  │                              │
    └───────────────────┘                              │
           │                                           │
    ┌──────▼───────────────────────────────────────────▼──┐
    │                   NODE AGENT (Go)                     │
    │                   (Port 8080)                         │
    │                                                       │
    │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
    │  │ Container Mgr │  │ File Ops     │  │ WebSocket  │ │
    │  │ (Docker SDK)  │  │ (Read/Write) │  │ Manager    │ │
    │  └──────┬───────┘  └──────────────┘  └────────────┘ │
    │         │                                            │
    │  ┌──────▼──────────────────────────────────────────┐ │
    │  │              Docker Containers                   │ │
    │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐        │ │
    │  │  │ Minecraft│ │  Rust    │ │ Valheim  │  ...   │ │
    │  │  │ (java_17)│ │ (rust)   │ │ (java_17)│        │ │
    │  │  └──────────┘ └──────────┘ └──────────┘        │ │
    │  │  cap-drop ALL, no-new-privileges, PID limits    │ │
    │  └─────────────────────────────────────────────────┘ │
    └───────────────────────────────────────────────────────┘
```

### Data Flow

1. **User Action** → Browser sends REST API request or opens WebSocket
2. **Nginx** routes `/api/*` to Fastify panel, `/*` to Next.js
3. **Panel API** authenticates via JWT cookie, validates with Zod, checks RBAC
4. **Database** stores all state in PostgreSQL (users, servers, nodes, allocations, etc.)
5. **Job Queue** dispatches async tasks (server deploy, backup, etc.) to BullMQ workers
6. **Node Agent** receives instructions, manages Docker containers via Docker SDK
7. **WebSocket** streams real-time console output from containers back to browser

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 14, React 18, TypeScript | SSR/CSR web interface |
| **Styling** | Tailwind CSS 3.4, CSS Variables | Responsive dark-theme UI |
| **State** | Zustand (auth), SWR (data) | Client-side state management |
| **Terminal** | xterm.js + addons | In-browser WebSocket console |
| **Backend** | Fastify 5, TypeScript | High-performance REST API |
| **Auth** | JWT, bcrypt, TOTP (otpauth) | Session + 2FA + API keys |
| **Validation** | Zod | Runtime type-safe validation |
| **Queue** | BullMQ + Redis | Async job processing |
| **Database** | PostgreSQL 15 | Primary data store |
| **Cache/PubSub** | Redis 7 | Sessions, queue, real-time |
| **WebSocket** | @fastify/websocket | Real-time console streaming |
| **Node Agent** | Go 1.22, Docker SDK | Container lifecycle management |
| **Reverse Proxy** | Nginx | Routing, WebSocket upgrade |
| **Tunnel** | Cloudflare Tunnel | Public HTTPS access |
| **i18n** | Custom provider + 5 locale files | Multi-language support |

---

## Project Structure

```
troxe-host/
├── panel/                          # Backend API (Fastify + TypeScript)
│   ├── src/
│   │   ├── server.ts               # Entry point - Fastify app setup
│   │   ├── config/
│   │   │   ├── env.ts              # Environment variable validation
│   │   │   ├── database.ts         # PostgreSQL connection pool
│   │   │   └── redis.ts            # Redis connection
│   │   ├── api/
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts         # Password hashing, API keys, encryption
│   │   │   │   └── rbac.ts         # Session auth, RBAC, permission checks
│   │   │   └── routes/
│   │   │       ├── auth.ts         # Register, login, logout, 2FA, API keys
│   │   │       ├── servers.ts      # Server CRUD, power, deploy, stats
│   │   │       ├── admin.ts        # Nodes, users, locations, eggs, system info
│   │   │       ├── files.ts        # File manager operations
│   │   │       ├── console.ts      # Console logs + WebSocket terminal
│   │   │       ├── backups.ts      # Backup create/delete/download
│   │   │       ├── schedules.ts    # Cron schedule CRUD
│   │   │       ├── subusers.ts     # Server subuser permissions
│   │   │       ├── server-settings.ts  # Server config, startup, network
│   │   │       ├── monitoring.ts   # CPU/memory/disk stats
│   │   │       └── themes.ts       # Theme CRUD + CSS generation
│   │   ├── db/
│   │   │   ├── migrate.ts          # Migration runner
│   │   │   ├── seed.ts             # Default data (admin, eggs, nests)
│   │   │   └── migrations/         # 13 SQL migration files
│   │   │       ├── 001_users.sql
│   │   │       ├── 002_locations.sql
│   │   │       ├── 003_nodes.sql
│   │   │       ├── 004_allocations.sql
│   │   │       ├── 005_nests.sql
│   │   │       ├── 006_eggs.sql
│   │   │       ├── 007_servers.sql
│   │   │       ├── 008_databases.sql
│   │   │       ├── 009_backups.sql
│   │   │       ├── 010_schedules_subusers.sql
│   │   │       ├── 011_api_keys.sql
│   │   │       ├── 012_activity_logs.sql
│   │   │       └── 013_jobs_events.sql
│   │   ├── events/
│   │   │   └── index.ts            # Event bus (pub/sub)
│   │   └── workers/
│   │       └── index.ts            # BullMQ job processor
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                       # Web UI (Next.js 14 + TypeScript)
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx          # Root layout with i18n provider
│   │   │   ├── page.tsx            # Landing page
│   │   │   ├── globals.css         # Tailwind + CSS variables (themes)
│   │   │   ├── auth/
│   │   │   │   ├── login/page.tsx  # Login with 2FA support
│   │   │   │   └── register/page.tsx
│   │   │   └── dashboard/
│   │   │       ├── layout.tsx      # Sidebar + header layout
│   │   │       ├── page.tsx        # Dashboard home (real stats)
│   │   │       ├── servers/
│   │   │       │   ├── page.tsx    # Server list
│   │   │       │   ├── new/page.tsx # Create server form
│   │   │       │   └── [id]/
│   │   │       │       ├── page.tsx        # Server detail + power
│   │   │       │       ├── console/page.tsx # xterm.js WebSocket
│   │   │       │       ├── files/page.tsx   # File manager
│   │   │       │       ├── backups/page.tsx
│   │   │       │       ├── schedules/page.tsx
│   │   │       │       └── settings/page.tsx
│   │   │       ├── nodes/page.tsx  # Admin: node management
│   │   │       ├── users/page.tsx  # Admin: user management
│   │   │       ├── locations/page.tsx
│   │   │       └── eggs/page.tsx
│   │   ├── components/
│   │   │   ├── auth-guard.tsx      # Auth protection wrapper
│   │   │   ├── language-switcher.tsx
│   │   │   └── ui/
│   │   │       ├── button.tsx
│   │   │       ├── card.tsx
│   │   │       └── badge.tsx
│   │   ├── hooks/
│   │   │   └── useServers.ts       # SWR server fetching hook
│   │   ├── stores/
│   │   │   └── auth.ts             # Zustand auth store
│   │   ├── lib/
│   │   │   ├── api.ts              # fetchApi wrapper
│   │   │   └── utils.ts            # cn() Tailwind merge helper
│   │   └── i18n/
│   │       ├── index.ts            # Locale definitions
│   │       ├── provider.tsx        # React context provider
│   │       └── locales/
│   │           ├── en.json         # English
│   │           ├── ar.json         # Arabic (RTL)
│   │           ├── es.json         # Spanish
│   │           ├── fr.json         # French
│   │           └── de.json         # German
│   ├── tailwind.config.ts          # Custom brand colors + theme mapping
│   ├── postcss.config.js
│   └── tsconfig.json
│
├── node-agent/                     # Node Daemon (Go)
│   ├── cmd/main.go                 # Entry point
│   ├── internal/
│   │   ├── auth/jwt.go             # JWT verification
│   │   ├── config/config.go        # Environment config
│   │   ├── container/
│   │   │   └── manager.go          # Docker container operations
│   │   ├── server/
│   │   │   ├── server.go           # HTTP routes + WebSocket
│   │   │   └── files.go            # File system operations
│   │   └── websocket/
│   │       └── manager.go          # WebSocket connection manager
│   └── go.mod
│
├── shared/                         # Shared types/constants
│   ├── types/index.ts              # TypeScript interfaces
│   ├── constants/index.ts          # Shared constants
│   ├── package.json
│   └── tsconfig.json
│
├── docker/
│   ├── Dockerfile.panel            # Multi-stage panel build
│   ├── Dockerfile.frontend         # Multi-stage frontend build
│   └── Caddyfile                   # Production reverse proxy
│
├── scripts/
│   └── setup.sh                    # One-command setup script
│
├── docker-compose.yml              # Production deployment
├── package.json                    # Root monorepo config
├── tsconfig.base.json              # Shared TypeScript config
└── .gitignore
```

---

## Database Schema

13 migration files create the following tables:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    users     │     │  locations   │     │    nests     │
│─────────────│     │─────────────│     │─────────────│
│ id (uuid)    │     │ id (uuid)    │     │ id (uuid)    │
│ username     │     │ name         │     │ name         │
│ email        │     │ description  │     │ description  │
│ password_hash│     │ created_at   │     │ created_at   │
│ totp_enabled │     └──────┬──────┘     └──────┬──────┘
│ totp_secret  │            │                    │
│ root_admin   │            │                    │
│ suspended    │     ┌──────▼──────┐     ┌──────▼──────┐
│ recovery     │     │    nodes    │     │    eggs      │
│ last_login   │     │─────────────│     │─────────────│
│ created_at   │     │ id (uuid)    │     │ id (uuid)    │
└──────┬───────┘     │ name         │     │ name         │
       │             │ location_id  │     │ nest_id      │
       │             │ fqdn         │     │ docker_image │
       │             │ public_ip    │     │ startup_cmd  │
       │             │ daemon_token │     │ variables    │
       │             │ total_mem_mb │     │ defaults     │
       │             │ total_disk_mb│     │ security     │
       │             │ status       │     └──────┬──────┘
       │             └──────┬──────┘            │
       │                    │                   │
       │             ┌──────▼──────┐            │
       │             │ allocations │            │
       │             │─────────────│            │
       │             │ id (uuid)    │            │
       │             │ node_id      │            │
       │             │ ip, port     │            │
       │             │ server_id    │            │
       │             └──────┬──────┘            │
       │                    │                   │
       │             ┌──────▼───────────────────▼──┐
       │             │         servers              │
       │             │─────────────────────────────│
       │             │ id (uuid)                    │
       ├─────────────│ owner_id (FK -> users)       │
       │             │ node_id (FK -> nodes)        │
       │             │ egg_id (FK -> eggs)          │
       │             │ allocation_id (FK)           │
       │             │ name, status                 │
       │             │ memory_mb, disk_mb, cpu_pct  │
       │             │ docker_image, startup_cmd    │
       │             │ environment (jsonb)          │
       │             │ runtime_id, uuid             │
       │             └──────┬──────────────────────┘
       │                    │
  ┌────▼──────┐  ┌──────────▼──────┐  ┌──────────────┐
  │ api_keys  │  │   backups       │  │  schedules    │
  │───────────│  │─────────────────│  │───────────────│
  │ key_hash  │  │ server_id       │  │ server_id     │
  │ key_pref  │  │ name, status    │  │ cron, command │
  │ user_id   │  │ size, path      │  │ action, data  │
  │ perms     │  │ created_at      │  │ active        │
  └───────────┘  └─────────────────┘  └───────────────┘

  ┌──────────────┐  ┌─────────────────┐  ┌──────────────┐
  │  subusers    │  │ activity_logs   │  │  jobs        │
  │──────────────│  │─────────────────│  │──────────────│
  │ server_id    │  │ actor_id        │  │ queue, name  │
  │ user_id      │  │ event           │  │ data (jsonb) │
  │ permissions  │  │ data, ip, ua    │  │ status       │
  └──────────────┘  │ created_at      │  │ attempts     │
                    └─────────────────┘  └──────────────┘

  ┌──────────────────┐
  │    databases      │
  │──────────────────│
  │ server_id         │
  │ name, host, port  │
  │ username, db_name  │
  │ password (enc)     │
  └──────────────────┘
```

---

## API Reference

All endpoints are prefixed with `/api/v1`.

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login (returns JWT cookie) |
| POST | `/auth/logout` | Clear session |
| GET | `/auth/me` | Get current user |
| POST | `/auth/2fa/enable` | Enable 2FA (returns QR code) |
| POST | `/auth/2fa/confirm` | Confirm 2FA with TOTP code |
| POST | `/auth/2fa/disable` | Disable 2FA |
| POST | `/auth/api-keys` | Create API key |
| GET | `/auth/api-keys` | List API keys |
| DELETE | `/auth/api-keys/:id` | Revoke API key |

### Servers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dashboard/stats` | Dashboard statistics |
| GET | `/servers` | List user's servers |
| POST | `/servers` | Create server (admin) |
| GET | `/servers/:id` | Server details |
| DELETE | `/servers/:id` | Delete server |
| POST | `/servers/:id/start` | Start server |
| POST | `/servers/:id/stop` | Stop server |
| POST | `/servers/:id/restart` | Restart server |
| POST | `/servers/:id/reinstall` | Reinstall server |

### Console
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/servers/:id/console` | Get recent console logs |
| POST | `/servers/:id/console` | Send console command |
| WS | `/servers/:id/console/ws` | WebSocket terminal stream |

### Files
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/servers/:id/files/list` | List directory contents |
| GET | `/servers/:id/files/*` | Read file content |
| PUT | `/servers/:id/files/*` | Write/update file |
| POST | `/servers/:id/files/create` | Create file or directory |
| DELETE | `/servers/:id/files/*` | Delete file or directory |
| POST | `/servers/:id/files/rename` | Rename/move file |
| POST | `/servers/:id/files/compress` | Compress files |
| POST | `/servers/:id/files/decompress` | Decompress archive |
| POST | `/servers/:id/files/upload` | Upload file (multipart) |

### Backups
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/servers/:id/backups` | List backups |
| POST | `/servers/:id/backups` | Create backup |
| DELETE | `/servers/:id/backups/:backupId` | Delete backup |
| GET | `/servers/:id/backups/:backupId/download` | Download backup |

### Schedules
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/servers/:id/schedules` | List schedules |
| POST | `/servers/:id/schedules` | Create schedule |
| PUT | `/servers/:id/schedules/:scheduleId` | Update schedule |
| DELETE | `/servers/:id/schedules/:scheduleId` | Delete schedule |
| POST | `/servers/:id/schedules/:scheduleId/run` | Run schedule now |

### Subusers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/servers/:id/subusers` | List subusers |
| POST | `/servers/:id/subusers` | Add subuser |
| PUT | `/servers/:id/subusers/:subuserId` | Update permissions |
| DELETE | `/servers/:id/subusers/:subuserId` | Remove subuser |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/nodes` | List nodes |
| GET | `/nodes/:id` | Node details |
| POST | `/nodes` | Create node |
| PUT | `/nodes/:id` | Update node |
| DELETE | `/nodes/:id` | Delete node |
| POST | `/nodes/:id/allocations` | Add allocation |
| DELETE | `/allocations/:id` | Remove allocation |
| POST | `/remote/heartbeat` | Node heartbeat |
| GET | `/locations` | List locations |
| POST | `/locations` | Create location |
| GET | `/eggs` | List eggs |
| GET | `/system/info` | System statistics |
| GET | `/users` | List all users |
| DELETE | `/users/:id` | Delete user |
| PATCH | `/users/:id/suspend` | Suspend/unsuspend |

### Other
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/servers/:id/settings` | Server settings |
| PUT | `/servers/:id/settings` | Update settings |
| GET | `/servers/:id/network` | Network allocations |
| GET | `/servers/:id/startup` | Startup config |
| GET | `/servers/:id/features` | Server features |
| GET | `/servers/:id/stats` | Resource stats |
| GET | `/servers/:id/stats/history` | Stats history |
| GET | `/nodes/:id/stats` | Node resource stats |
| GET | `/themes` | List themes |
| GET | `/themes/:name` | Get theme |
| POST | `/themes` | Create theme |
| PUT | `/themes/:id` | Update theme |
| DELETE | `/themes/:id` | Delete theme |
| GET | `/themes/:name/css` | Generate theme CSS |

---

## Frontend Architecture

### Routing (Next.js App Router)

```
/                        → Landing page
/auth/login              → Login (JWT + 2FA)
/auth/register           → Registration
/dashboard               → Stats overview (admin: system, user: personal)
/dashboard/servers       → Server list
/dashboard/servers/new   → Create server (admin)
/dashboard/servers/:id   → Server detail + power controls
/dashboard/servers/:id/console  → xterm.js WebSocket terminal
/dashboard/servers/:id/files    → File manager
/dashboard/servers/:id/backups  → Backup management
/dashboard/servers/:id/schedules → Cron scheduler
/dashboard/servers/:id/settings → Server configuration
/dashboard/nodes         → Node management (admin)
/dashboard/users         → User management (admin)
/dashboard/locations     → Location management (admin)
/dashboard/eggs          → Egg catalog (admin)
```

### State Management

- **Zustand** (`stores/auth.ts`) - Auth state: user object, login/logout, session check via `/auth/me`
- **SWR** (in-page) - Server data fetching with caching, revalidation, and error handling
- **React Context** (`i18n/provider.tsx`) - i18n locale state with localStorage persistence

### Design System

- **Tailwind CSS** with CSS custom properties for theming
- **Brand colors**: Indigo-based palette (`#6366f1`)
- **Dark mode** by default with `class` strategy
- **Shadcn-inspired** reusable components (Button, Card, Badge)
- **Responsive** sidebar + header layout

---

## Node Agent

The Go-based node agent runs on each game server machine and communicates with the panel via:

- **REST API** - Receives commands (start/stop/restart containers)
- **WebSocket** - Streams console I/O in real-time
- **Heartbeat** - Reports system stats to the panel

### Container Security

```yaml
Security Profile:
  - cap_drop: ALL           # Drop all Linux capabilities
  - no_new_privileges: true # Prevent privilege escalation
  - pid_limit: 1024         # Prevent fork bombs
  - memory_limit: Configurable per server
  - disk_limit: Configurable per server
  - network_isolation: Per-container networking
```

### Docker Integration

The node agent uses the Docker SDK for Go to:
- Pull Docker images (e.g., `ghcr.io/pterodactyl/yolks:java_17`)
- Create containers with resource limits and security profiles
- Start, stop, restart, and remove containers
- Stream stdout/stderr for console output
- Manage container file systems via mounted volumes

---

## Security

### Authentication Layers

1. **JWT Session Cookies** - HttpOnly, SameSite=Lax, 7-day expiry
2. **TOTP 2FA** - RFC 6238 compatible (Google Authenticator, Authy, etc.)
3. **API Keys** - `txc_` (client) and `txa_` (admin) prefixed, SHA-256 hashed
4. **Daemon Tokens** - Node-to-panel authentication for heartbeats

### Authorization (RBAC)

```
Root Admin ──────────> Full access to everything
    │
    ├── User ──────────> Own servers only
    │       │
    │       └── Subuser ──> Granular per-server permissions:
    │                       control.console, control.start,
    │                       control.stop, control.restart,
    │                       file.read, file.write, file.upload,
    │                       file.create, file.delete,
    │                       backup.create, backup.delete,
    │                       schedule.create, schedule.delete
    │
    └── API Key ───────> Scoped permissions per key
```

### Input Validation

- **Zod schemas** validate all API inputs (types, ranges, formats)
- **SQL injection** prevented by parameterized queries
- **Path traversal** blocked in file operations (no `..` or absolute paths)
- **Rate limiting** via `@fastify/rate-limit` (100 req/min)

---

## Internationalization

5 supported languages with RTL support:

| Language | Code | Direction |
|----------|------|-----------|
| English | `en` | LTR |
| Arabic | `ar` | RTL |
| Spanish | `es` | LTR |
| French | `fr` | LTR |
| German | `de` | LTR |

The i18n system uses:
- React Context for locale state
- `localStorage` for persistence
- Flat key-value translation files
- CSS `dir="rtl"` attribute for Arabic layout

---

## Docker Deployment

### docker-compose.yml

```yaml
Services:
  - panel:    Node.js Fastify API (port 3001)
  - frontend: Next.js SSR app (port 3000)
  - postgres: PostgreSQL 15 (port 5432)
  - redis:    Redis 7 (port 6379)
  - caddy:    Reverse proxy with auto-TLS (port 80/443)
```

### Quick Start (Docker)

```bash
docker-compose up -d
# Panel: http://localhost
# Default admin: admin@troxe.dev / admin12345
```

---

## Development Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- Go 1.22+ (for node agent)

### Quick Start

```bash
# Clone
git clone https://github.com/yousefhany310za6-ship-it/troxe-host.git
cd troxe-host

# Install dependencies
npm install
cd panel && npm install && cd ..
cd frontend && npm install && cd ..

# Setup database
createdb troxe_panel
cd panel
cp .env.example .env  # Edit DATABASE_URL, JWT_SECRET, etc.
npx tsx src/db/migrate.ts
npx tsx src/db/seed.ts
cd ..

# Start development
cd panel && npx tsx src/server.ts &
cd frontend && npx next dev &
```

### Environment Variables

```bash
# Panel (.env)
DATABASE_URL=postgresql://user:pass@localhost:5432/troxe_panel
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key-min-32-chars
JWT_COOKIE_SECRET=your-cookie-secret
PANEL_URL=http://localhost:3001
PANEL_PORT=3001
ENCRYPTION_KEY=32-byte-encryption-key!!
LOG_LEVEL=info
```

---

## Default Credentials

After seeding the database:

| Email | Password | Role |
|-------|----------|------|
| admin@troxe.dev | admin12345 | Root Admin |

### Default Eggs (Game Templates)

| Egg | Docker Image | Nest |
|-----|-------------|------|
| Minecraft Paper | `ghcr.io/pterodactyl/yolks:java_17` | Minecraft |
| Minecraft Vanilla | `ghcr.io/pterodactyl/yolks:java_17` | Minecraft |
| Rust (Oxide) | `ghcr.io/pterodactyl/yolks:rust` | Rust |
| Valheim | `ghcr.io/pterodactyl/yolks:java_17` | Valheim |

---

## License

MIT License - see [LICENSE](LICENSE) for details.
