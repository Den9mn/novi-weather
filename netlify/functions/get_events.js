// netlify/functions/get_events.js
//
// Reads events from your Google Sheet CSV,
// filters past events,
// and returns only the next upcoming instance for repeating events.

export const handler = async () => {
  try {
    // Your actual sheet URL (Calendar tab)
    const sheetURL =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vTjeDyrQ8IFSU42awHxOOAWYVkf-0xdm08Qf45xz1d3HcmBoINj04y0xmwW59LH1LSKqbXP0yhMCXfV/pub?gid=1755129031&single=true&output=csv";

    // Fetch CSV
    const res = await fetch(sheetURL);
    const csv = await res.text();

    // Split into rows + columns
    const rows = csv.split("\n").map((r) => r.split(","));
    const [header, ...entries] = rows;

    const now = new Date();

    // Convert CSV rows into event objects
    const parsed = entries
      .map((row) => {
        const name = row[0]?.trim();
        const description = row[1]?.trim();
        const dateStr = row[2]?.trim();
        const timeStr = row[3]?.trim();

        if (!name || !dateStr) return null;

        // Combine date + time
        const datetime = new Date(`${dateStr}T${timeStr || "00:00"}`);
        if (isNaN(datetime)) return null;

        return { name, description, date: dateStr, time: timeStr, datetime };
      })
      .filter(Boolean);

    // 1️⃣ Only future events
    const future = parsed.filter((ev) => ev.datetime >= now);

    // 2️⃣ For repeating events (same name), keep the nearest
    const soonest = {};
    for (const ev of future) {
      if (!soonest[ev.name] || ev.datetime < soonest[ev.name].datetime) {
        soonest[ev.name] = ev;
      }
    }

    // 3️⃣ Sorted by date/time
    const events = Object.values(soonest)
      .sort((a, b) => a.datetime - b.datetime)
      .map((ev) => ({
        name: ev.name,
        description: ev.description,
        date: ev.date,
        time: ev.time,
      }));

    return {
      statusCode: 200,
      body: JSON.stringify({ events }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};