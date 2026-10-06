{{- define "useframe.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* (dict "root" $ "key" "<service key>") */}}
{{- define "useframe.fullname" -}}
{{- printf "%s-%s" .root.Release.Name .key | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Stable across upgrades: never includes the version. */}}
{{- define "useframe.selectorLabels" -}}
app.kubernetes.io/name: useframe
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .key }}
{{- end -}}

{{/* (dict "root" $ "key" key "version" "<tag or digest>") */}}
{{- define "useframe.labels" -}}
{{ include "useframe.selectorLabels" . }}
app.kubernetes.io/part-of: useframe
app.kubernetes.io/version: {{ .version | default .root.Chart.AppVersion | replace ":" "-" | trunc 63 | trimSuffix "-" | quote }}
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
helm.sh/chart: {{ include "useframe.chart" .root }}
{{- end -}}

{{/*
Recursive deep merge of .src into .dst (mutates .dst). Maps merge key by key; anything else,
including false and 0, replaces. sprig's mergeOverwrite skips false/0/"" and cannot be used here.
*/}}
{{- define "useframe.mergeInto" -}}
{{- $dst := .dst -}}
{{- range $k, $v := .src -}}
{{- $cur := get $dst $k -}}
{{- if kindIs "invalid" $v -}}
{{- $_ := unset $dst $k -}}
{{- else if and (kindIs "map" $v) (kindIs "map" $cur) -}}
{{- include "useframe.mergeInto" (dict "dst" $cur "src" $v) -}}
{{- else -}}
{{- $_ := set $dst $k (deepCopy $v) -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/* (dict "root" $ "svc" <service values>) → YAML of workloadDefaults deep-merged with the service. */}}
{{- define "useframe.workload" -}}
{{- $w := deepCopy .root.Values.workloadDefaults -}}
{{- include "useframe.mergeInto" (dict "dst" $w "src" .svc) -}}
{{- toYaml $w -}}
{{- end -}}

{{/* (dict "root" $ "key" key "image" <image values>) */}}
{{- define "useframe.image" -}}
{{- $g := .root.Values.global.image -}}
{{- $img := .image | default dict -}}
{{- $ns := required "global.image.namespace is required: --set global.image.namespace=<Docker Hub user/org>" $g.namespace -}}
{{- $name := required (printf "%s: image.name is required" .key) $img.name -}}
{{- $repo := printf "%s/%s/%s" ($g.registry | default "docker.io") $ns $name -}}
{{- if $img.digest -}}
{{- if not (regexMatch "^sha256:[a-f0-9]{64}$" $img.digest) -}}
{{- fail (printf "%s: image.digest must look like sha256:<64 hex chars>" .key) -}}
{{- end -}}
{{- printf "%s@%s" $repo $img.digest -}}
{{- else -}}
{{- $tag := $img.tag | default $g.tag | default "" | toString -}}
{{- if not $tag -}}
{{- fail (printf "%s: an image tag is required: --set global.image.tag=sha-<gitsha> (or set image.tag / image.digest on the service)" .key) -}}
{{- end -}}
{{- if has (lower $tag) (list "latest" "main") -}}
{{- fail (printf "%s: image tag %q is a moving tag; deploy an immutable sha-<gitsha> tag" .key $tag) -}}
{{- end -}}
{{- printf "%s:%s%s" $repo ($img.tagPrefix | default "") $tag -}}
{{- end -}}
{{- end -}}

{{/* Label-safe version: the tag, or the first 12 hex chars of the digest. */}}
{{- define "useframe.imageVersion" -}}
{{- $g := .root.Values.global.image -}}
{{- $img := .image | default dict -}}
{{- if $img.digest -}}
{{- $img.digest | trimPrefix "sha256:" | trunc 12 -}}
{{- else -}}
{{- printf "%s%s" ($img.tagPrefix | default "") ($img.tag | default $g.tag | default "" | toString) -}}
{{- end -}}
{{- end -}}

{{/* In-cluster URL of another workload, for use inside `env` values: (list $ "<service key>") */}}
{{- define "useframe.serviceUrl" -}}
{{- $root := index . 0 -}}
{{- $key := index . 1 -}}
{{- $svc := index $root.Values.services $key | default dict -}}
{{- $w := include "useframe.workload" (dict "root" $root "svc" $svc) | fromYaml -}}
{{- $port := $w.service.port | default $w.port -}}
{{- if not $port -}}
{{- fail (printf "useframe.serviceUrl: services.%s has no port" $key) -}}
{{- end -}}
{{- printf "http://%s.%s.svc.cluster.local:%d" (include "useframe.fullname" (dict "root" $root "key" $key)) $root.Release.Namespace (int $port) -}}
{{- end -}}

{{/* (dict "root" $ "key" key "w" <merged workload>) → env map: global.env < w.env < portEnv, tpl-rendered. */}}
{{- define "useframe.env" -}}
{{- $env := dict -}}
{{- range $k, $v := .root.Values.global.env }}{{ $_ := set $env $k $v }}{{ end -}}
{{- range $k, $v := .w.env }}{{ $_ := set $env $k $v }}{{ end -}}
{{- if and .w.port .w.portEnv -}}
{{- $_ := set $env .w.portEnv (int .w.port) -}}
{{- end -}}
{{- $out := dict -}}
{{- range $k, $v := $env -}}
{{- $val := tpl (toString $v) $.root -}}
{{- if and $val (regexMatch "(?i)(secret|token|password|api[_-]?key|private|credential)" $k) -}}
{{- fail (printf "%s: env %s looks secret; put it in a Secret listed in envFromSecrets, never in plain env" $.key $k) -}}
{{- end -}}
{{- $_ := set $out $k $val -}}
{{- end -}}
{{- toYaml $out -}}
{{- end -}}

{{/* (dict "probe" <probe values> "w" <merged workload> "key" key) */}}
{{- define "useframe.probe" -}}
{{- $p := omit .probe "enabled" -}}
{{- if not (or (hasKey $p "httpGet") (hasKey $p "exec") (hasKey $p "tcpSocket") (hasKey $p "grpc")) -}}
{{- if not (and .w.port .w.healthPath) -}}
{{- fail (printf "%s: probes need port and healthPath, a raw handler, or enabled: false" .key) -}}
{{- end -}}
{{- $_ := set $p "httpGet" (dict "path" .w.healthPath "port" "http") -}}
{{- end -}}
{{- toYaml $p -}}
{{- end -}}

{{/* True when the ingress renders GKE-native resources. */}}
{{- define "useframe.gce" -}}
{{- if and .Values.ingress.enabled (eq (.Values.ingress.className | default "") "gce") -}}true{{- end -}}
{{- end -}}

{{/* JSON list of the enabled service keys exposed through the ingress. */}}
{{- define "useframe.exposedKeys" -}}
{{- $keys := list -}}
{{- if .Values.ingress.enabled -}}
{{- range $key := keys .Values.services | sortAlpha -}}
{{- $svc := index $.Values.services $key -}}
{{- if $svc.enabled -}}
{{- $w := include "useframe.workload" (dict "root" $ "svc" $svc) | fromYaml -}}
{{- if and $w.ingress.enabled $w.service.enabled -}}
{{- $keys = append $keys $key -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- toJson $keys -}}
{{- end -}}
