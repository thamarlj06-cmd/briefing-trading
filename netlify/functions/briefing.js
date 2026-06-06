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
  const dateStr = now.toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const prompt = `Date: ${dateStr}

Reponds avec EXACTEMENT ce JSON. Remplace les valeurs par de vraies donnees du marche.
REGLES: Pas d apostrophe. Pas d emoji. Lettres, chiffres, espaces, points uniquement dans les textes.

{"actions":[
{"ticker":"AAPL","nom":"Apple","categorie":"etablie","tendance":"haussier","analyse":"Courte analyse 10 mots max"},
{"ticker":"MSFT","nom":"Microsoft","categorie":"etablie","tendance":"haussier","analyse":"Courte analyse 10 mots max"},
{"ticker":"NVDA","nom":"Nvidia","categorie":"etablie","tendance":"haussier","analyse":"Courte analyse 10 mots max"},
{"ticker":"AMZN","nom":"Amazon","categorie":"etablie","tendance":"neutre","analyse":"Courte analyse 10 mots max"},
{"ticker":"GOOGL","nom":"Alphabet","categorie":"etablie","tendance":"baissier","analyse":"Courte analyse 10 mots max"},
{"ticker":"META","nom":"Meta","categorie":"etablie","tendance":"haussier","analyse":"Courte analyse 10 mots max"},
{"ticker":"XXX1","nom":"Entreprise emergente 1","categorie":"emergente","tendance":"haussier","analyse":"Courte analyse 10 mots max"},
{"ticker":"XXX2","nom":"Entreprise emergente 2","categorie":"emergente","tendance":"haussier","analyse":"Courte analyse 10 mots max"},
{"ticker":"XXX3","nom":"Entreprise emergente 3","categorie":"emergente","tendance":"haussier","analyse":"Courte analyse 10 mots max"},
{"ticker":"XXX4","nom":"Entreprise emergente 4","categorie":"emergente","tendance":"haussier","analyse":"Courte analyse 10 mots max"}
],
"forex":[
{"paire":"EUR/USD","biais":"haussier","analyse":"Courte analyse 10 mots max"},
{"paire":"GBP/USD","biais":"baissier","analyse":"Courte analyse 10 mots max"},
{"paire":"USD/JPY","biais":"haussier","analyse":"Courte analyse 10 mots max"},
{"paire":"USD/CAD","biais":"neutre","analyse":"Courte analyse 10 mots max"},
{"paire":"AUD/USD","biais":"baissier","analyse":"Courte analyse 10 mots max"},
{"paire":"USD/CHF","biais":"haussier","analyse":"Courte analyse 10 mots max"},
{"paire":"NZD/USD","biais":"neutre","analyse":"Courte analyse 10 mots max"}
],
"crypto":[
{"actif":"BTC/USDT","biais":"haussier","analyse":"Courte analyse 10 mots max"},
{"actif":"ETH/USDT","biais":"baissier","analyse":"Courte analyse 10 mots max"},
{"actif":"SOL/USDT","biais":"haussier","analyse":"Courte analyse 10 mots max"}
],
"agenda":[
{"heure":"08:30","pays":"Etats-Unis","evenement":"Nom evenement","prevision":"0","precedent":"0","importance":"3"},
{"heure":"10:00","pays":"Zone Euro","evenement":"Nom evenement","prevision":"0","precedent":"0","importance":"2"},
{"heure":"11:00","pays":"Royaume-Uni","evenement":"Nom evenement","prevision":"0","precedent":"0","importance":"2"},
{"heure":"14:30","pays":"Etats-Unis","evenement":"Nom evenement","prevision":"0","precedent":"0","importance":"3"},
{"heure":"16:00","pays":"Canada","evenement":"Nom evenement","prevision":"0","precedent":"0","importance":"1"}
]}

Remplace par de vraies donnees du ${dateStr}. Garde exactement la meme structure JSON. Pas d apostrophe. Pas d emoji. JSON pur uniquement.`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 900,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await resp.json();
    if (!resp.ok) {
      return { statusCode: resp.status, headers, body: JSON.stringify({ error: data.error?.message || "Erreur API" }) };
    }

    let raw = '';
    (data.content || []).forEach(b => { if (b.type === 'text') raw += b.text; });

    raw = raw.trim();
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error("Pas de JSON trouve");
    raw = raw.substring(start, end + 1);

    // Supprimer tous les caracteres non-ASCII
    raw = raw.replace(/[^\x00-\x7F]/g, '');

    const parsed = JSON.parse(raw);
    return { statusCode: 200, headers, body: JSON.stringify(parsed) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
