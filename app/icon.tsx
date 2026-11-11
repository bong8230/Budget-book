import { ImageResponse } from "next/og";

export function generateImageMetadata() {
  return [
    { id: "192", size: { width: 192, height: 192 }, contentType: "image/png" },
    { id: "512", size: { width: 512, height: 512 }, contentType: "image/png" },
  ];
}

export default async function Icon({ id }: { id: Promise<string> | string }) {
  const size = Number(await id);
  return new ImageResponse(<AppMark size={size} />, { width: size, height: size });
}

export function AppMark({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        background: "#1f6f5c",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: size * 0.5,
          height: size * 0.5,
          borderRadius: size * 0.08,
          background: "#f6f5f1",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: size * 0.05,
          padding: size * 0.08,
        }}
      >
        <div style={{ height: size * 0.04, background: "#1f6f5c", borderRadius: size * 0.02 }} />
        <div style={{ height: size * 0.04, width: "70%", background: "#1f6f5c", borderRadius: size * 0.02 }} />
        <div style={{ height: size * 0.04, width: "45%", background: "#b4472f", borderRadius: size * 0.02 }} />
      </div>
    </div>
  );
}
