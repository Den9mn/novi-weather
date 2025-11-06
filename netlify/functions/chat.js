// ✅ Novi Weather Function for Netlify — OpenAI SDK v6.8.1 Compatible
const OpenAI = require("openai");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const userMessage = body.message || "What's the weather like in Madrid?";

    console.log("Env check:", {
      hasKey: !!process.env.OPENAI_API_KEY,
      hasAssistant: !!process.env.ASSISTANT_ID,
      hasWeather: !!process.env.WEATHER_KEY,
    });

    // 1️⃣ Create a thread and add the user's message
    const thread = await client.beta.threads.create();
    await client.beta.threads.messages.create(thread.id, {
      role: "user",
      content: userMessage,
    });

    // 2️⃣ Start a run for this thread (object-based v6+ syntax)
    const run = await client.beta.threads.runs.create({
      thread_id: thread.id,
      assistant_id: process.env.ASSISTANT_ID,
    });

    if (!run?.id) {
      console.error("Run creation failed:", run);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error:
            "Failed to create assistant run. Check ASSISTANT_ID or OpenAI API key.",
        }),
      };
    }

    // 3️⃣ Poll until the run completes or requests tool output
    while (true) {
      const runStatus = await client.beta.threads.runs.retrieve({
        thread_id: thread.id,
        run_id: run.id,
      });

      if (runStatus.status === "completed") break;

      if (runStatus.status === "requires_action") {
        const toolCall =
          runStatus.required_action?.submit_tool_outputs?.tool_calls?.[0];

        if (toolCall?.function?.name === "get_weather") {
          const { location } = JSON.parse(toolCall.function.arguments || "{}");
          console.log("Fetching weather for:", location);

          // Built-in fetch (Node 18+)
          const res = await fetch(
            `https://api.weatherapi.com/v1/current.json?key=${process.env.WEATHER_KEY}&q=${encodeURIComponent(
              location
            )}`
          );
          const data = await res.json();

          const output = {
            location: data?.location?.name,
            country: data?.location?.country,
            temperature_c: data?.current?.temp_c,
            condition: data?.current?.condition?.text,
            humidity: data?.current?.humidity,
            wind_kph: data?.current?.wind_kph,
          };

          // 4️⃣ Submit tool outputs (object-based v6+ syntax)
          await client.beta.threads.runs.submitToolOutputs({
            thread_id: thread.id,
            run_id: run.id,
            tool_outputs: [
              { tool_call_id: toolCall.id, output: JSON.stringify(output) },
            ],
          });
        }
      }

      // Small delay before polling again
      await new Promise((r) => setTimeout(r, 1500));
    }

    // 5️⃣ Retrieve the assistant’s final message
    const messages = await client.beta.threads.messages.list(thread.id);
    const lastMessage =
      messages.data?.[0]?.content?.[0]?.text?.value || "No reply.";

    return {
      statusCode: 200,
      body: JSON.stringify({ reply: lastMessage }),
    };
  } catch (error) {
    console.error("Function error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};