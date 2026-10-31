import MapScene from "@/components/MapScene";

type HomeProps = {
  searchParams: { hour?: string };
};

/** Optional `?hour=21.5` – pins the Arafat-local time of day (handy for testing day/night). */
function parseHour(raw?: string): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value >= 0 && value <= 24 ? value : undefined;
}

export default function Home({ searchParams }: HomeProps) {
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#05050A]">
      <MapScene hourOverride={parseHour(searchParams.hour)} />
    </main>
  );
}
