# Homeserver Deployment

See [power-monitor/deploy/README.md](../../power-monitor/deploy/README.md) for the full unified deployment pattern.

## Quick Reference

**Registry image:** `registry.home.lukeboyle.com/afrikaans-reader`
**Default port:** 3400

### Deploy

```bash
# After pushing to master branch:
cd ~/afrikaans-reader
docker compose pull
docker compose up -d
```

### Files on homeserver (`~/afrikaans-reader/`)

- `docker-compose.yml` - from `deploy/docker-compose.yml`
- `.env` - from `deploy/.env.example`
