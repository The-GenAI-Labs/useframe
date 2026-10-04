# Stage 2 — customer domains via Cloudflare for SaaS custom hostnames.
# Customers CNAME their hostname to <edge_cname_label>.<zone>, which reaches the
# fallback origin; the Stage 1 Worker (*/* route) answers everything.

variable "fallback_label" {
  description = "Label of the fallback origin record (fallback.<zone>)."
  type        = string
  default     = "fallback"
}

variable "edge_cname_label" {
  description = "Label customers point their CNAME at (cname.<zone>); must match SITES_EDGE_CNAME_TARGET."
  type        = string
  default     = "cname"
}

variable "challenge_bypass_patterns" {
  description = "Certificate-challenge paths the Worker must never run on (the Worker also passes them through in code)."
  type        = list(string)
  default = [
    "*/.well-known/pki-validation/*",
    "*/.well-known/acme-challenge/*",
    "*/.well-known/cf-custom-hostname-challenge/*",
  ]
}

locals {
  fallback_origin   = "${var.fallback_label}.${var.zone_name}"
  edge_cname_target = "${var.edge_cname_label}.${var.zone_name}"
}

# No real origin: 100:: is a discard prefix and the Worker answers every request.
resource "cloudflare_dns_record" "fallback" {
  zone_id = var.zone_id
  name    = local.fallback_origin
  type    = "AAAA"
  content = "100::"
  proxied = true
  ttl     = 1
  comment = "useframe custom-hostname fallback origin (managed by Terraform)"
}

resource "cloudflare_dns_record" "edge_cname" {
  zone_id = var.zone_id
  name    = local.edge_cname_target
  type    = "CNAME"
  content = local.fallback_origin
  proxied = true
  ttl     = 1
  comment = "Customers point their CNAME here (managed by Terraform)"
}

resource "cloudflare_custom_hostname_fallback_origin" "sites" {
  zone_id    = var.zone_id
  origin     = local.fallback_origin
  depends_on = [cloudflare_dns_record.fallback]
}

resource "cloudflare_workers_route" "challenge_bypass" {
  for_each = toset(var.challenge_bypass_patterns)
  zone_id  = var.zone_id
  pattern  = each.value
}

output "edge_cname_target" {
  description = "Value for SITES_EDGE_CNAME_TARGET."
  value       = local.edge_cname_target
}

output "fallback_origin" {
  value = local.fallback_origin
}
