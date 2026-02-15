import dotenv from "dotenv";
import express from "express";

dotenv.config();

const app = express();
app.use(express.json());

// CORS (allow Live Server)
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");

    if (req.method === "OPTIONS") return res.sendStatus(204);
next();
});

app.get("/health", (req, res) => {
    res.json({ ok: true });
});

app.post("/api/chat", async (req, res) => {
try {
    const { message } = req.body || {};
    if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Missing message" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: "Missing OPENAI_API_KEY on server" });
    }

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        },
            body: JSON.stringify({
            model: "gpt-4.1-mini",
            temperature: 0.3,
            messages: [
        {
            role: "system",
            content:
            "You are a todo assistant. If the user asks for a plan/tasks, reply ONLY with a JSON array. Each item must be: {text, category, minutes, priority}. No extra text.",
        },
        { role: "user", content: message },
        ],
    }),
    });

    if (!r.ok) {
        const err = await r.text();
        return res.status(500).json({ error: "OpenAI error", details: err });
    }

    const data = await r.json();
    const reply = data?.choices?.[0]?.message?.content ?? "";
    return res.json({ reply });
} catch (e) {
    return res.status(500).json({ error: "Server crash", details: String(e) });
}
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Backend running on http://localhost:${PORT}`));