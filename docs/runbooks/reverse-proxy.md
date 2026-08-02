# Reverse-proxy deployment (experimental)

OpenLabOS Compose binds to loopback by default. For non-loopback access, place TLS and authentication in front of the API.

## Caddy example

```caddyfile
labos.example.com {
  tls internal
  reverse_proxy 127.0.0.1:3847
  header {
    Strict-Transport-Security "max-age=31536000"
  }
}
```

Set on the API container or host:

```bash
OPENLABOS_AUTH_REQUIRED=true
OPENLABOS_API_TOKEN=<long-random-token>
```

Clients must send `Authorization: Bearer <token>`.

## nginx example

```nginx
server {
  listen 443 ssl;
  server_name labos.example.com;
  location / {
    proxy_pass http://127.0.0.1:3847;
    proxy_set_header Authorization $http_authorization;
  }
}
```

Do not expose the API without TLS and token auth. See [../security/threat-model.md](../security/threat-model.md).
