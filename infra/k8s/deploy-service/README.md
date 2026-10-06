# Superseded by the Helm chart

These raw manifests predate `infra/helm/useframe`. The chart ports their settings (worker
securityContext and capabilities, `args` so tini stays PID 1, sizes, volumes, grace period, Secret
keys) as the `deploy-service-server` and `deploy-service-worker` workloads. Deploy with the chart
(see its README). These files are kept for reference only.

Do not apply these alongside the chart: the Deployment names differ, so two workers would consume
the same build queue.
