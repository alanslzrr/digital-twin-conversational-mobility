import { Tools } from "../../_components/views";
export default async function Page({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  return <Tools name={name} />;
}
