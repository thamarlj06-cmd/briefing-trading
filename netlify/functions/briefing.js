exports.handler = async function(event, context) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Cle API manquante" }) };
  }
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const prompt = `Nous sommes le ${dateStr}. Reponds UNIQUEMENT avec du JSON valide, concis, sans markdown.
{"actions":[{"ticker":"AAPL","nom":"Apple","tendance":"haussier","analyse":"Phrase1. Phrase2."},{"ticker":"NVDA","nom":"Nvidia","tendance":"baissier","analyse":"Phrase1. Phrase2."},{"ticker":"TSLA","nom":"Tesla","tendance":"neutre","analyse":"Phrase1. Phrase2."}],"forex":[{"paire":"EUR/USD","biais":"baissier","analyse":"Phrase1. Phrase2."},{"paire":"GBP/USD","biais":"haussier","analyse":"Phrase1. Phrase2."},{"paire":"USD/JPY","biais":"haussier","analyse":"Phrase1. Phrase2."}],"crypto":[{"actif":"BTC/USDT","biais":"haussier","analyse":"Phrase1. Phrase2."},{"actif":"ETH/USDT","biais":"baissier","analyse":"Phrase1. Phrase2."}],"agenda":[{"heure":"08:30","drapeau":"🇺🇸","evenement":"CPI USA","prevision":"3.2%","precedent":"3.5%","importance":"3"},{"heure":"14:00","drapeau":"🇪🇺","evenement":"BCE taux","prevision":"3.5%","precedent":"3.5%","importance":"3"}]}
Genere un vrai briefing du ${dateStr}: 3 actions avec news reelles, 3 paires forex avec biais reel, 2 cryptos, 5 evenements agenda reels. Analyses courtes 2 phrases max. JSON STRICT.`;
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data = await response.json();
    if (!response.ok) {
      return { statusCode: response.status, headers, body: JSON.stringify({ error: data.error?.message || "Erreur API" }) };
    }
    let raw = '';
    (data.content || []).forEach(b => { if (b.type === 'text') raw += b.text; });
    raw = raw.trim().replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'');
    const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
    if (s !== -1 && e !== -1) raw = raw.substring(s, e + 1);
    JSON.parse(raw);
    return { statusCode: 200, headers, body: raw };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
