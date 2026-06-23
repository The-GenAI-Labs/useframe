"use client";

import { memo } from "react";
import Image from "next/image";

export const ImageGallery = memo(function ImageGallery({
  images,
  title,
}: {
  images: string[];
  title: string;
}) {
  return (
    <div className="grid h-40 w-full grid-cols-2 grid-rows-2 gap-2.5">
      <div className="relative col-span-1 row-span-2 overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-lg">
        <Image
          src={images[0]}
          alt={`${title} preview 1`}
          fill
          sizes="(max-width: 1024px) 40vw, 180px"
          className="object-cover object-top"
        />
      </div>
      {images.slice(1, 3).map((src, i) => (
        <div
          key={src}
          className="relative col-span-1 row-span-1 overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-lg"
        >
          <Image
            src={src}
            alt={`${title} preview ${i + 2}`}
            fill
            sizes="(max-width: 1024px) 40vw, 140px"
            className="object-cover object-top"
          />
        </div>
      ))}
    </div>
  );
});
