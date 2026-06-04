import Globe from "@/components/Globe";
import { createClient } from "@/lib/supabase/server";

async function getEvents() {
  try {
    const supabase = await createClient();

    const today = new Date();
    const pastDate = new Date(today);
    pastDate.setDate(today.getDate() - 90);
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + 365);

    const { data, error } = await supabase
      .from("events")
      .select(
        "id, name, description, start_date, end_date, lat, lng, city, country, event_type, tier, venue_name, venue_address, event_time, registration_url, is_side_event, parent_event_id, tags, status"
      )
      .eq("status", "confirmed")
      .not("lat", "is", null)
      .not("lng", "is", null)
      .gte("start_date", pastDate.toISOString().split("T")[0])
      .lte("start_date", futureDate.toISOString().split("T")[0])
      .order("start_date", { ascending: true });

    if (error || !data) return [];

    const now = today;
    return data.map((event) => {
      const start = new Date(event.start_date);
      const end = event.end_date ? new Date(event.end_date) : start;
      return {
        ...event,
        is_past: end < now,
        is_current: start <= now && end >= now,
      };
    });
  } catch {
    return [];
  }
}

export default async function EmbedPage() {
  const events = await getEvents();

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
      <Globe initialEvents={events} />
    </div>
  );
}
