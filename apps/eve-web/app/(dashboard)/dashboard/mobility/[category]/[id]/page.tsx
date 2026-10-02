import { Mobility } from "../../../_components/views";
export default async function Page({
  params,
}: {
  params: Promise<{ category: string; id: string }>;
}) {
  const { category, id } = await params;
  return <Mobility category={category} id={id} />;
}
