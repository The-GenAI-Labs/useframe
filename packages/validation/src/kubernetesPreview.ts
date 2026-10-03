import { request } from "node:https";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const serviceAccount = "/var/run/secrets/kubernetes.io/serviceaccount";
async function api(
  method: string,
  path: string,
  body?: object,
): Promise<unknown> {
  const [token, ca] = await Promise.all([
    readFile(`${serviceAccount}/token`, "utf8"),
    readFile(`${serviceAccount}/ca.crt`),
  ]);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: process.env.KUBERNETES_SERVICE_HOST,
        port: Number(process.env.KUBERNETES_SERVICE_PORT_HTTPS ?? "443"),
        path,
        method,
        ca,
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          "Content-Type":
            method === "PATCH"
              ? "application/merge-patch+json"
              : "application/json",
        },
        timeout: 15000,
      },
      (res) => {
        let text = "";
        res.on("data", (chunk) => {
          text += String(chunk);
          if (text.length > 2000000)
            req.destroy(new Error("Kubernetes response too large"));
        });
        res.on("end", () => {
          if (method === "DELETE" && res.statusCode === 404) {
            resolve(null);
            return;
          }
          if (!res.statusCode || res.statusCode >= 400) {
            reject(
              new Error(
                `Kubernetes preview ${method} failed (${res.statusCode})`,
              ),
            );
            return;
          }
          try {
            resolve(JSON.parse(text));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req
      .on("error", reject)
      .on("timeout", () => req.destroy(new Error("Kubernetes API timeout")));
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
export async function startKubernetesPreview(
  files: { path: string; content: string }[],
  framework: "next" | "vite",
  runDevScript = false,
) {
  const name = `validation-${randomUUID()}`;
  const namespace =
    process.env.VALIDATION_PREVIEW_NAMESPACE ?? "useframe-validation";
  if (!/^[a-z0-9-]+$/.test(namespace))
    throw new Error("Invalid preview namespace");
  const image = process.env.VALIDATION_PREVIEW_IMAGE;
  if (!image)
    throw new Error(
      "VALIDATION_PREVIEW_IMAGE must point to the deployed preview image",
    );
  const base = `/api/v1/namespaces/${namespace}`;
  const serialized = JSON.stringify(files);
  if (Buffer.byteLength(serialized) > 900000)
    throw new Error("Source exceeds the isolated preview ConfigMap limit");
  let killed = false;
  const kill = async () => {
    if (killed) return;
    await Promise.all([
      api("DELETE", `${base}/pods/${name}`, { gracePeriodSeconds: 0 }),
      api("DELETE", `${base}/configmaps/${name}`),
    ]);
    killed = true;
  };
  try {
    await api("POST", `${base}/configmaps`, {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: { name, labels: { app: "validation-preview" } },
      data: { "files.json": serialized },
      immutable: true,
    });
    await api("POST", `${base}/pods`, {
      apiVersion: "v1",
      kind: "Pod",
      metadata: { name, labels: { app: "validation-preview" } },
      spec: {
        automountServiceAccountToken: false,
        enableServiceLinks: false,
        restartPolicy: "Never",
        activeDeadlineSeconds: 1800,
        runtimeClassName: process.env.VALIDATION_RUNTIME_CLASS ?? "gvisor",
        securityContext: {
          runAsNonRoot: true,
          runAsUser: 1000,
          runAsGroup: 1000,
          fsGroup: 1000,
          seccompProfile: { type: "RuntimeDefault" },
        },
        containers: [
          {
            name: "preview",
            image,
            args: [framework, ...(runDevScript ? ["script"] : [])],
            ports: [{ containerPort: 3000 }],
            resources: {
              requests: { cpu: "250m", memory: "512Mi" },
              limits: { cpu: "2", memory: "2Gi" },
            },
            securityContext: {
              allowPrivilegeEscalation: false,
              readOnlyRootFilesystem: true,
              capabilities: { drop: ["ALL"] },
            },
            volumeMounts: [
              { name: "source", mountPath: "/input", readOnly: true },
              { name: "temporary", mountPath: "/tmp" },
            ],
          },
        ],
        volumes: [
          { name: "source", configMap: { name } },
          {
            name: "temporary",
            emptyDir: { medium: "Memory", sizeLimit: "1Gi" },
          },
        ],
      },
    });
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      const pod = z
        .object({
          metadata: z.object({ uid: z.string() }),
          status: z
            .object({
              phase: z.string().optional(),
              podIP: z.string().optional(),
            })
            .optional(),
        })
        .parse(await api("GET", `${base}/pods/${name}`));
      if (pod.status?.phase === "Failed")
        throw new Error("Isolated preview pod failed");
      if (pod.status?.phase === "Running" && pod.status.podIP) {
        const url = `http://${pod.status.podIP.includes(":") ? `[${pod.status.podIP}]` : pod.status.podIP}:3000`;
        try {
          await fetch(url, { signal: AbortSignal.timeout(1500) });
          await api("PATCH", `${base}/configmaps/${name}`, {
            metadata: {
              ownerReferences: [
                { apiVersion: "v1", kind: "Pod", name, uid: pod.metadata.uid },
              ],
            },
          });
          return { url, port: 3000, kill };
        } catch {
          /* The process may still be compiling its first route. */
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error("Isolated preview pod startup timed out");
  } catch (error) {
    await kill().catch(() => {});
    throw error;
  }
}
export async function deleteExpiredPreviewPods() {
  if (!process.env.KUBERNETES_SERVICE_HOST) return;
  const namespace =
    process.env.VALIDATION_PREVIEW_NAMESPACE ?? "useframe-validation";
  if (!/^[a-z0-9-]+$/.test(namespace))
    throw new Error("Invalid preview namespace");
  const base = `/api/v1/namespaces/${namespace}`;
  for (const resource of ["pods", "configmaps"]) {
    const list = z
      .object({
        items: z.array(
          z.object({
            metadata: z.object({
              name: z.string(),
              creationTimestamp: z.string(),
            }),
          }),
        ),
      })
      .parse(
        await api(
          "GET",
          `${base}/${resource}?labelSelector=app%3Dvalidation-preview`,
        ),
      );
    for (const item of list.items) {
      if (
        Date.parse(item.metadata.creationTimestamp) <
        Date.now() - 2 * 60 * 60 * 1000
      )
        await api(
          "DELETE",
          `${base}/${resource}/${encodeURIComponent(item.metadata.name)}`,
          { gracePeriodSeconds: 0 },
        );
    }
  }
}
