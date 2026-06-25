import {
  Cpu,
  HeartPulse,
  Dumbbell,
  LayoutDashboard,
  ShoppingBag,
  BookOpen,
  Briefcase,
  Leaf,
  type LucideIcon,
} from "lucide-react";

export type Category = {
  title: string;
  prompt: string;
  icon: LucideIcon;
  tone: string;
  iconTone: string;
  badge: string;
  src: string;
};

export const CATEGORIES: Category[] = [
  {
    title: "Tech",
    prompt: "Build a modern SaaS landing page for a B2B tech startup",
    icon: Cpu,
    tone: "bg-sky-50",
    iconTone: "bg-sky-100 text-sky-600",
    badge: "AI-Powered Inspection Platform",
    src: "/auth/login14.png",
  },
  {
    title: "Healthcare",
    prompt: "Design a clean patient portal for a digital health clinic",
    icon: HeartPulse,
    tone: "bg-rose-50",
    iconTone: "bg-rose-100 text-rose-600",
    badge: "Smart Health, Simplified",
    src: "/auth/login18.png",
  },
  {
    title: "Fitness",
    prompt: "Create a fitness app landing page with workout tracking",
    icon: Dumbbell,
    tone: "bg-orange-50",
    iconTone: "bg-orange-100 text-orange-600",
    badge: "The Fitness Journey Starts Here",
    src: "/auth/login16.png",
  },
  {
    title: "SaaS",
    prompt: "Generate a conversion-focused SaaS product page with pricing",
    icon: LayoutDashboard,
    tone: "bg-violet-50",
    iconTone: "bg-violet-100 text-violet-600",
    badge: "Ship faster with clean code",
    src: "/auth/login17.png",
  },
  {
    title: "E-Commerce",
    prompt: "Build a premium fashion e-commerce storefront",
    icon: ShoppingBag,
    tone: "bg-emerald-50",
    iconTone: "bg-emerald-100 text-emerald-600",
    badge: "Shop the future of fashion",
    src: "/auth/login13.png",
  },
  {
    title: "Education",
    prompt: "Design an online learning platform for professional courses",
    icon: BookOpen,
    tone: "bg-amber-50",
    iconTone: "bg-amber-100 text-amber-600",
    badge: "Learn anything, anywhere",
    src: "/auth/landing1.png",
  },
  {
    title: "Finance",
    prompt: "Create a fintech dashboard for personal finance management",
    icon: Briefcase,
    tone: "bg-blue-50",
    iconTone: "bg-blue-100 text-blue-600",
    badge: "Manage your secret finance system",
    src: "/auth/login12.png",
  },
  {
    title: "Sustainability",
    prompt: "Build a green energy company website with impact metrics",
    icon: Leaf,
    tone: "bg-teal-50",
    iconTone: "bg-teal-100 text-teal-600",
    badge: "New Energy for the Future",
    src: "/auth/landing2.png",
  },
];
