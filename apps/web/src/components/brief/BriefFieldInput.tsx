"use client"

import { useId, useState, type ReactNode } from "react"
import {
  AUDIENCE_SEGMENTS,
  AVAILABILITY,
  BRIEF_OPTION_LABELS,
  BRIEF_SITE_TYPES,
  BRIEF_UI_COPY,
  CTA_TYPES,
  FIELD_DEFS,
  LEGAL_MODES,
  NicheCategoryEnum,
  PRICE_INTERVALS,
  PRICING_MODES,
  PRIMARY_GOALS,
  PRODUCT_TYPES,
  SOCIAL_NETWORKS,
  TECH_LEVELS,
  TONES,
  TRAFFIC_SOURCES,
  type BriefData,
  type FieldId,
} from "@repo/schemas"
import { BUILDER_CAPABILITIES } from "@repo/site-builder"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

type Change = (value: unknown) => void
type Item<K extends "competitors" | "designReferences" | "testimonials"> = NonNullable<BriefData[K]>[number]

export type FieldRenderProps = {
  id: FieldId
  data: BriefData
  onChange: Change
  onBlur?: () => void
  disabled?: boolean
  describedBy: string
  invalid: boolean
  logoUrl?: string
  onUpload?: (file: File) => void
  uploading?: boolean
}

const control = "text-[13px]"

function Counter({ value, max }: { value: string; max: number }) {
  return (
    <span className={cn("text-[11px] tabular-nums", value.length > max ? "text-red-600 dark:text-red-400" : "text-mut")} aria-hidden="true">
      {value.length}/{max}
    </span>
  )
}

function TextControl(props: {
  inputId: string
  value: string | undefined
  max: number
  multiline?: boolean
  placeholder?: string
  type?: string
  onChange: (v: string) => void
  onBlur?: () => void
  disabled?: boolean
  describedBy?: string
  invalid?: boolean
  label?: string
  autoComplete?: string
}) {
  const value = props.value ?? ""
  const common = {
    id: props.inputId,
    value,
    placeholder: props.placeholder,
    disabled: props.disabled,
    onBlur: props.onBlur,
    "aria-describedby": props.describedBy,
    "aria-invalid": props.invalid || undefined,
    "aria-label": props.label,
    autoComplete: props.autoComplete ?? "off",
  }
  return (
    <div className="flex flex-col gap-1">
      {props.multiline ? (
        <Textarea {...common} rows={3} className={control} onChange={(e) => props.onChange(e.target.value)} />
      ) : (
        <Input {...common} type={props.type ?? "text"} className={control} onChange={(e) => props.onChange(e.target.value)} />
      )}
      {props.max < 1000 && (
        <div className="flex justify-end">
          <Counter value={value} max={props.max} />
        </div>
      )}
    </div>
  )
}

function Chips<T extends string>(props: {
  name: string
  options: readonly T[]
  labels: Record<string, string>
  value: T | T[] | undefined
  multiple?: boolean
  max?: number
  onChange: (v: T | T[] | undefined) => void
  disabled?: boolean
  describedBy?: string
}) {
  const selected = Array.isArray(props.value) ? props.value : props.value ? [props.value] : []
  return (
    <div className="flex flex-wrap gap-2" role={props.multiple ? "group" : "radiogroup"} aria-describedby={props.describedBy}>
      {props.options.map((opt) => {
        const checked = selected.includes(opt)
        const atMax = !!props.multiple && !!props.max && selected.length >= props.max && !checked
        return (
          <label key={opt} className={cn("relative", (props.disabled || atMax) && "opacity-50")}>
            <input
              type={props.multiple ? "checkbox" : "radio"}
              name={props.name}
              value={opt}
              checked={checked}
              disabled={props.disabled || atMax}
              className="peer sr-only"
              onChange={() => {
                if (!props.multiple) return props.onChange(opt)
                const next = checked ? selected.filter((s) => s !== opt) : [...selected, opt]
                props.onChange(next.length ? next : undefined)
              }}
            />
            <span
              className={cn(
                "inline-flex cursor-pointer select-none items-center rounded-full border px-3.5 py-2 text-[12.5px] font-medium transition-colors",
                "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 motion-reduce:transition-none",
                checked
                  ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                  : "border-base text-sec hover:border-em hover:bg-tertiary",
              )}
            >
              {props.labels[opt] ?? opt}
            </span>
          </label>
        )
      })}
    </div>
  )
}

function SubLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-[12px] font-medium text-sec">
      {children}
    </label>
  )
}

type ListProps<T> = {
  noun: string
  items: T[]
  min?: number
  max: number
  make: () => T
  onChange: (items: T[]) => void
  render: (item: T, update: (next: T) => void, index: number) => ReactNode
  disabled?: boolean
}

function ListEditor<T>({ noun, items, min = 0, max, make, onChange, render, disabled }: ListProps<T>) {
  const move = (from: number, to: number) => {
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved!)
    onChange(next)
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11.5px] text-mut">{min > 0 ? `${min}–${max} ${noun}s` : `Up to ${max} ${noun}s`}</p>
      <ol className="flex flex-col gap-3">
        {items.map((item, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-2xl border border-base p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-sec">
                {noun[0]!.toUpperCase() + noun.slice(1)} {i + 1}
              </span>
              <div className="flex items-center gap-1">
                <button type="button" className="rounded-lg px-2 py-1 text-[11.5px] text-mut hover:bg-tertiary focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-40" disabled={disabled || i === 0} onClick={() => move(i, i - 1)} aria-label={`${BRIEF_UI_COPY.moveUp}: ${noun} ${i + 1}`}>
                  ↑ <span className="sr-only sm:not-sr-only">{BRIEF_UI_COPY.moveUp}</span>
                </button>
                <button type="button" className="rounded-lg px-2 py-1 text-[11.5px] text-mut hover:bg-tertiary focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-40" disabled={disabled || i === items.length - 1} onClick={() => move(i, i + 1)} aria-label={`${BRIEF_UI_COPY.moveDown}: ${noun} ${i + 1}`}>
                  ↓ <span className="sr-only sm:not-sr-only">{BRIEF_UI_COPY.moveDown}</span>
                </button>
                <button type="button" className="rounded-lg px-2 py-1 text-[11.5px] text-red-600 hover:bg-red-50 focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:text-red-400 dark:hover:bg-red-950/30" disabled={disabled} onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`${BRIEF_UI_COPY.remove}: ${noun} ${i + 1}`}>
                  {BRIEF_UI_COPY.remove}
                </button>
              </div>
            </div>
            {render(item, (next) => onChange(items.map((x, j) => (j === i ? next : x))), i)}
          </li>
        ))}
      </ol>
      {items.length < max && (
        <button type="button" disabled={disabled} onClick={() => onChange([...items, make()])} className="self-start rounded-xl border border-dashed border-em px-3 py-2 text-[12.5px] font-medium text-sec hover:bg-tertiary focus-visible:ring-[3px] focus-visible:ring-ring/50">
          + {BRIEF_UI_COPY.add} {noun}
        </button>
      )}
    </div>
  )
}

function useSubId(base: string) {
  const uid = useId()
  return (part: string | number) => `${base}-${uid}-${part}`
}

const L = BRIEF_OPTION_LABELS
const optional = <T,>(v: T | "") => (v === "" ? undefined : v)

function StringList({ id, data, onChange, disabled, noun, max, itemMax }: FieldRenderProps & { noun: string; max: number; itemMax: number }) {
  const sub = useSubId(id)
  const items = (data[id] as string[] | undefined) ?? []
  return (
    <ListEditor
      noun={noun}
      items={items}
      max={max}
      make={() => ""}
      disabled={disabled}
      onChange={(next) => onChange(next.length ? next : undefined)}
      render={(item, update, i) => (
        <TextControl inputId={sub(i)} label={`${noun} ${i + 1}`} value={item} max={itemMax} onChange={update} disabled={disabled} />
      )}
    />
  )
}

export function BriefFieldInput(props: FieldRenderProps) {
  const { id, data, onChange, onBlur, disabled, describedBy, invalid } = props
  const sub = useSubId(id)
  const def = FIELD_DEFS[id]
  const limits = def.limits as Record<string, unknown>
  const textMax = typeof limits.max === "number" ? limits.max : 200

  switch (id) {
    case "productName":
    case "companyName":
    case "fontPreference":
    case "currentAlternative":
    case "valueProp":
    case "campaignMessage":
    case "companyAddress":
      return (
        <TextControl inputId={id} value={data[id] as string | undefined} max={textMax} placeholder={"example" in def ? def.example : undefined} onChange={(v) => onChange(v)} onBlur={onBlur} disabled={disabled} describedBy={describedBy} invalid={invalid} autoComplete={id === "companyAddress" ? "street-address" : undefined} />
      )
    case "oneLiner":
    case "audienceDescription":
    case "problem":
    case "visualNotes":
    case "objections":
      return (
        <TextControl inputId={id} multiline value={data[id] as string | undefined} max={textMax} placeholder={"example" in def ? def.example : undefined} onChange={(v) => onChange(v)} onBlur={onBlur} disabled={disabled} describedBy={describedBy} invalid={invalid} />
      )
    case "existingUrl":
      return <TextControl inputId={id} type="url" value={data.existingUrl} max={500} placeholder="https://" onChange={(v) => onChange(v.trim())} onBlur={onBlur} disabled={disabled} describedBy={describedBy} invalid={invalid} />
    case "contactEmail":
      return <TextControl inputId={id} type="email" value={data.contactEmail} max={254} onChange={(v) => onChange(v.trim())} onBlur={onBlur} disabled={disabled} describedBy={describedBy} invalid={invalid} autoComplete="email" />
    case "phone":
      return <TextControl inputId={id} type="tel" value={data.phone} max={30} onChange={(v) => onChange(v)} onBlur={onBlur} disabled={disabled} describedBy={describedBy} invalid={invalid} autoComplete="tel" />
    case "launchDate":
      return <Input id={id} type="date" className={cn(control, "w-auto")} value={data.launchDate ?? ""} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} disabled={disabled} aria-describedby={describedBy} aria-invalid={invalid || undefined} />

    case "productType":
      return <Chips name={id} options={PRODUCT_TYPES} labels={L.productType} value={data.productType} onChange={onChange} disabled={disabled} describedBy={describedBy} />
    case "availability":
      return <Chips name={id} options={AVAILABILITY} labels={L.availability} value={data.availability} onChange={onChange} disabled={disabled} describedBy={describedBy} />
    case "primaryGoal":
      return <Chips name={id} options={PRIMARY_GOALS} labels={L.primaryGoal} value={data.primaryGoal} onChange={onChange} disabled={disabled} describedBy={describedBy} />
    case "audienceSegment":
      return <Chips name={id} options={AUDIENCE_SEGMENTS} labels={L.audienceSegment} value={data.audienceSegment} onChange={onChange} disabled={disabled} describedBy={describedBy} />
    case "siteType":
      return <Chips name={id} options={BRIEF_SITE_TYPES} labels={L.siteType} value={data.siteType} onChange={onChange} disabled={disabled} describedBy={describedBy} />
    case "tone":
      return <Chips name={id} multiple max={2} options={TONES} labels={L.tone} value={data.tone} onChange={onChange} disabled={disabled} describedBy={describedBy} />
    case "trafficSources":
      return <Chips name={id} multiple options={TRAFFIC_SOURCES} labels={L.trafficSource} value={data.trafficSources} onChange={onChange} disabled={disabled} describedBy={describedBy} />
    case "language":
      return <Chips name={id} options={BUILDER_CAPABILITIES.languages} labels={{ en: "English" }} value={data.language} onChange={onChange} disabled={disabled} describedBy={describedBy} />
    case "niche":
      return (
        <select id={id} className="h-9 w-full rounded-2xl border border-input bg-input/30 px-3 text-[13px] text-pri focus-visible:ring-[3px] focus-visible:ring-ring/50" value={data.niche ?? ""} onChange={(e) => onChange(optional(e.target.value))} disabled={disabled} aria-describedby={describedBy}>
          <option value="">Let us classify it</option>
          {NicheCategoryEnum.options.map((n) => (
            <option key={n} value={n}>
              {n.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>
      )

    case "allowCompetitorComparison":
    case "showContactPublicly":
    case "proofAttested": {
      const fallback = id === "showContactPublicly"
      const checked = (data[id] as boolean | undefined) ?? fallback
      return (
        <div className="flex items-center gap-3">
          <Switch id={id} checked={checked} onCheckedChange={(v) => onChange(v)} disabled={disabled} aria-describedby={describedBy} aria-invalid={invalid || undefined} />
          <span className="text-[12.5px] text-sec">{checked ? "On" : "Off"}</span>
        </div>
      )
    }

    case "features":
      return (
        <ListEditor noun="feature" items={data.features ?? []} min={2} max={5} disabled={disabled} make={() => ({ title: "", benefit: "" })} onChange={(next) => onChange(next.length ? next : undefined)}
          render={(item, update, i) => (
            <div className="grid gap-2">
              <SubLabel htmlFor={sub(`t${i}`)}>Feature</SubLabel>
              <TextControl inputId={sub(`t${i}`)} value={item.title} max={60} placeholder="Auto-categorise" onChange={(v) => update({ ...item, title: v })} disabled={disabled} />
              <SubLabel htmlFor={sub(`b${i}`)}>Why it matters</SubLabel>
              <TextControl inputId={sub(`b${i}`)} multiline value={item.benefit} max={200} placeholder="Bank lines sorted without effort." onChange={(v) => update({ ...item, benefit: v })} disabled={disabled} />
            </div>
          )}
        />
      )
    case "howItWorks": {
      const hiw = data.howItWorks ?? { steps: [] }
      return (
        <div className="flex flex-col gap-3">
          <ListEditor noun="step" items={hiw.steps} min={2} max={5} disabled={disabled} make={() => ({ title: "", description: "" })} onChange={(steps) => onChange(steps.length || hiw.onboardingNote ? { ...hiw, steps } : undefined)}
            render={(item, update, i) => (
              <div className="grid gap-2">
                <SubLabel htmlFor={sub(`t${i}`)}>Step</SubLabel>
                <TextControl inputId={sub(`t${i}`)} value={item.title} max={60} onChange={(v) => update({ ...item, title: v })} disabled={disabled} />
                <SubLabel htmlFor={sub(`d${i}`)}>What happens</SubLabel>
                <TextControl inputId={sub(`d${i}`)} multiline value={item.description} max={200} onChange={(v) => update({ ...item, description: v })} disabled={disabled} />
              </div>
            )}
          />
          <SubLabel htmlFor={sub("onb")}>Onboarding note (optional)</SubLabel>
          <TextControl inputId={sub("onb")} value={hiw.onboardingNote} max={200} onChange={(v) => onChange({ ...hiw, onboardingNote: optional(v) })} disabled={disabled} />
        </div>
      )
    }
    case "differentiators":
      return <StringList {...props} noun="point" max={5} itemMax={200} />
    case "targetKeywords":
      return <StringList {...props} noun="search term" max={10} itemMax={60} />
    case "trustedBy":
      return <StringList {...props} noun="company" max={10} itemMax={80} />
    case "brandColors":
      return (
        <ListEditor noun="color" items={data.brandColors ?? []} max={5} disabled={disabled} make={() => "#2563EB"} onChange={(next) => onChange(next.length ? next : undefined)}
          render={(item, update, i) => (
            <div className="flex items-center gap-2">
              <input type="color" aria-label={`Color ${i + 1} picker`} value={/^#[0-9a-fA-F]{6}$/.test(item) ? item : "#000000"} onChange={(e) => update(e.target.value)} disabled={disabled} className="h-9 w-12 cursor-pointer rounded-lg border border-base bg-transparent" />
              <TextControl inputId={sub(i)} label={`Color ${i + 1} hex`} value={item} max={7} onChange={update} disabled={disabled} />
            </div>
          )}
        />
      )
    case "competitors":
      return (
        <ListEditor<Item<"competitors">> noun="competitor" items={data.competitors ?? []} max={5} disabled={disabled} make={() => ({ name: "" })} onChange={(next) => onChange(next.length ? next : undefined)}
          render={(item, update, i) => (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1">
                <SubLabel htmlFor={sub(`n${i}`)}>Name</SubLabel>
                <TextControl inputId={sub(`n${i}`)} value={item.name} max={80} onChange={(v) => update({ ...item, name: v })} disabled={disabled} />
              </div>
              <div className="grid gap-1">
                <SubLabel htmlFor={sub(`u${i}`)}>Website (optional)</SubLabel>
                <TextControl inputId={sub(`u${i}`)} type="url" value={item.url} max={500} placeholder="https://" onChange={(v) => update({ ...item, url: optional(v.trim()) })} disabled={disabled} />
              </div>
            </div>
          )}
        />
      )
    case "designReferences":
      return (
        <ListEditor<Item<"designReferences">> noun="reference" items={data.designReferences ?? []} max={3} disabled={disabled} make={() => ({ url: "", redesignFrom: false })} onChange={(next) => onChange(next.length ? next : undefined)}
          render={(item, update, i) => (
            <div className="grid gap-2">
              <SubLabel htmlFor={sub(`u${i}`)}>Link</SubLabel>
              <TextControl inputId={sub(`u${i}`)} type="url" value={item.url} max={500} placeholder="https://" onChange={(v) => update({ ...item, url: v.trim() })} disabled={disabled} />
              <SubLabel htmlFor={sub(`n${i}`)}>What you like about it (optional)</SubLabel>
              <TextControl inputId={sub(`n${i}`)} value={item.note} max={150} onChange={(v) => update({ ...item, note: optional(v) })} disabled={disabled} />
              <label className="flex items-center gap-2 text-[12.5px] text-sec">
                <input type="checkbox" checked={item.redesignFrom} onChange={(e) => update({ ...item, redesignFrom: e.target.checked })} disabled={disabled} className="size-4 accent-blue-600" />
                This is the site I'm redesigning
              </label>
            </div>
          )}
        />
      )
    case "testimonials":
      return (
        <ListEditor<Item<"testimonials">> noun="testimonial" items={data.testimonials ?? []} max={6} disabled={disabled} make={() => ({ quote: "", personName: "", permissionConfirmed: false })} onChange={(next) => onChange(next.length ? next : undefined)}
          render={(item, update, i) => (
            <div className="grid gap-2">
              <SubLabel htmlFor={sub(`q${i}`)}>Quote</SubLabel>
              <TextControl inputId={sub(`q${i}`)} multiline value={item.quote} max={400} onChange={(v) => update({ ...item, quote: v })} disabled={disabled} />
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="grid gap-1">
                  <SubLabel htmlFor={sub(`p${i}`)}>Name</SubLabel>
                  <TextControl inputId={sub(`p${i}`)} value={item.personName} max={80} onChange={(v) => update({ ...item, personName: v })} disabled={disabled} />
                </div>
                <div className="grid gap-1">
                  <SubLabel htmlFor={sub(`r${i}`)}>Role (optional)</SubLabel>
                  <TextControl inputId={sub(`r${i}`)} value={item.role} max={80} onChange={(v) => update({ ...item, role: optional(v) })} disabled={disabled} />
                </div>
                <div className="grid gap-1">
                  <SubLabel htmlFor={sub(`c${i}`)}>Company (optional)</SubLabel>
                  <TextControl inputId={sub(`c${i}`)} value={item.company} max={80} onChange={(v) => update({ ...item, company: optional(v) })} disabled={disabled} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-[12.5px] text-sec">
                <input type="checkbox" checked={item.permissionConfirmed} onChange={(e) => update({ ...item, permissionConfirmed: e.target.checked })} disabled={disabled} className="size-4 accent-blue-600" />
                I have permission to publish this quote
              </label>
            </div>
          )}
        />
      )
    case "metrics":
      return (
        <ListEditor noun="number" items={data.metrics ?? []} max={6} disabled={disabled} make={() => ({ value: "", label: "", sourceNote: "" })} onChange={(next) => onChange(next.length ? next : undefined)}
          render={(item, update, i) => (
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="grid gap-1">
                <SubLabel htmlFor={sub(`v${i}`)}>Number</SubLabel>
                <TextControl inputId={sub(`v${i}`)} value={item.value} max={30} placeholder="1,200" onChange={(v) => update({ ...item, value: v })} disabled={disabled} />
              </div>
              <div className="grid gap-1">
                <SubLabel htmlFor={sub(`l${i}`)}>What it counts</SubLabel>
                <TextControl inputId={sub(`l${i}`)} value={item.label} max={80} placeholder="freelancers onboarded" onChange={(v) => update({ ...item, label: v })} disabled={disabled} />
              </div>
              <div className="grid gap-1">
                <SubLabel htmlFor={sub(`s${i}`)}>Where it comes from</SubLabel>
                <TextControl inputId={sub(`s${i}`)} value={item.sourceNote} max={120} placeholder="Our billing data, Sept 2026" onChange={(v) => update({ ...item, sourceNote: v })} disabled={disabled} />
              </div>
            </div>
          )}
        />
      )
    case "certifications":
      return (
        <ListEditor noun="certification" items={data.certifications ?? []} max={8} disabled={disabled} make={() => ({ name: "" })} onChange={(next) => onChange(next.length ? next : undefined)}
          render={(item, update, i) => <TextControl inputId={sub(i)} label={`Certification ${i + 1}`} value={item.name} max={80} onChange={(v) => update({ name: v })} disabled={disabled} />}
        />
      )
    case "faq":
      return (
        <ListEditor noun="question" items={data.faq ?? []} max={10} disabled={disabled} make={() => ({ q: "", a: "" })} onChange={(next) => onChange(next.length ? next : undefined)}
          render={(item, update, i) => (
            <div className="grid gap-2">
              <SubLabel htmlFor={sub(`q${i}`)}>Question</SubLabel>
              <TextControl inputId={sub(`q${i}`)} value={item.q} max={150} onChange={(v) => update({ ...item, q: v })} disabled={disabled} />
              <SubLabel htmlFor={sub(`a${i}`)}>Answer</SubLabel>
              <TextControl inputId={sub(`a${i}`)} multiline value={item.a} max={500} onChange={(v) => update({ ...item, a: v })} disabled={disabled} />
            </div>
          )}
        />
      )

    case "pricing": {
      const pricing = data.pricing ?? { mode: "HIDE" as const }
      return (
        <div className="flex flex-col gap-3">
          <Chips name={id} options={PRICING_MODES} labels={L.pricingMode} value={pricing.mode} onChange={(mode) => onChange({ ...pricing, mode })} disabled={disabled} describedBy={describedBy} />
          {pricing.mode === "SHOW_PLANS" && (
            <ListEditor noun="plan" items={pricing.plans ?? []} min={1} max={4} disabled={disabled} make={() => ({ name: "", price: "", currency: "USD", interval: "MONTHLY" as const, features: [], highlighted: false })} onChange={(plans) => onChange({ ...pricing, plans: plans.length ? plans : undefined })}
              render={(plan, update, i) => (
                <div className="grid gap-2">
                  <div className="grid gap-2 sm:grid-cols-4">
                    <div className="grid gap-1 sm:col-span-2">
                      <SubLabel htmlFor={sub(`n${i}`)}>Plan name</SubLabel>
                      <TextControl inputId={sub(`n${i}`)} value={plan.name} max={40} onChange={(v) => update({ ...plan, name: v })} disabled={disabled} />
                    </div>
                    <div className="grid gap-1">
                      <SubLabel htmlFor={sub(`p${i}`)}>Price</SubLabel>
                      <TextControl inputId={sub(`p${i}`)} value={plan.price} max={12} placeholder="19.99" onChange={(v) => update({ ...plan, price: v.trim() })} disabled={disabled} />
                    </div>
                    <div className="grid gap-1">
                      <SubLabel htmlFor={sub(`c${i}`)}>Currency</SubLabel>
                      <TextControl inputId={sub(`c${i}`)} value={plan.currency} max={3} placeholder="USD" onChange={(v) => update({ ...plan, currency: v.trim().toUpperCase() })} disabled={disabled} />
                    </div>
                  </div>
                  <Chips name={sub(`i${i}`)} options={PRICE_INTERVALS} labels={L.priceInterval} value={plan.interval} onChange={(interval) => update({ ...plan, interval: interval as typeof plan.interval })} disabled={disabled} />
                  <SubLabel htmlFor={sub(`f${i}`)}>What's included (one per line, up to 8)</SubLabel>
                  <Textarea id={sub(`f${i}`)} rows={3} className={control} value={plan.features.join("\n")} onChange={(e) => update({ ...plan, features: e.target.value.split("\n").slice(0, 8) })} disabled={disabled} />
                  <label className="flex items-center gap-2 text-[12.5px] text-sec">
                    <input type="checkbox" checked={plan.highlighted} onChange={(e) => update({ ...plan, highlighted: e.target.checked })} disabled={disabled} className="size-4 accent-blue-600" />
                    Highlight this plan
                  </label>
                </div>
              )}
            />
          )}
          {pricing.mode !== "HIDE" && (
            <>
              <SubLabel htmlFor={sub("trial")}>Trial note (optional)</SubLabel>
              <TextControl inputId={sub("trial")} value={pricing.trialNote} max={150} onChange={(v) => onChange({ ...pricing, trialNote: optional(v) })} disabled={disabled} />
            </>
          )}
        </div>
      )
    }

    case "ctaPrimary":
    case "ctaSecondary": {
      const cta = data[id] ?? { label: "", type: "URL" as const }
      const types = CTA_TYPES.filter((t) => t !== "FORM" || BUILDER_CAPABILITIES.formHandler)
      return (
        <div className="grid gap-2">
          <SubLabel htmlFor={sub("label")}>Button text</SubLabel>
          <TextControl inputId={sub("label")} value={cta.label} max={30} placeholder="Start free trial" onChange={(v) => onChange({ ...cta, label: v })} onBlur={onBlur} disabled={disabled} invalid={invalid} />
          <Chips name={sub("type")} options={types} labels={L.ctaType} value={cta.type} onChange={(type) => onChange({ ...cta, type: type as typeof cta.type })} disabled={disabled} describedBy={describedBy} />
          {cta.type === "URL" && (
            <>
              <SubLabel htmlFor={sub("url")}>Where it goes</SubLabel>
              <TextControl inputId={sub("url")} type="url" value={cta.url} max={500} placeholder="https://cal.com/you" onChange={(v) => onChange({ ...cta, url: optional(v.trim()) })} onBlur={onBlur} disabled={disabled} invalid={invalid} />
            </>
          )}
          {cta.type === "EMAIL" && <p className="text-[11.5px] text-mut">Opens an email to your contact address.</p>}
        </div>
      )
    }
    case "afterConversion": {
      const ac = data.afterConversion ?? { message: "" }
      return (
        <div className="grid gap-2">
          <SubLabel htmlFor={sub("msg")}>Thank-you message</SubLabel>
          <TextControl inputId={sub("msg")} multiline value={ac.message} max={300} onChange={(v) => onChange(v || ac.expectedResponseTime ? { ...ac, message: v } : undefined)} disabled={disabled} />
          <SubLabel htmlFor={sub("resp")}>Expected response time (optional)</SubLabel>
          <TextControl inputId={sub("resp")} value={ac.expectedResponseTime} max={100} placeholder="Within one business day" onChange={(v) => onChange({ ...ac, expectedResponseTime: optional(v) })} disabled={disabled} />
          <SubLabel htmlFor={sub("notify")}>Send notifications to (optional, never shown)</SubLabel>
          <TextControl inputId={sub("notify")} type="email" value={ac.notifyEmail} max={254} onChange={(v) => onChange({ ...ac, notifyEmail: optional(v.trim()) })} disabled={disabled} />
        </div>
      )
    }
    case "audienceDetails": {
      const ad = data.audienceDetails ?? {}
      const set = (patch: Partial<NonNullable<BriefData["audienceDetails"]>>) => {
        const next = { ...ad, ...patch }
        onChange(Object.values(next).some(Boolean) ? next : undefined)
      }
      return (
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="grid gap-1">
            <SubLabel htmlFor={sub("ind")}>Industry</SubLabel>
            <TextControl inputId={sub("ind")} value={ad.industry} max={100} onChange={(v) => set({ industry: optional(v) })} disabled={disabled} />
          </div>
          <div className="grid gap-1">
            <SubLabel htmlFor={sub("size")}>Company size</SubLabel>
            <TextControl inputId={sub("size")} value={ad.companySize} max={60} onChange={(v) => set({ companySize: optional(v) })} disabled={disabled} />
          </div>
          <div className="grid gap-1">
            <SubLabel htmlFor={sub("reg")}>Region</SubLabel>
            <TextControl inputId={sub("reg")} value={ad.region} max={100} onChange={(v) => set({ region: optional(v) })} disabled={disabled} />
          </div>
          <div className="sm:col-span-3">
            <Chips name={sub("tech")} options={TECH_LEVELS} labels={L.techLevel} value={ad.techLevel} onChange={(v) => set({ techLevel: v as (typeof TECH_LEVELS)[number] })} disabled={disabled} />
          </div>
        </div>
      )
    }
    case "buyer": {
      const buyer = data.buyer ?? { sameAsUser: true }
      return (
        <div className="grid gap-2">
          <label className="flex items-center gap-2 text-[12.5px] text-sec">
            <input type="checkbox" checked={buyer.sameAsUser} onChange={(e) => onChange({ ...buyer, sameAsUser: e.target.checked })} disabled={disabled} className="size-4 accent-blue-600" />
            The person who uses it also buys it
          </label>
          {!buyer.sameAsUser && (
            <>
              <SubLabel htmlFor={sub("desc")}>Who decides to buy?</SubLabel>
              <TextControl inputId={sub("desc")} value={buyer.description} max={200} onChange={(v) => onChange({ ...buyer, description: optional(v) })} disabled={disabled} />
            </>
          )}
        </div>
      )
    }
    case "socialLinks": {
      const links = data.socialLinks ?? {}
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {SOCIAL_NETWORKS.map((n) => (
            <div key={n} className="grid gap-1">
              <SubLabel htmlFor={sub(n)}>{L.socialNetwork[n]}</SubLabel>
              <TextControl inputId={sub(n)} type="url" value={links[n]} max={500} placeholder="https://" onChange={(v) => {
                const next = { ...links, [n]: optional(v.trim()) }
                onChange(Object.values(next).some(Boolean) ? next : undefined)
              }} disabled={disabled} />
            </div>
          ))}
        </div>
      )
    }
    case "legal": {
      const legal = data.legal ?? { mode: "GENERATE_TEMPLATE" as const }
      return (
        <div className="grid gap-2">
          <Chips name={id} options={LEGAL_MODES} labels={L.legalMode} value={legal.mode} onChange={(mode) => onChange({ ...legal, mode })} disabled={disabled} describedBy={describedBy} />
          {legal.mode === "LINK_OWN" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1">
                <SubLabel htmlFor={sub("priv")}>Privacy policy link</SubLabel>
                <TextControl inputId={sub("priv")} type="url" value={legal.privacyUrl} max={500} placeholder="https://" onChange={(v) => onChange({ ...legal, privacyUrl: optional(v.trim()) })} disabled={disabled} />
              </div>
              <div className="grid gap-1">
                <SubLabel htmlFor={sub("terms")}>Terms link (optional)</SubLabel>
                <TextControl inputId={sub("terms")} type="url" value={legal.termsUrl} max={500} placeholder="https://" onChange={(v) => onChange({ ...legal, termsUrl: optional(v.trim()) })} disabled={disabled} />
              </div>
            </div>
          )}
          {legal.mode !== "NONE" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1">
                <SubLabel htmlFor={sub("entity")}>Legal entity name (optional)</SubLabel>
                <TextControl inputId={sub("entity")} value={legal.legalEntityName} max={120} onChange={(v) => onChange({ ...legal, legalEntityName: optional(v) })} disabled={disabled} />
              </div>
              <div className="grid gap-1">
                <SubLabel htmlFor={sub("country")}>Country (optional)</SubLabel>
                <TextControl inputId={sub("country")} value={legal.country} max={60} onChange={(v) => onChange({ ...legal, country: optional(v) })} disabled={disabled} />
              </div>
            </div>
          )}
        </div>
      )
    }
    case "logo":
      return <LogoInput {...props} />
    default:
      return null
  }
}

function LogoInput({ id, data, onUpload, uploading, disabled, describedBy, logoUrl, onChange }: FieldRenderProps) {
  const [localError, setLocalError] = useState<string | null>(null)
  return (
    <div className="flex items-center gap-3">
      {data.logo && logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="Your logo" className="h-12 w-12 rounded-xl border border-base object-contain" />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-dashed border-em text-[10px] text-mut" aria-hidden="true">
          Logo
        </div>
      )}
      <label className={cn("cursor-pointer rounded-xl border border-base px-3 py-2 text-[12.5px] font-medium text-sec hover:bg-tertiary focus-within:ring-[3px] focus-within:ring-ring/50", (disabled || uploading) && "opacity-50")}>
        {uploading ? "Uploading…" : data.logo ? "Replace logo" : "Upload logo"}
        <input
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          disabled={disabled || uploading}
          aria-describedby={describedBy}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ""
            if (!file) return
            if (file.size > 2 * 1024 * 1024) return setLocalError("Logos can be up to 2 MB")
            setLocalError(null)
            onUpload?.(file)
          }}
        />
      </label>
      {data.logo && (
        <button type="button" className="text-[12px] text-mut underline underline-offset-2" onClick={() => onChange(undefined)} disabled={disabled}>
          {BRIEF_UI_COPY.remove}
        </button>
      )}
      {localError && <span className="text-[12px] text-red-600 dark:text-red-400">{localError}</span>}
    </div>
  )
}
