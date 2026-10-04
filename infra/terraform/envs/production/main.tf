terraform {
  required_version = ">= 1.6"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.19"
    }
  }

  # State backend: deliberately left unset. Choose one (e.g. a GCS bucket, since
  # the platform runs on GCP) before the first apply:
  # backend "gcs" {
  #   bucket = "<state-bucket>"
  #   prefix = "useframe/sites-hosting"
  # }
}

# Admin token via CLOUDFLARE_API_TOKEN in the environment; never committed.
provider "cloudflare" {}

variable "account_id" {
  type = string
}

variable "zone_id" {
  type = string
}

module "sites_hosting" {
  source     = "../../modules/sites-hosting"
  account_id = var.account_id
  zone_id    = var.zone_id
}

output "kv_namespace_id" {
  value = module.sites_hosting.kv_namespace_id
}

output "r2_bucket_name" {
  value = module.sites_hosting.r2_bucket_name
}

output "account_id" {
  value = module.sites_hosting.account_id
}
