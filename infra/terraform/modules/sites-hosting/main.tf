# Infrastructure for generated sites. Not managed here: the Worker script and its
# main */* route (apps/site-edge/wrangler.jsonc), the dashboard/API DNS records,
# and Stage 2 custom hostnames.

resource "cloudflare_r2_bucket" "sites" {
  account_id = var.account_id
  name       = var.sites_bucket_name
  location   = var.r2_location_hint
  # Private: no r2.dev URL and no custom domain. Only the Worker binding and the
  # deploy service's scoped S3 token can read it.
}

resource "cloudflare_workers_kv_namespace" "sites" {
  account_id = var.account_id
  title      = var.kv_namespace_title
}

# ---------------------------------------------------------------------------
# WILDCARD: every *.<zone> name without an explicit record resolves here and is
# answered by the Worker. 100:: is a discard-prefix address: there is no origin.
#
# Explicit records ALWAYS beat the wildcard. The apex, www and api records
# (Vercel / GKE, DNS-only grey cloud) already exist, are NOT managed here, and
# must stay explicit — see apps/deploy-service/RUNBOOK.md.
# ---------------------------------------------------------------------------
resource "cloudflare_dns_record" "sites_wildcard" {
  zone_id = var.zone_id
  name    = "*.${var.zone_name}"
  type    = "AAAA"
  content = "100::"
  proxied = true
  ttl     = 1
  comment = "useframe generated sites -> site-edge Worker (managed by Terraform)"
}

# Script-less routes disable Workers for matching traffic. Belt and braces: these
# hosts are grey-clouded and the Worker also passes them through in code.
resource "cloudflare_workers_route" "bypass" {
  for_each = toset(var.bypass_hosts)
  zone_id  = var.zone_id
  pattern  = each.value
}
