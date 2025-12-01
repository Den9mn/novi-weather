// netlify/functions/get_events.js
//
// Reads events from Google Sheets CSV,
// normalizes date/time formats,
// filters future events,
// and returns only the soonest one per event name.

function normalizeDate(dateStr, timeStr) {
  // Case 1: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(`${dateStr}T${normalizeTime(timeStr)}`);
  }

  // Case 2: MM/DD/YYYY (Google's US export)
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
    const [month, day, year] = dateStr.split("/");
    return new Date(`${year}-${month.padStart(2,"0")}-${day.padStart(2,"0")}T${normalizeTime(timeStr)}`);
  }

  return new Date(NaN); // invalid
}

function normalizeTime(timeStr) {
  if (!timeStr) return "00:00";

  // Case 1: 20:00 or 20:00:00 → keep 24h
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(timeStr)) {
    return timeStr;
  }

  // Case 2: 8:00 PM → convert to 24h
  const pmMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(PM|AM)$/i);
  if (pmMatch) {
    let [_, h, m, suffix] = pmMatch;
    h = parseInt(h);
    if (suffix.toUpperCase() === "PM" && h !== 12) h += 12;
    if (suffix.toUpperCase() === "AM" && h === 12) h = 0;
    return `${String(h).padStart(2,"0")}:${m}`;
  }

  return "00:00";
}

export const handler = async () => {
  try {
    const sheetURL =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vTksE-wWIJzwRpabv-AvuVoyjiws4r70P9bs9hLnwOoFncy1kvZj6TYkvpxxXB18sf-7cBoZ3RmMIW1/pub?output=csv";

    const res = await fetch(sheetURL);
    const csv = await res.text();

    const rows = csv.trim().split("\n").map((line) => line.split(","));
    const [header, ...entries] = rows;

    const now = new Date();

    const parsed = entries
      .map((row) => {
        const name = row[1]?.trim();
        const description = row[2]?.trim();
        const dateStr = row[3]?.trim();
        const timeStr = row[4]?.trim();

        if (!name || !dateStr) return null;

        const datetime = normalizeDate(dateStr, timeStr);
        if (isNaN(datetime)) return null;

        return {
          name,
          description,
          date: dateStr,
          time: timeStr,
          datetime,
        };
      })
      .filter(Boolean);

    // Only future events
    const future = parsed.filter((ev) => ev.datetime >= now);

    // For repeating events: keep next instance only
    const soonest = {};
    for (const ev of future) {
      if (!soonest[ev.name] || ev.datetime < soonest[ev.name].datetime) {
        soonest[ev.name] = ev;
      }
    }

    const events = Object.values(soonest)
      .sort((a, b) => a.datetime - b.datetime)
      .map(({ name, description, date, time }) => ({
        name,
        description,
        date,
        time,
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