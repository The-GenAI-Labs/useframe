{{- define "useframe.volumes" -}}
{{- range .emptyDirs }}
- name: {{ .name }}
  emptyDir:
    {{- with .medium }}
    medium: {{ . }}
    {{- end }}
    sizeLimit: {{ required (printf "emptyDirs %s needs a sizeLimit" .name) .sizeLimit }}
{{- end }}
{{- with .volumes }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{- define "useframe.volumeMounts" -}}
{{- range .emptyDirs }}
- name: {{ .name }}
  mountPath: {{ .mountPath }}
{{- end }}
{{- with .volumeMounts }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{/* Pod scheduling, identity and security shared by Deployments and the migration Job. */}}
{{- define "useframe.podCommon" -}}
{{- $w := .w -}}
{{- with .root.Values.global.imagePullSecrets }}
imagePullSecrets:
  {{- toYaml . | nindent 2 }}
{{- end }}
automountServiceAccountToken: {{ $w.automountServiceAccountToken }}
enableServiceLinks: false
securityContext:
  {{- toYaml $w.podSecurityContext | nindent 2 }}
{{- with $w.nodeSelector }}
nodeSelector:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with $w.affinity }}
affinity:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with $w.tolerations }}
tolerations:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- $volumes := include "useframe.volumes" $w | trim }}
{{- if $volumes }}
volumes:
  {{- $volumes | nindent 2 }}
{{- end }}
{{- end -}}

{{/* (dict "root" $ "key" key "w" <merged workload>) */}}
{{- define "useframe.deployment" -}}
{{- $root := .root -}}
{{- $key := .key -}}
{{- $w := .w -}}
{{- $name := include "useframe.fullname" . -}}
{{- $version := include "useframe.imageVersion" (dict "root" $root "image" $w.image) -}}
{{- $ctx := dict "root" $root "key" $key "version" $version -}}
{{- $env := include "useframe.env" (dict "root" $root "key" $key "w" $w) | fromYaml -}}
{{- $grace := int $w.terminationGracePeriodSeconds -}}
{{- $preStop := int ($w.preStopSleepSeconds | default 0) -}}
{{- if le $grace $preStop -}}
{{- fail (printf "%s: terminationGracePeriodSeconds (%d) must exceed preStopSleepSeconds (%d) plus the app's shutdown time" $key $grace $preStop) -}}
{{- end -}}
{{- $saName := "default" -}}
{{- if $w.serviceAccount.create -}}
{{- $saName = $w.serviceAccount.name | default $name -}}
{{- else if $w.serviceAccount.name -}}
{{- $saName = $w.serviceAccount.name -}}
{{- end -}}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ $name }}
  labels:
    {{- include "useframe.labels" $ctx | nindent 4 }}
spec:
  {{- if not $w.autoscaling.enabled }}
  replicas: {{ $w.replicas }}
  {{- end }}
  revisionHistoryLimit: 5
  selector:
    matchLabels:
      {{- include "useframe.selectorLabels" $ctx | nindent 6 }}
  strategy:
    type: {{ $w.strategy.type }}
    {{- if and (eq $w.strategy.type "RollingUpdate") $w.strategy.rollingUpdate }}
    rollingUpdate:
      {{- toYaml $w.strategy.rollingUpdate | nindent 6 }}
    {{- end }}
  template:
    metadata:
      labels:
        {{- include "useframe.labels" $ctx | nindent 8 }}
        {{- with $root.Values.global.podLabels }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
        {{- with $w.podLabels }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
      annotations:
        checksum/config: {{ toYaml $env | sha256sum }}
        {{- with $root.Values.global.podAnnotations }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
        {{- with $w.podAnnotations }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
    spec:
      serviceAccountName: {{ $saName }}
      terminationGracePeriodSeconds: {{ $grace }}
      {{- include "useframe.podCommon" (dict "root" $root "w" $w) | trim | nindent 6 }}
      {{- if $w.topologySpread.enabled }}
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels:
              {{- include "useframe.selectorLabels" $ctx | nindent 14 }}
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels:
              {{- include "useframe.selectorLabels" $ctx | nindent 14 }}
      {{- end }}
      containers:
        - name: {{ $key }}
          image: {{ include "useframe.image" (dict "root" $root "key" $key "image" $w.image) }}
          imagePullPolicy: {{ $w.image.pullPolicy | default $root.Values.global.image.pullPolicy }}
          {{- with $w.command }}
          command:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with $w.args }}
          args:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- if $w.port }}
          ports:
            - name: http
              containerPort: {{ int $w.port }}
              protocol: TCP
          {{- end }}
          {{- if or $env $w.envFromConfigMaps $w.envFromSecrets }}
          envFrom:
            {{- if $env }}
            - configMapRef:
                name: {{ $name }}-config
            {{- end }}
            {{- range $w.envFromConfigMaps }}
            - configMapRef:
                name: {{ . }}
            {{- end }}
            {{- range $w.envFromSecrets }}
            - secretRef:
                name: {{ . }}
            {{- end }}
          {{- end }}
          {{- range $probe := list "startup" "readiness" "liveness" }}
          {{- $p := get $w.probes $probe }}
          {{- if and $p (dig "enabled" true $p) }}
          {{ $probe }}Probe:
            {{- include "useframe.probe" (dict "probe" $p "w" $w "key" $key) | nindent 12 }}
          {{- end }}
          {{- end }}
          {{- if gt $preStop 0 }}
          lifecycle:
            preStop:
              exec:
                command: ["sleep", "{{ $preStop }}"]
          {{- end }}
          resources:
            {{- toYaml (required (printf "%s: resources are required" $key) $w.resources) | nindent 12 }}
          securityContext:
            {{- toYaml $w.securityContext | nindent 12 }}
          {{- $mounts := include "useframe.volumeMounts" $w | trim }}
          {{- if $mounts }}
          volumeMounts:
            {{- $mounts | nindent 12 }}
          {{- end }}
{{- end -}}
