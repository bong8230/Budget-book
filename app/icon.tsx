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
    <div style={{ display: "flex", width: size, height: size, background: "#1f6f5c" }}>
      <svg width={size} height={size} viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M118 239L256 126L394 239" stroke="#F6F5F1" strokeWidth="27" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M151 226V347C151 367 167 383 187 383H325C345 383 361 367 361 347V226" fill="#F6F5F1" />
        <path d="M256 336C247 328 207 305 207 277C207 258 230 250 244 264L256 276L268 264C282 250 305 258 305 277C305 305 265 328 256 336Z" fill="#B4472F" />
      </svg>
    </div>
  );
}
