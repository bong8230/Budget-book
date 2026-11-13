import { PageHeader } from "@/components/page-header";
import { AiChat } from "./ai-chat";

export const metadata = { title: "AI에게 묻기 · 우리집 가계부" };

export default function AiPage() {
  return (
    <>
      <PageHeader title="AI에게 묻기" back="/" />
      <AiChat />
    </>
  );
}
