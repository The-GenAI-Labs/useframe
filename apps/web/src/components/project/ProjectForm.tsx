"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { CreateProjectSchema } from "@repo/schemas"
import type { CreateProjectInput, ProjectInputType } from "@repo/schemas"
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
  /** Collected in step 1 of the modal, not re-asked here. */
  name: string
  siteType: CreateProjectInput["siteType"]
  onSubmit: (data: CreateProjectInput) => Promise<void>
  isLoading: boolean
}

export function ProjectForm({ inputType, name, siteType, onSubmit, isLoading }: Props) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CreateProjectInput>({
    resolver: zodResolver(CreateProjectSchema),
    defaultValues: { inputType, name, siteType },
  })

  // flex-1 + mt-auto on the button mirrors step 1's layout, so Submit sits
  // pinned at the bottom in exactly the same place Continue does.
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-5">
      <input type="hidden" {...register("inputType")} value={inputType} />
      <input type="hidden" {...register("name")} value={name} />

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

      {inputType === "FROM_OWN_SITE" && (
        <div className="space-y-1.5">
          <Label htmlFor="sourceUrl">Your site URL</Label>
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

      <div className="mt-auto pt-4">
        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-2xl bg-inv py-3.5 text-[13.5px] font-semibold text-inv transition-opacity duration-150 hover:opacity-90 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isLoading ? "Submitting..." : "Submit"}
        </button>
      </div>
    </form>
  )
}
