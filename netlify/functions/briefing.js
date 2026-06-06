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
  const prompt = `Tu es analyste financier. Nous sommes le ${dateStr}. Reponds UNIQUEMENT avec du JSON valide sans markdown.
{"actions":[{"ticker":"AAPL","nom":"Apple","tendance":"haussier","analyse":"Para1.\\nPara2.\\nPara3."}],"forex":[{"paire":"EUR/USD","biais":"baissier","analyse":"Para1.\\nPara2.\\nPara3."}],"crypto":[{"actif":"BTC/USDT","biais":"haussier","analyse":"Para1.\\nPara2.\\nPara3."}],"agenda":[{"heure":"08:30","drapeau":"🇺🇸","evenement":"NFP","prevision":"200K","precedent":"185K","importance":"3"}]}
Genere: 5 actions majeures, forex EUR/USD GBP/USD USD/JPY USD/CAD AUD/USD, crypto BTC ETH SOL, 8 evenements agenda reels aujourd hui. Tout en francais. JSON UNIQUEMENT.`;
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
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
