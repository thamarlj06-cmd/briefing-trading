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

  // Construire le JSON directement sans laisser Claude le faire
  // On demande juste les donnees textuelles simples
  const prompt = `Date: ${dateStr}

Reponds avec EXACTEMENT ce JSON. Remplace uniquement les textes entre guillemets par de vraies donnees.
N utilise JAMAIS d apostrophe. Utilise uniquement des lettres, chiffres, espaces, points, virgules, pourcentages.

{"actions":[{"ticker":"AAA","nom":"Nom entreprise","tendance":"haussier","analyse":"Courte analyse en moins de 10 mots"},{"ticker":"BBB","nom":"Nom entreprise","tendance":"baissier","analyse":"Courte analyse en moins de 10 mots"},{"ticker":"CCC","nom":"Nom entreprise","tendance":"neutre","analyse":"Courte analyse en moins de 10 mots"}],"forex":[{"paire":"EUR/USD","biais":"haussier","analyse":"Courte analyse en moins de 10 mots"},{"paire":"GBP/USD","biais":"baissier","analyse":"Courte analyse en moins de 10 mots"},{"paire":"USD/JPY","biais":"haussier","analyse":"Courte analyse en moins de 10 mots"}],"crypto":[{"actif":"BTC/USDT","biais":"haussier","analyse":"Courte analyse en moins de 10 mots"},{"actif":"ETH/USDT","biais":"baissier","analyse":"Courte analyse en moins de 10 mots"}],"agenda":[{"heure":"08:30","pays":"USA","evenement":"Nom evenement","prevision":"0","precedent":"0","importance":"3"},{"heure":"10:00","pays":"EUR","evenement":"Nom evenement","prevision":"0","precedent":"0","importance":"2"},{"heure":"14:30","pays":"USA","evenement":"Nom evenement","prevision":"0","precedent":"0","importance":"1"}]}

IMPORTANT: JSON pur uniquement. Pas de texte avant ou apres. Pas d apostrophe. Pas d emoji.`;

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
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await resp.json();

    if (!resp.ok) {
      return {
        statusCode: resp.status,
        headers,
        body: JSON.stringify({ error: data.error?.message || "Erreur API" })
      };
    }

    let raw = '';
    (data.content || []).forEach(b => { if (b.type === 'text') raw += b.text; });

    // Nettoyage
    raw = raw.trim();
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

    // Extraire uniquement le JSON entre { et }
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) {
      throw new Error("Pas de JSON trouve dans la reponse");
    }
    raw = raw.substring(start, end + 1);

    // Supprimer tous les caracteres non-ASCII qui peuvent casser le JSON
    raw = raw.replace(/[^\x00-\x7F]/g, '');

    // Valider et retourner
    const parsed = JSON.parse(raw);
    return { statusCode: 200, headers, body: JSON.stringify(parsed) };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
