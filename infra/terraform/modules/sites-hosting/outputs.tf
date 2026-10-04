output "kv_namespace_id" {
  description = "Put this in apps/site-edge/wrangler.jsonc (SITES_KV) and SITES_KV_NAMESPACE_ID."
  value       = cloudflare_workers_kv_namespace.sites.id
}

output "r2_bucket_name" {
  value = cloudflare_r2_bucket.sites.name
}

output "account_id" {
  value = var.account_id
}
