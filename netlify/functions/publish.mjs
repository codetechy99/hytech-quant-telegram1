const json = (statusCode, data) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data)
});

const escapeHTML = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "POST requests only." });
  }

  const secret = process.env.PUBLISH_SECRET;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!secret || !token || !chatId) {
    return json(500, { error: "Server configuration incomplete." });
  }

  const authorization = event.headers.authorization || "";

  if (authorization !== `Bearer ${secret}`) {
    return json(401, { error: "Unauthorized." });
  }

  let signal;

  try {
    signal = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON." });
  }

  const required = [
    "instrument",
    "side",
    "broker",
    "entry",
    "stopLoss",
    "takeProfits",
    "duration",
    "score",
    "reason"
  ];

  for (const field of required) {
    if (signal[field] === undefined || signal[field] === null ||
        signal[field] === "") {
      return json(400, { error: `Missing field: ${field}` });
    }
  }

  if (!["BUY", "SELL"].includes(String(signal.side).toUpperCase())) {
    return json(400, { error: "Side must be BUY or SELL." });
  }

  const score = Number(signal.score);

  if (!Number.isFinite(score) || score < 0 || score > 100) {
    return json(400, { error: "Score must be between 0 and 100." });
  }

  const message = [
    "🚀 <b>HYTECH QUANT — TRADE SIGNAL</b>",
    "",
    `📊 <b>Instrument:</b> ${escapeHTML(signal.instrument)}`,
    `📍 <b>Direction:</b> ${escapeHTML(signal.side.toUpperCase())}`,
    `🏦 <b>Broker:</b> ${escapeHTML(signal.broker)}`,
    `🎯 <b>Entry:</b> ${escapeHTML(signal.entry)}`,
    `🛑 <b>Stop Loss:</b> ${escapeHTML(signal.stopLoss)}`,
    `💰 <b>Take Profits:</b> ${escapeHTML(
      Array.isArray(signal.takeProfits)
        ? signal.takeProfits.join(" | ")
        : signal.takeProfits
    )}`,
    `⏱ <b>Expected duration:</b> ${escapeHTML(signal.duration)}`,
    `📈 <b>Confluence:</b> ${score}/100`,
    "",
    `🧠 <b>Analysis:</b> ${escapeHTML(signal.reason)}`,
    "",
    "⚠️ <i>Manual execution only. Verify prices and risk before entering.</i>",
    "HYTECH QUANT"
  ].join("\n");

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true
        })
      }
    );

    const result = await response.json();

    if (!response.ok || !result.ok) {
      return json(502, {
        error: "Telegram delivery failed.",
        details: result.description || "Telegram API error."
      });
    }

    return json(200, {
      success: true,
      message: "Signal published successfully.",
      messageId: result.result.message_id
    });

  } catch {
    return json(502, { error: "Could not reach Telegram." });
  }
};