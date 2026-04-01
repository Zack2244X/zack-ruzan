FROM caddy:builder AS builder
RUN xcaddy build --output /tmp/caddy \
    --with github.com/caddy-dns/digitalocean

FROM alpine:3.18
COPY --from=builder /tmp/caddy /usr/bin/caddy
RUN chmod +x /usr/bin/caddy
EXPOSE 80 443
ENTRYPOINT ["/usr/bin/caddy"]
CMD ["run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
