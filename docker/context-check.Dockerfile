# syntax=docker/dockerfile:1.7
# Fails if any secret-bearing file can enter a build context: node scripts/docker.mjs context-check
FROM busybox:1.37
COPY . /ctx
WORKDIR /ctx
RUN bad="$(find . \( -name '.env' -o -name '*.pem' -o -name '*.key' -o -name 'id_rsa*' -o -name '.git' -o -name '*.tfstate*' -o -name 'terraform.tfvars' \) -print; \
          find . -name '.env.*' ! -name '.env.example' -print)"; \
    if [ -n "$bad" ]; then echo "Forbidden files in build context:"; echo "$bad"; exit 1; fi; \
    echo "build context clean: $(find . -type f | wc -l) files"
