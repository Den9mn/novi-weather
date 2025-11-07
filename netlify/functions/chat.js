// Netlify Function: chat.js — Uses raw REST (no OpenAI SDK)
// Requires env: OPENAI_API_KEY, ASSISTANT_ID, WEATHER_KEY

const OPENAI_API = "https://api.openai.com/v1";
const HEADERS = (key) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${key}`,
  "OpenAI-Beta": "assistants=v2",
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const userMessage = body.message || "What's the weather like in Madrid?";

    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    const ASSISTANT_ID = process.env.ASSISTANT_ID;
    const WEATHER_KEY = process.env.WEATHER_KEY;

    // Sanity log
    console.log("Env check:", {
      hasKey: !!OPENAI_KEY,
      hasAssistant: !!ASSISTANT_ID,
      hasWeather: !!WEATHER_KEY,
    });

    // 1) Create a thread
    const tRes = await fetch(`${OPENAI_API}/threads`, {
      method: "POST",
      headers: HEADERS(OPENAI_KEY),
      body: JSON.stringify({}),
    });
    if (!tRes.ok) throw new Error(`Thread create failed: ${tRes.status}`);
    const thread = await tRes.json();

    // 2) Add a user message
    const mRes = await fetch(`${OPENAI_API}/threads/${thread.id}/messages`, {
      method: "POST",
      headers: HEADERS(OPENAI_KEY),
      body: JSON.stringify({
        role: "user",
        content: userMessage,
      }),
    });
    if (!mRes.ok) throw new Error(`Message create failed: ${mRes.status}`);

    // 3) Start a run
    const rRes = await fetch(`${OPENAI_API}/threads/${thread.id}/runs`, {
      method: "POST",
      headers: HEADERS(OPENAI_KEY),
      body: JSON.stringify({
        assistant_id: ASSISTANT_ID,
      }),
    });
    if (!rRes.ok) throw new Error(`Run create failed: ${rRes.status}`);
    let run = await rRes.json();

    // 4) Poll until completed / requires_action
    while (true) {
      // Retrieve status
      const rs = await fetch(
        `${OPENAI_API}/threads/${thread.id}/runs/${run.id}`,
        { headers: HEADERS(OPENAI_KEY) }
      );
      if (!rs.ok) throw new Error(`Run retrieve failed: ${rs.status}`);
      run = await rs.json();

      if (run.status === "completed") break;

      if (run.status === "requires_action") {
        const toolCalls = run.required_action?.submit_tool_outputs?.tool_calls || [];
        for (const tc of toolCalls) {
          if (tc.type === "function" && tc.function?.name === "get_weather") {
            let location = "Madrid";
            try {
              const args = JSON.parse(tc.function.arguments || "{}");
              if (args.location) location = args.location;
            } catch {}

            // Call WeatherAPI
            const wRes = await fetch(
              `https://api.weatherapi.com/v1/current.json?key=${WEATHER_KEY}&q=${encodeURIComponent(location)}`
            );
            const wData = await wRes.json();

            const output = {
              location: wData?.location?.name,
              country: wData?.location?.country,
              temperature_c: wData?.current?.temp_c,
              condition: wData?.current?.condition?.text,
              humidity: wData?.current?.humidity,
              wind_kph: wData?.current?.wind_kph,
              feelslike_c: wData?.current?.feelslike_c,
              cloud: wData?.current?.cloud,
            };

            // Submit tool output
            const sto = await fetch(
              `${OPENAI_API}/threads/${thread.id}/runs/${run.id}/submit_tool_outputs`,
              {
                method: "POST",
                headers: HEADERS(OPENAI_KEY),
                body: JSON.stringify({
                  tool_outputs: [
                    {
                      tool_call_id: tc.id,
                      output: JSON.stringify(output),
                    },
                  ],
                }),
              }
            );
            if (!sto.ok) throw new Error(`Submit tool outputs failed: ${sto.status}`);
          }
        }
      }

      await sleep(1200);
    }

// 5) Fetch final assistant message
console.log("Fetching final messages for thread:", thread.id);
const listRes = await fetch(
  `${OPENAI_API}/threads/${thread.id}/messages?limit=10&order=desc`,
  { headers: HEADERS(OPENAI_KEY) }
);

if (!listRes.ok) throw new Error(`List messages failed: ${listRes.status}`);

const msgList = await listRes.json();
console.log("Messages JSON:", JSON.stringify(msgList, null, 2));

let reply = "No reply received from assistant.";
const first = msgList?.data?.[0];
if (first?.content?.[0]?.type === "text") {
  reply = first.content[0].text.value;
}
console.log("Final reply:", reply);

return {
  statusCode: 200,
  body: JSON.stringify({ reply }),
};
  }
};