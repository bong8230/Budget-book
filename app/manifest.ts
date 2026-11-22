import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "우리집 가계부",
    short_name: "가계부",
    description: "부부가 함께 쓰는 공동 가계부",
    lang: "ko",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f5f1",
    theme_color: "#f6f5f1",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "말로 추가", short_name: "말로 추가", url: "/voice", icons: [{ src: "/icon/192", sizes: "192x192", type: "image/png" }] },
      { name: "직접 입력", short_name: "직접 입력", url: "/transactions/new", icons: [{ src: "/icon/192", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
