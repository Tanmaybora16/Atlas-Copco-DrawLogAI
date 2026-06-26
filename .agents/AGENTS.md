# Workspace Rules

- **Do not include `web.config` in the frontend `dist.zip` package.**
  The VM team manages the `web.config` file directly on the VM server. Overwriting it during frontend deployment can cause configuration conflicts (such as duplicate MIME mappings or broken proxy configurations).
