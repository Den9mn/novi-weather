// netlify/functions/get_events.js

function parseDate(dateStr, timeStr) {
  // If already ISO (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(`${dateStr}T${timeStr || "00:00"}`);
  }

  // If DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
    const [day, month, year] = dateStr.split("/");
    return new Date(`${year}-${month}-${day}T${timeStr || "00:00"}`);
  }

  // If something else appears, let JS try
  return new Date(`${dateStr}T${timeStr || "00:00"}`);
}

export const handler = async () => {
  try {
    const sheetURL =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vTjeDyrQ8IFSU42awHxOOAWYVkf-0xdm08Qf45xz1d3HcmBoINj04y0xmwW59LH1LSKqbXP0yhMCXfV/pub?gid=1755129031&single=true&output=csv";

    const res = await fetch(sheetURL);
    const csv = await res.text();

    const rows = csv.split("\n").map((r) => r.split(","));
    const [header, ...entries] = rows;

    const now = new Date();

    const parsed = entries
      .map((row) => {
        const name = row[1]?.trim();
        const description = row[2]?.trim();
        const dateStr = row[3]?.trim();
        const timeStr = row[4]?.trim();

        if (!name || !dateStr) return null;

        const datetime = parseDate(dateStr, timeStr);
        if (isNaN(datetime)) return null;

        return { name, description, date: dateStr, time: timeStr, datetime };
      })
      .filter(Boolean);

    // Only future events
    const future = parsed.filter((ev) => ev.datetime >= now);

    // If repeating name, keep nearest
    const soonest = {};
    for (const ev of future) {
      if (!soonest[ev.name] || ev.datetime < soonest[ev.name].datetime) {
        soonest[ev.name] = ev;
      }
    }

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