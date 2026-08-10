"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { CreateProjectSchema } from "@repo/schemas"
import type { CreateProjectInput, ProjectInputType } from "@repo/schemas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const NICHES = [
  "EDTECH",
  "HEALTH_WELLNESS",
  "FINTECH",
  "SAAS_B2B",
  "ECOMMERCE",
  "FOOD_LIFESTYLE",
  "FITNESS",
  "LUXURY",
  "MEDITATION",
  "KIDS",
  "OTHER",
] as const

const NICHE_LABELS: Record<string, string> = {
  EDTECH: "EdTech",
  HEALTH_WELLNESS: "Health & Wellness",
  FINTECH: "FinTech",
  SAAS_B2B: "SaaS / B2B",
  ECOMMERCE: "E-Commerce",
  FOOD_LIFESTYLE: "Food & Lifestyle",
  FITNESS: "Fitness",
  LUXURY: "Luxury",
  MEDITATION: "Meditation",
  KIDS: "Kids",
  OTHER: "Other",
}

type Props = {
  inputType: ProjectInputType
  onSubmit: (data: CreateProjectInput) => Promise<void>
  isLoading: boolean
}

export function ProjectForm({ inputType, onSubmit, isLoading }: Props) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateProjectInput>({
    resolver: zodResolver(CreateProjectSchema),
    defaultValues: { inputType, siteType: undefined },
  })

  const siteType = watch("siteType")

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <input type="hidden" {...register("inputType")} value={inputType} />

      <div className="space-y-1.5">
        <Label htmlFor="name">Project name</Label>
        <Input
          id="name"
          placeholder="My awesome startup"
          {...register("name")}
        />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="startupIdea">Startup idea</Label>
        <Textarea
          id="startupIdea"
          rows={3}
          placeholder="Describe what your product does and the problem it solves..."
          {...register("startupIdea")}
        />
        {errors.startupIdea && (
          <p className="text-xs text-destructive">{errors.startupIdea.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Niche</Label>
          <Select
            onValueChange={(v) =>
              setValue("niche", v as CreateProjectInput["niche"])
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select niche" />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={6} className="z-9999">
              {NICHES.map((n) => (
                <SelectItem key={n} value={n}>
                  {NICHE_LABELS[n]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.niche && (
            <p className="text-xs text-destructive">{errors.niche.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="targetAudience">Target audience</Label>
          <Input
            id="targetAudience"
            placeholder="e.g. Freelance designers, 25-40"
            {...register("targetAudience")}
          />
          {errors.targetAudience && (
            <p className="text-xs text-destructive">
              {errors.targetAudience.message}
            </p>
          )}
        </div>
      </div>

      {inputType !== "FROM_SCRATCH" && (
        <div className="space-y-1.5">
          <Label htmlFor="sourceUrl">
            {inputType === "FROM_COMPETITOR"
              ? "Competitor URL"
              : "Your site URL"}
          </Label>
          <Input
            id="sourceUrl"
            type="url"
            placeholder="https://example.com"
            {...register("sourceUrl")}
          />
          {errors.sourceUrl && (
            <p className="text-xs text-destructive">{errors.sourceUrl.message}</p>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Site type</Label>
        <div className="flex flex-wrap gap-2">
          {(["SINGLE_PAGE", "MULTI_PAGE"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setValue("siteType", t)}
              className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer ${
                siteType === t
                  ? "border-em bg-bubble text-pri"
                  : "border-base text-sec hover:border-em"
              }`}
            >
              {t === "SINGLE_PAGE" ? "Single page" : "Multi page"}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setValue("siteType", undefined)}
            className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer ${
              siteType === undefined
                ? "border-em bg-bubble text-pri"
                : "border-base text-sec hover:border-em"
            }`}
          >
            Let AI decide
          </button>
        </div>
      </div>

      <Button
        type="submit"
        className="w-full rounded-xl bg-inv py-3 text-[13.5px] font-semibold text-inv hover:bg-inv hover:opacity-90"
        disabled={isLoading}
      >
        {isLoading ? "Creating..." : "Create project"}
      </Button>
    </form>
  )
}
