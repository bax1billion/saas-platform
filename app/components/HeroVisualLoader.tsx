"use client";

import dynamic from "next/dynamic";

const HeroVisual = dynamic(() => import("./HeroVisual"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[400px] w-full items-center justify-center lg:h-[500px]">
      <div className="h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
    </div>
  ),
});

export default function HeroVisualLoader() {
  return <HeroVisual />;
}
