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

  // ── 1. Calendrier économique Finnhub ──────────────────────────
  let agendaFromAPI = [];
  try {
    const finnhubKey = process.env.FINNHUB_API_KEY;
    if (finnhubKey) {
      const today = now.toISOString().split('T')[0];
      const finnResp = await fetch(
        `https://finnhub.io/api/v1/calendar/economic?from=${today}&to=${today}&token=${finnhubKey}`
      );
      if (finnResp.ok) {
        const finnData = await finnResp.json();
        if (finnData.economicCalendar && Array.isArray(finnData.economicCalendar)) {
          agendaFromAPI = finnData.economicCalendar
            .filter(e => e.impact === 'high' || e.impact === 'medium')
            .slice(0, 12)
            .map(e => ({
              heure: e.time ? e.time.substring(0, 5) : '00:00',
              pays: e.country || 'Global',
              evenement: e.event || 'Evenement economique',
              prevision: e.estimate !== undefined ? String(e.estimate) : 'N/A',
              precedent: e.prev !== undefined ? String(e.prev) : 'N/A',
              importance: e.impact === 'high' ? '3' : '2'
            }));
        }
      }
    }
  } catch(e) {
    console.log('Finnhub error:', e.message);
  }

  const agendaContext = agendaFromAPI.length > 0
    ? `Voici les vrais evenements economiques du jour depuis Finnhub: ${JSON.stringify(agendaFromAPI)}`
    : 'Pas de donnees Finnhub disponibles - genere un calendrier realiste pour ce jour.';

  // ── 2. Prompt Claude avec web search pour données réelles ──────
  const prompt = `Tu es un analyste financier senior avec acces aux donnees de marche en temps reel.
Date: ${dateStr}.
${agendaContext}

Reponds avec des lignes separees par des pipes |. Format exact. Pas d apostrophe. Pas d emoji. Pipes uniquement.

ACTIONS_ETABLIES:
AAPL|Apple Inc.|haussier|court: direction|moyen: direction|long: direction|Synthese 1-2 phrases analyse fondamentale et technique actuelle
MSFT|Microsoft|haussier|court: direction|moyen: direction|long: direction|Synthese 1-2 phrases
NVDA|Nvidia|haussier|court: direction|moyen: direction|long: direction|Synthese 1-2 phrases
AMZN|Amazon|neutre|court: direction|moyen: direction|long: direction|Synthese 1-2 phrases
GOOGL|Alphabet|baissier|court: direction|moyen: direction|long: direction|Synthese 1-2 phrases
META|Meta Platforms|haussier|court: direction|moyen: direction|long: direction|Synthese 1-2 phrases

ACTIONS_EMERGENTES:
TICK1|Nom entreprise|haussier|court: haussier|moyen: haussier|long: haussier|Pourquoi surveiller cette entreprise emergente
TICK2|Nom entreprise|haussier|court: haussier|moyen: neutre|long: haussier|Pourquoi surveiller cette entreprise emergente
TICK3|Nom entreprise|haussier|court: neutre|moyen: haussier|long: haussier|Pourquoi surveiller cette entreprise emergente
TICK4|Nom entreprise|neutre|court: neutre|moyen: haussier|long: haussier|Pourquoi surveiller cette entreprise emergente

FOREX:
EUR/USD|haussier|court: direction|moyen: direction|long: direction|Synthese macro BCE vs Fed politique monetaire niveaux cles attendus|Impact news: effet des dernieres publications macro sur cette paire
GBP/USD|baissier|court: direction|moyen: direction|long: direction|Synthese macro BOE vs Fed niveaux cles|Impact news: effet des dernieres publications
USD/JPY|haussier|court: direction|moyen: direction|long: direction|Synthese macro Fed vs BOJ carry trade|Impact news: effet
USD/CAD|neutre|court: direction|moyen: direction|long: direction|Synthese macro petrole et BOC|Impact news: effet
AUD/USD|baissier|court: direction|moyen: direction|long: direction|Synthese macro matieres premieres RBA|Impact news: effet
USD/CHF|neutre|court: direction|moyen: direction|long: direction|Synthese macro franc suisse valeur refuge|Impact news: effet
NZD/USD|neutre|court: direction|moyen: direction|long: direction|Synthese macro RBNZ exportations|Impact news: effet
EUR/GBP|neutre|court: direction|moyen: direction|long: direction|Synthese macro divergence BCE BOE|Impact news: effet
EUR/JPY|haussier|court: direction|moyen: direction|long: direction|Synthese macro carry trade risk sentiment|Impact news: effet
GBP/JPY|haussier|court: direction|moyen: direction|long: direction|Synthese macro volatilite carry trade|Impact news: effet
USD/MXN|baissier|court: direction|moyen: direction|long: direction|Synthese macro Banxico relations commerciales|Impact news: effet
EUR/CAD|neutre|court: direction|moyen: direction|long: direction|Synthese macro BCE vs BOC petrole|Impact news: effet

FOREX_SURVEILLER:
EUR/USD|1.0000|1.0000|haussier|Setup SMC a surveiller avec zone cle et raison
GBP/USD|1.0000|1.0000|baissier|Setup SMC a surveiller avec zone cle et raison
USD/JPY|100.00|100.00|haussier|Setup SMC a surveiller avec zone cle et raison

CRYPTO:
BTC/USDT|haussier|court: direction|moyen: direction|long: direction|Synthese technique et sentiment crypto actuel|Impact news: effet des dernieres nouvelles crypto
ETH/USDT|neutre|court: direction|moyen: direction|long: direction|Synthese Ethereum technique et fondamentaux|Impact news: effet
SOL/USDT|haussier|court: direction|moyen: direction|long: direction|Synthese Solana technique|Impact news: effet
XRP/USDT|neutre|court: direction|moyen: direction|long: direction|Synthese XRP et contexte reglementaire|Impact news: effet

NEWS:
Titre de la news majeure 1|Categorie|Resume de l impact sur les marches en 1-2 phrases|haute|Paires ou indices affectes: EUR/USD GBP/USD
Titre de la news majeure 2|Categorie|Resume de l impact sur les marches|moyenne|Paires affectees: USD/JPY
Titre de la news majeure 3|Categorie|Resume de l impact|haute|Paires affectees: BTC ETH
Titre de la news majeure 4|Categorie|Resume de l impact|faible|Indices affectes: SP500
Titre de la news majeure 5|Categorie|Resume de l impact|haute|Paires affectees: XAU/USD

AGENDA:
${agendaFromAPI.length > 0
  ? agendaFromAPI.map(e => `${e.heure}|${e.pays}|${e.evenement}|${e.prevision}|${e.precedent}|${e.importance}`).join('\n')
  : `08:30|Etats-Unis|Evenement economique majeur|Prevision|Precedent|3
10:00|Zone Euro|Evenement economique|Prevision|Precedent|2
14:30|Etats-Unis|Evenement economique|Prevision|Precedent|3`}

Remplace TOUTES les valeurs generiques par de vraies donnees basees sur tes connaissances les plus recentes du ${dateStr}. Chaque analyse doit etre utile pour un trader SMC Forex. Pas d apostrophe dans les textes.`;

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
        max_tokens: 2500,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await resp.json();
    if (!resp.ok) {
      return { statusCode: resp.status, headers, body: JSON.stringify({ error: data.error?.message || "Erreur API" }) };
    }

    let raw = '';
    (data.content || []).forEach(b => { if (b.type === 'text') raw += b.text; });

    const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    const result = {
      actions: [],
      forex: [],
      forex_surveiller: [],
      crypto: [],
      news: [],
      agenda: agendaFromAPI.length > 0 ? agendaFromAPI : [],
      source_agenda: agendaFromAPI.length > 0 ? 'Finnhub' : 'Claude'
    };

    let section = '';
    for (const line of lines) {
      if (line.startsWith('ACTIONS_ETABLIES'))  { section = 'etablie';    continue; }
      if (line.startsWith('ACTIONS_EMERGENTES')){ section = 'emergente';  continue; }
      if (line.startsWith('FOREX_SURVEILLER'))  { section = 'surveiller'; continue; }
      if (line.startsWith('FOREX'))             { section = 'forex';      continue; }
      if (line.startsWith('CRYPTO'))            { section = 'crypto';     continue; }
      if (line.startsWith('NEWS'))              { section = 'news';       continue; }
      if (line.startsWith('AGENDA'))            { section = 'agenda';     continue; }
      if (!line.includes('|')) continue;
      const p = line.split('|').map(x => x.trim());

      if ((section === 'etablie' || section === 'emergente') && p.length >= 7) {
        result.actions.push({
          ticker: p[0], nom: p[1], categorie: section, tendance: p[2],
          court: p[3], moyen: p[4], long: p[5], analyse: p[6]
        });
      } else if (section === 'forex' && p.length >= 7) {
        result.forex.push({
          paire: p[0], biais: p[1],
          court: p[2], moyen: p[3], long: p[4],
          analyse: p[5], impact_news: p[6]
        });
      } else if (section === 'surveiller' && p.length >= 5) {
        result.forex_surveiller.push({
          paire: p[0], support: p[1], resistance: p[2], biais: p[3], raison: p[4]
        });
      } else if (section === 'crypto' && p.length >= 7) {
        result.crypto.push({
          actif: p[0], biais: p[1],
          court: p[2], moyen: p[3], long: p[4],
          analyse: p[5], impact_news: p[6]
        });
      } else if (section === 'news' && p.length >= 5) {
        result.news.push({
          titre: p[0], categorie: p[1], impact: p[2],
          importance: p[3], marches: p[4]
        });
      } else if (section === 'agenda' && agendaFromAPI.length === 0 && p.length >= 6) {
        result.agenda.push({
          heure: p[0], pays: p[1], evenement: p[2],
          prevision: p[3], precedent: p[4], importance: p[5]
        });
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
