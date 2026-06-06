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

  const prompt = `Date: ${dateStr}. Genere un briefing trading en JSON. IMPORTANT: utilise uniquement des guillemets doubles, pas d apostrophes dans les valeurs. Remplace les apostrophes par des espaces.

Reponds UNIQUEMENT avec ce JSON, rien d autre:
{
"actions":[
{"ticker":"AAPL","nom":"Apple","tendance":"haussier","analyse":"Analyse courte sans apostrophe."},
{"ticker":"NVDA","nom":"Nvidia","tendance":"baissier","analyse":"Analyse courte sans apostrophe."},
{"ticker":"TSLA","nom":"Tesla","tendance":"neutre","analyse":"Analyse courte sans apostrophe."}
],
"forex":[
{"paire":"EUR/USD","biais":"baissier","analyse":"Analyse courte sans apostrophe."},
{"paire":"GBP/USD","biais":"haussier","analyse":"Analyse courte sans apostrophe."},
{"paire":"USD/JPY","biais":"haussier","analyse":"Analyse courte sans apostrophe."}
],
"crypto":[
{"actif":"BTC/USDT","biais":"haussier","analyse":"Analyse courte sans apostrophe."},
{"actif":"ETH/USDT","biais":"baissier","analyse":"Analyse courte sans apostrophe."}
],
"agenda":[
{"heure":"08:30","drapeau":"US","evenement":"Evenement 1","prevision":"100","precedent":"95","importance":"3"},
{"heure":"10:00","drapeau":"EU","evenement":"Evenement 2","prevision":"50","precedent":"48","importance":"2"},
{"heure":"14:30","drapeau":"US","evenement":"Evenement 3","prevision":"200","precedent":"190","importance":"1"}
]
}

Remplace les valeurs generiques par de vraies donnees du ${dateStr}. PAS D APOSTROPHES dans les textes JSON.`;

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
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return { statusCode: response.status, headers, body: JSON.stringify({ error: data.error?.message || "Erreur API" }) };
    }

    let raw = '';
    (data.content || []).forEach(b => { if (b.type === 'text') raw += b.text; });

    // Nettoyage agressif
    raw = raw.trim();
    raw = raw.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'');
    const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
    if (s !== -1 && e !== -1) raw = raw.substring(s, e + 1);

    // Remplacer les apostrophes problematiques dans les valeurs JSON
    raw = raw.replace(/([^\\])'/g, "$1 ");

    // Valider
    JSON.parse(raw);

    return { statusCode: 200, headers, body: raw };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
