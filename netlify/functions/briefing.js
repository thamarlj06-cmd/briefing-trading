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

  // On demande a Claude des donnees separees par des pipes | faciles a parser
  // Pas de JSON = pas de probleme de JSON
  const prompt = `Date: ${dateStr}. Reponds avec des lignes de donnees. Format exact, une ligne par element.

ACTIONS_ETABLIES:
AAPL|Apple|haussier|Analyse courte ici
MSFT|Microsoft|haussier|Analyse courte ici
NVDA|Nvidia|haussier|Analyse courte ici
AMZN|Amazon|neutre|Analyse courte ici
GOOGL|Alphabet|baissier|Analyse courte ici
META|Meta|haussier|Analyse courte ici

ACTIONS_EMERGENTES:
XXX1|Nom entreprise emergente|haussier|Analyse courte ici
XXX2|Nom entreprise emergente|haussier|Analyse courte ici
XXX3|Nom entreprise emergente|haussier|Analyse courte ici
XXX4|Nom entreprise emergente|haussier|Analyse courte ici

FOREX:
EUR/USD|haussier|Analyse courte ici
GBP/USD|baissier|Analyse courte ici
USD/JPY|haussier|Analyse courte ici
USD/CAD|neutre|Analyse courte ici
AUD/USD|baissier|Analyse courte ici
USD/CHF|haussier|Analyse courte ici
NZD/USD|neutre|Analyse courte ici

CRYPTO:
BTC/USDT|haussier|Analyse courte ici
ETH/USDT|baissier|Analyse courte ici
SOL/USDT|haussier|Analyse courte ici

AGENDA:
08:30|Etats-Unis|Nom evenement|Prevision|Precedent|3
10:00|Zone Euro|Nom evenement|Prevision|Precedent|2
11:00|Royaume-Uni|Nom evenement|Prevision|Precedent|2
14:30|Etats-Unis|Nom evenement|Prevision|Precedent|3
16:00|Canada|Nom evenement|Prevision|Precedent|1

Remplace par de vraies donnees du ${dateStr}. Garde exactement le format avec les pipes |. Les analyses = 8 mots max, sans apostrophe, sans guillemets, sans caracteres speciaux.`;

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
        max_tokens: 700,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await resp.json();
    if (!resp.ok) {
      return { statusCode: resp.status, headers, body: JSON.stringify({ error: data.error?.message || "Erreur API" }) };
    }

    let raw = '';
    (data.content || []).forEach(b => { if (b.type === 'text') raw += b.text; });

    // Parser le format pipe
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    const result = {
      actions: [],
      forex: [],
      crypto: [],
      agenda: []
    };

    let section = '';
    for (const line of lines) {
      if (line.startsWith('ACTIONS_ETABLIES')) { section = 'etablie'; continue; }
      if (line.startsWith('ACTIONS_EMERGENTES')) { section = 'emergente'; continue; }
      if (line.startsWith('FOREX')) { section = 'forex'; continue; }
      if (line.startsWith('CRYPTO')) { section = 'crypto'; continue; }
      if (line.startsWith('AGENDA')) { section = 'agenda'; continue; }

      if (!line.includes('|')) continue;
      const parts = line.split('|').map(p => p.trim());

      if ((section === 'etablie' || section === 'emergente') && parts.length >= 4) {
        result.actions.push({
          ticker: parts[0],
          nom: parts[1],
          categorie: section,
          tendance: parts[2],
          analyse: parts[3]
        });
      } else if (section === 'forex' && parts.length >= 3) {
        result.forex.push({
          paire: parts[0],
          biais: parts[1],
          analyse: parts[2]
        });
      } else if (section === 'crypto' && parts.length >= 3) {
        result.crypto.push({
          actif: parts[0],
          biais: parts[1],
          analyse: parts[2]
        });
      } else if (section === 'agenda' && parts.length >= 6) {
        result.agenda.push({
          heure: parts[0],
          pays: parts[1],
          evenement: parts[2],
          prevision: parts[3],
          precedent: parts[4],
          importance: parts[5]
        });
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
