"use client"

import { MODELS } from "@repo/schemas"
import type { ModelId, ModelProvider } from "@repo/schemas"
import { useModelStore } from "@/stores/modelStore"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const PROVIDER_LABELS: Record<ModelProvider, string> = {
  anthropic: "Anthropic Claude",
  deepseek: "DeepSeek",
  openai: "OpenAI",
  kimi: "Kimi (Moonshot)",
}

const PROVIDER_ORDER: ModelProvider[] = ["anthropic", "deepseek", "openai", "kimi"]

// Group models by provider for the dropdown sections
const grouped = PROVIDER_ORDER.map((provider) => ({
  provider,
  label: PROVIDER_LABELS[provider],
  models: MODELS.filter((m) => m.provider === provider),
}))

type Props = {
  disabled?: boolean
}

export function ModelSelector({ disabled }: Props) {
  const { selectedModelId, setModel } = useModelStore()

  return (
    <Select
      value={selectedModelId}
      onValueChange={(v) => setModel(v as ModelId)}
      disabled={disabled}
    >
      <SelectTrigger className="h-8 w-52 text-xs">
        <SelectValue placeholder="Select model" />
      </SelectTrigger>
      <SelectContent>
        {grouped.map(({ provider, label, models }) => (
          <SelectGroup key={provider}>
            <SelectLabel className="text-xs font-semibold text-muted-foreground">
              {label}
            </SelectLabel>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id} className="text-xs">
                <span className="font-medium">{m.label}</span>
                <span className="ml-1.5 text-muted-foreground">
                  — {m.description}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
