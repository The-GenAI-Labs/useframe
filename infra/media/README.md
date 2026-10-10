# Media library bucket (`useframe-media`)

Private R2 bucket for the media library (uploads and generated media). It is never public and has no
custom domain: browsers upload with short-lived presigned PUTs and read only through the API's signed
`/media/:assetId/:role` route. Deployed sites never read it; deploy-service copies the referenced files
into `useframe-sites` at deploy time.

The same settings are in Terraform (`infra/terraform/modules/sites-hosting/media.tf`). Applying either is
a human step; agents only run `terraform validate`.

| File                | What it is                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `r2-cors.json`      | Browser upload CORS (S3 `PutBucketCors` format). Replace the origins with the app's origins. |
| `r2-lifecycle.json` | Deletes `tmp/` scratch objects after 1 day (S3 `PutBucketLifecycleConfiguration` format).   |

Applying the JSON files without Terraform, with an R2 admin token for the account:

```sh
aws s3api put-bucket-cors --bucket useframe-media --cors-configuration "{\"CORSRules\": $(cat r2-cors.json)}" \
  --endpoint-url https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com
aws s3api put-bucket-lifecycle-configuration --bucket useframe-media --lifecycle-configuration file://r2-lifecycle.json \
  --endpoint-url https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com
```

Tokens (create in the Cloudflare dashboard, scoped to this bucket only):

- Object Read & Write: `MEDIA_R2_ACCESS_KEY_ID` / `MEDIA_R2_SECRET_ACCESS_KEY` for `apps/server` and `apps/media-service`.
- Object Read only: `MEDIA_R2_READ_ACCESS_KEY_ID` / `MEDIA_R2_READ_SECRET_ACCESS_KEY` for `apps/deploy-service`.
