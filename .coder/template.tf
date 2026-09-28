terraform {
  required_providers {
    coder = {
      source  = "coder/coder"
      version = "~> 2.0"
    }
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

provider "coder" {}
provider "docker" {}

data "coder_parameter" "repo_url" {
  name         = "repo_url"
  display_name = "Git repository URL"
  description  = "HTTPS or SSH URL for the Wayo repository."
  default      = ""
  mutable      = false
}

data "coder_parameter" "branch" {
  name         = "branch"
  display_name = "Branch"
  default      = "main"
  mutable      = true
}

data "coder_parameter" "seed_demo_data" {
  name         = "seed_demo_data"
  display_name = "Load demo data"
  description  = "Run Prisma seed on workspace start."
  default      = "true"
  mutable      = false
}

data "coder_workspace" "me" {}
data "coder_workspace_owner" "me" {}

resource "docker_volume" "home" {
  name = "coder-${data.coder_workspace_owner.me.name}-${data.coder_workspace.me.name}-home"
  lifecycle { ignore_changes = all }
}

resource "docker_volume" "postgres" {
  name = "coder-${data.coder_workspace_owner.me.name}-${data.coder_workspace.me.name}-postgres"
  lifecycle { ignore_changes = all }
}

resource "docker_network" "workspace" {
  name = "coder-${data.coder_workspace_owner.me.name}-${data.coder_workspace.me.name}"
  lifecycle { ignore_changes = all }
}

resource "docker_container" "postgres" {
  count = data.coder_workspace.me.start_count
  image = "postgres:16-alpine"
  name  = "${docker_network.workspace.name}-postgres"
  env = [
    "POSTGRES_USER=tracker",
    "POSTGRES_PASSWORD=tracker",
    "POSTGRES_DB=tracker",
  ]
  networks_advanced {
    name    = docker_network.workspace.name
    aliases = ["postgres"]
  }
  volumes {
    volume_name    = docker_volume.postgres.name
    container_path = "/var/lib/postgresql/data"
  }
  healthcheck {
    test         = ["CMD-SHELL", "pg_isready -U tracker -d tracker"]
    interval     = "5s"
    timeout      = "5s"
    retries      = 10
    start_period = "10s"
  }
  restart = "unless-stopped"
}

resource "coder_agent" "main" {
  arch = "amd64"
  os   = "linux"
  env = {
    GIT_TERMINAL_PROMPT = "0"
  }
  startup_script = <<-EOT
    #!/bin/bash
    set -eu
    if ! command -v node >/dev/null; then
      curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
      apt-get update && apt-get install -y nodejs git curl
    fi
    mkdir -p /home/coder
    if [ -n "$WORKSPACE_REPO_URL" ] && [ ! -d /home/coder/wayo/.git ]; then
      git clone --branch "$WORKSPACE_BRANCH" "$WORKSPACE_REPO_URL" /home/coder/wayo
    fi
    if [ -d /home/coder/wayo/.git ]; then
      cd /home/coder/wayo
      git fetch origin "$WORKSPACE_BRANCH" || true
      git checkout "$WORKSPACE_BRANCH"
      git pull --ff-only origin "$WORKSPACE_BRANCH" || true
      npm install
      DATABASE_URL="postgresql://tracker:tracker@postgres:5432/tracker?schema=public" npm run db:generate
      DATABASE_URL="postgresql://tracker:tracker@postgres:5432/tracker?schema=public" npm run db:migrate:deploy
      if [ "$SEED_DEMO_DATA" = "true" ]; then
        DATABASE_URL="postgresql://tracker:tracker@postgres:5432/tracker?schema=public" npm run db:seed
      fi
      (
        cd apps/api
        DATABASE_URL="postgresql://tracker:tracker@postgres:5432/tracker?schema=public" AUTH_MODE=dev PORT=3001 npm run dev
      ) > /tmp/wayo-api.log 2>&1 &
      (
        cd apps/web
        NEXT_PUBLIC_API_URL=/api/v1 API_PROXY_ORIGIN=http://127.0.0.1:3001 npm run dev
      ) > /tmp/wayo-web.log 2>&1 &
    fi
    exec coder agent
  EOT
  metadata {
    display_name = "Workspace"
    key          = "repo"
    script       = "echo \"Branch: ${data.coder_parameter.branch.value}\""
    interval     = 300
    timeout      = 10
  }
}

resource "docker_container" "workspace" {
  count    = data.coder_workspace.me.start_count
  image    = "codercom/enterprise-base:ubuntu"
  name     = "coder-${data.coder_workspace_owner.me.name}-${data.coder_workspace.me.name}"
  hostname = data.coder_workspace.me.name
  command  = ["sh", "-c", "exec sleep infinity"]
  env = [
    "CODER_AGENT_TOKEN=${coder_agent.main.token}",
    "WORKSPACE_REPO_URL=${data.coder_parameter.repo_url.value}",
    "WORKSPACE_BRANCH=${data.coder_parameter.branch.value}",
    "SEED_DEMO_DATA=${data.coder_parameter.seed_demo_data.value}",
  ]
  networks_advanced {
    name = docker_network.workspace.name
  }
  volumes {
    volume_name    = docker_volume.home.name
    container_path = "/home/coder"
  }
  restart = "unless-stopped"
  depends_on = [docker_container.postgres]
}

resource "coder_app" "web" {
  agent_id     = coder_agent.main.id
  slug         = "wayo"
  display_name = "Wayo"
  url          = "http://localhost:3000"
  icon         = "/icon/terminal.svg"
  subdomain    = false
  share        = "authenticated"
  healthcheck {
    url       = "http://localhost:3000"
    interval  = 5
    threshold = 30
  }
}

resource "coder_app" "api" {
  agent_id     = coder_agent.main.id
  slug         = "api"
  display_name = "API health"
  url          = "http://localhost:3001/api/v1/health/ready"
  share        = "authenticated"
}

resource "coder_metadata" "workspace" {
  count       = data.coder_workspace.me.start_count
  resource_id = docker_container.workspace[0].id
  item {
    key   = "services"
    value = "Wayo web: port 3000; API: port 3001. Logs: /tmp/wayo-*.log."
  }
}
