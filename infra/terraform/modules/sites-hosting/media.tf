# Private media library bucket. Only presigned uploads (API token) and the
# media/deploy services' scoped S3 tokens touch it; there is no public access.

resource "cloudflare_r2_bucket" "media" {
  account_id = var.account_id
  name       = var.media_bucket_name
  location   = var.r2_location_hint
}

resource "cloudflare_r2_bucket_cors" "media" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.media.name
  rules = [{
    id = "browser-uploads"
    allowed = {
      origins = var.media_cors_origins
      methods = ["PUT", "GET", "HEAD"]
      headers = ["Content-Type", "Content-Length"]
    }
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }]
}

resource "cloudflare_r2_bucket_lifecycle" "media" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.media.name
  rules = [{
    id         = "expire-tmp"
    enabled    = true
    conditions = { prefix = "tmp/" }
    delete_objects_transition = {
      condition = { type = "Age", max_age = 86400 }
    }
  }]
}
