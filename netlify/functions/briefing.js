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

  // Prompt ultra-strict avec JSON pre-rempli a completer
  const prompt = `Tu es un assistant qui repond UNIQUEMENT en JSON valide.
Date: ${dateStr}

Reponds avec exactement ce format JSON, en remplacant les valeurs entre < > par de vraies donnees:

{"actions":[{"ticker":"<TICKER1>","nom":"<NOM1>","tendance":"<haussier|baissier|neutre>","analyse":"<max 15 mots sans apostrophe>"},{"ticker":"<TICKER2>","nom":"<NOM2>","tendance":"<haussier|baissier|neutre>","analyse":"<max 15 mots sans apostrophe>"},{"ticker":"<TICKER3>","nom":"<NOM3>","tendance":"<haussier|baissier|neutre>","analyse":"<max 15 mots sans apostrophe>"}],"forex":[{"paire":"EUR/USD","biais":"<haussier|baissier|neutre>","analyse":"<max 15 mots sans apostrophe>"},{"paire":"GBP/USD","biais":"<haussier|baissier|neutre>","analyse":"<max 15 mots sans apostrophe>"},{"paire":"USD/JPY","biais":"<haussier|baissier|neutre>","analyse":"<max 15 mots sans apostrophe>"}],"crypto":[{"actif":"BTC/USDT","biais":"<haussier|baissier|neutre>","analyse":"<max 15 mots sans apostrophe>"},{"actif":"ETH/USDT","biais":"<haussier|baissier|neutre>","analyse":"<max 15 mots sans apostrophe>"}],"agenda":[{"heure":"<HH:MM>","drapeau":"<emoji>","evenement":"<nom court>","prevision":"<valeur>","precedent":"<valeur>","importance":"<1|2|3>"},{"heure":"<HH:MM>","drapeau":"<emoji>","evenement":"<nom court>","prevision":"<valeur>","precedent":"<valeur>","importance":"<1|2|3>"},{"heure":"<HH:MM>","drapeau":"<emoji>","evenement":"<nom court>","prevision":"<valeur>","precedent":"<valeur>","importance":"<1|2|3>"}]}

REGLES ABSOLUES:
- JSON uniquement, rien avant, rien apres
- Pas d apostrophes dans les valeurs texte
- Analyses maximum 15 mots
- Utilise de vraies donnees du marche pour le ${dateStr}`;

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
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return { statusCode: response.status, headers, body: JSON.stringify({ error: data.error?.message || "Erreur API" }) };
    }

    let raw = '';
    (data.content || []).forEach(b => { if (b.type === 'text') raw += b.text; });

    // Nettoyage
    raw = raw.trim();
    raw = raw.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'');
    const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
    if (s !== -1 && e !== -1) raw = raw.substring(s, e + 1);

    // Nettoyer les apostrophes dans les valeurs de string JSON
    raw = raw.replace(/"([^"]*?)'/g, function(match, p1) {
      return '"' + p1.replace(/'/g, ' ');
    });

    // Valider
    const parsed = JSON.parse(raw);
    return { statusCode: 200, headers, body: JSON.stringify(parsed) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
