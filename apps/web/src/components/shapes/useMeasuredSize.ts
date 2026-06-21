"use client";

import { useLayoutEffect, useRef, useState } from "react";

export function useMeasuredSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const read = () => {
      const r = el.getBoundingClientRect();
      setSize((prev) =>
        prev.width === r.width && prev.height === r.height
          ? prev
          : { width: r.width, height: r.height },
      );
    };

    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, ...size };
}
