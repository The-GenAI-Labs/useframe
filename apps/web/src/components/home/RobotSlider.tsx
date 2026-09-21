"use client";

import { memo, useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";

// All the landing-page design screenshots previously used by the now-removed
// FloatingCards left/right cards — reused here as one continuous slider
// instead of two separate side cards.
const DESIGN_IMAGES = [
  "/auth/landing1.png",
  "/auth/landing2.png",
  "/auth/login1.png",
  "/auth/login2.png",
  "/auth/login3.png",
  "/auth/login4.png",
  "/auth/login5.png",
  "/auth/login6.png",
  "/auth/login7.png",
  "/auth/login8.png",
  "/auth/login9.png",
  "/auth/login10.png",
  "/auth/login12.png",
  "/auth/login13.png",
  "/auth/login14.png",
  "/auth/login16.png",
  "/auth/login17.png",
  "/auth/login18.png",
  "/auth/login20.png",
];

// The robot's TV head is tilted, so the screen cutout is a rotated quad, not
// an axis-aligned box. Measured off the PNG's own alpha channel (1145x1374):
// flood-filled the transparent screen region, then found the tilt from its
// edge slopes (~14.8deg clockwise) and the un-rotated bounding rect. Placing
// the slider as a rect at these coords and rotating it by the same angle
// makes it sit flush inside the screen instead of cutting across the frame.
const SCREEN_TILT_DEG = 14.8;

const SCREEN_STYLE = {
  left: "39.87%",
  top: "19.17%",
  width: "40.33%",
  height: "26.25%",
  transform: `rotate(${SCREEN_TILT_DEG}deg)`,
};

// The robot's TV-screen head, with the same landing-page designs auto-
// cycling inside its face that FloatingCards used to show beside the
// chatbox. Sits on top of (and overlapping) whatever it's placed against —
// give the wrapper a z-index higher than that element from the outside.
export const RobotSlider = memo(function RobotSlider({ className = "" }: { className?: string }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % DESIGN_IMAGES.length), 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={`pointer-events-none relative ${className}`}>
      {/* Slider sits UNDER the robot PNG and shows through its transparent
          screen cutout, so the bezel masks the slider's corners for free. */}
      <div
        className="absolute z-0 overflow-hidden rounded-[6%] bg-slate-950"
        style={SCREEN_STYLE}
      >
        <AnimatePresence initial={false}>
          <motion.div
            key={index}
            className="absolute inset-0"
            initial={{ y: "100%" }}
            animate={{ y: "0%" }}
            exit={{ y: "-100%" }}
            transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
          >
            <Image
              src={DESIGN_IMAGES[index]}
              alt="UseFrame landing page design"
              fill
              sizes="220px"
              className="object-cover object-top"
            />
          </motion.div>
        </AnimatePresence>
      </div>

      <Image
        src="/chat/useframe landing robot.png"
        alt=""
        width={1145}
        height={1374}
        priority
        className="relative z-10 h-full w-full object-contain drop-shadow-[0_16px_30px_rgba(15,23,42,0.25)]"
      />
    </div>
  );
});
