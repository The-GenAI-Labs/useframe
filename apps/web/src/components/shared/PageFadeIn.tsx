"use client";

import { motion } from "framer-motion";

export function PageFadeIn({ children }: { children: React.ReactNode }) {
    return (
        <motion.div
            className="h-full w-full"
            initial={{ opacity: 0, y: 14, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
            {children}
        </motion.div>
    );
}
