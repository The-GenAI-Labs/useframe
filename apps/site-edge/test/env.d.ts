declare namespace Cloudflare {
  interface Env {
    SITES_KV: KVNamespace;
    SITES_BUCKET: R2Bucket;
    SITES_BASE_DOMAIN: string;
    RESERVED_HOSTS: string;
  }
}
