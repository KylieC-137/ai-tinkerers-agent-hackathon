import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Build Coach",
    short_name: "Build Coach",
    description: "Hands-free, camera-aware coaching for physical projects.",
    start_url: "/",
    display: "standalone",
    background_color: "#10140f",
    theme_color: "#10140f",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
