# Wayo on Coder

This template creates a private PostgreSQL instance and a Wayo development workspace for each Coder user. The web app and API are exposed as authenticated Coder apps. Coder users with workspace access can open the app; configure workspace sharing/team permissions in the Coder deployment.

## Requirements

- A Linux Coder deployment with the Docker provisioner/provider configured and permission to pull `codercom/enterprise-base:ubuntu` and `postgres:16-alpine`.
- A Git URL reachable from the workspace. For a private repository, configure Git credentials in Coder (or use a repository URL supported by your Git credential setup).
- Coder CLI and Terraform template import permission.

## Publish the template

From this directory, validate and push it to the Coder deployment:

```sh
coder templates push wayo --directory . --variable docker_host=unix:///var/run/docker.sock
```

If the deployment Docker provider already uses the local socket, omit `--variable`. Create a workspace from `wayo`, set the repository URL and branch, then start it. First startup installs Node.js dependencies, waits for PostgreSQL via Compose/provider ordering, migrates the database, optionally seeds demo data, and starts API and web services. The app appears in the workspace as **Wayo**.

## Let colleagues test

Add colleagues to the Coder deployment and grant them access to the Wayo workspace (workspace sharing/team permissions depend on your Coder version and organization policy). The app is marked `authenticated`, so only signed-in Coder users who can access the workspace can open it. Keep demo data enabled only in an isolated test workspace; each workspace gets its own database.

The app currently uses development authentication (`AUTH_MODE=dev`), which assigns the seeded developer identity. This is suitable for an isolated test environment, not production data. To inspect startup failures from the Coder terminal, read `/tmp/wayo-api.log` and `/tmp/wayo-web.log`.

## Notes

Each workspace has its own persistent Postgres volume and home volume. Stopping a workspace stops its containers; deleting the workspace removes its containers and network. Docker volumes are persistent and may need cleanup according to the Coder administrator's retention policy.
