variable "account_id" {
  description = "Cloudflare account that owns the sites bucket, KV namespace and Worker."
  type        = string
}

variable "zone_id" {
  description = "Zone id of the sites base domain (useframe.in)."
  type        = string
}

variable "zone_name" {
  description = "Sites base domain. Generated sites live on *.<zone_name>."
  type        = string
  default     = "useframe.in"
}

variable "sites_bucket_name" {
  description = "Private R2 bucket holding every immutable deployment under sites/{projectId}/{deploymentId}/."
  type        = string
  default     = "useframe-sites"
}

variable "r2_location_hint" {
  description = "R2 location hint for the sites bucket."
  type        = string
  default     = "apac"
}

variable "kv_namespace_title" {
  description = "KV namespace mapping h:<hostname> to a deployment."
  type        = string
  default     = "useframe-sites"
}

variable "bypass_hosts" {
  description = "Route patterns the Worker must never run on (dashboard, API). Keep in sync with RESERVED_HOSTS / SITES_RESERVED_HOSTS."
  type        = list(string)
  default     = ["useframe.in/*", "www.useframe.in/*", "api.useframe.in/*"]
}
