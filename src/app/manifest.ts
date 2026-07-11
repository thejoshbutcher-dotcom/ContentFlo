import type { MetadataRoute } from "next";

/**
 * Web app manifest — makes CreatorFlo installable ("Add to Dock" on macOS,
 * "Add to Home Screen" on iOS, install button on Chrome/Edge). Next serves this
 * at /manifest.webmanifest and injects the <link rel="manifest"> automatically.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CreatorFlo",
    short_name: "CreatorFlo",
    description:
      "The content OS for creators — plan, script, organize, and publish from one workspace.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#181A20",
    theme_color: "#181A20",
    categories: ["productivity", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
