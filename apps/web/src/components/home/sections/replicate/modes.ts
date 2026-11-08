import { Camera, Clapperboard, MousePointerClick } from "lucide-react";

export const MODES = [
  {
    id: "animation",
    icon: Clapperboard,
    label: "Animation",
    title: "Replicate with animation",
    description:
      "Carries over the motion as well as the layout: scroll effects, transitions and hover states, so the copy feels like the original.",
    accent: "124,58,237",
    image: undefined as string | undefined,
  },
  {
    id: "static",
    icon: Camera,
    label: "Static",
    title: "Replicate as a static page",
    description:
      "A clean, close copy of the layout, typography and imagery. Light, fast and ready to edit, with no moving parts to maintain.",
    accent: "14,165,233",
    image: undefined as string | undefined,
  },
  {
    id: "dynamic",
    icon: MousePointerClick,
    label: "Dynamic",
    title: "Replicate with working components",
    description:
      "Rebuilds interactive pieces such as menus, tabs, sliders and forms as real components you can extend and connect to your own data.",
    accent: "16,185,129",
    image: undefined as string | undefined,
  },
] as const;
