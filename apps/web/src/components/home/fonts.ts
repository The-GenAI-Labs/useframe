import { Instrument_Serif, Newsreader } from "next/font/google";

export const serif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  fallback: ["Georgia", "serif"],
});

export const landingFont = Newsreader({
  subsets: ["latin"],
  style: "normal",
  display: "swap",
  fallback: ["Georgia", "serif"],
});
