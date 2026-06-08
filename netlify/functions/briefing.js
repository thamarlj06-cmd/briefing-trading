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

  // ── 1. Calendrier Finnhub (rapide) ────────────────────────────
  let agendaData = [];
  try {
    const finnhubKey = process.env.FINNHUB_API_KEY;
    if (finnhubKey) {
      const today = now.toISOString().split('T')[0];
      const r = await fetch(
        `https://finnhub.io/api/v1/calendar/economic?from=${today}&to=${today}&token=${finnhubKey}`
      );
      if (r.ok) {
        const d = await r.json();
        if (d.economicCalendar) {
          agendaData = d.economicCalendar
            .filter(e => e.impact === 'high' || e.impact === 'medium')
            .slice(0, 10)
            .map(e => ({
              heure: (e.time || '00:00').substring(0, 5),
              pays: e.country || 'Global',
              evenement: e.event || 'Evenement',
              prevision: e.estimate !== undefined ? String(e.estimate) : 'N/A',
              precedent: e.prev !== undefined ? String(e.prev) : 'N/A',
              importance: e.impact === 'high' ? '3' : '2'
            }));
        }
      }
    }
  } catch(e) {}

  // ── 2. Prompt ultra-court — Haiku, 800 tokens max ─────────────
  // Pas de web search — trop lent
  // Format pipe simple et court
  const prompt = `Date: ${dateStr}. Reponds UNIQUEMENT avec des lignes pipe. Pas d apostrophe. 8 mots max par analyse.

FOREX:
EUR/USD|haussier|haussier|neutre|haussier|Dollar faible BCE hawkish|News: CPI impact dollar
GBP/USD|baissier|baissier|neutre|baissier|BOE dovish UK ralentit|News: PIB UK sous attentes
USD/JPY|haussier|haussier|haussier|neutre|Fed hawkish BOJ ultra dovish|News: inflation US solide
USD/CAD|neutre|neutre|neutre|neutre|Petrole stable BOC neutre|News: emploi Canada mitige
AUD/USD|baissier|baissier|neutre|neutre|Chine ralentit RBA dovish|News: PIB Chine decoit
USD/CHF|neutre|neutre|haussier|neutre|Franc refuge dollar fort|News: risque off CHF hausse
NZD/USD|baissier|baissier|baissier|neutre|RBNZ dovish croissance faible|News: inflation NZ basse
EUR/GBP|haussier|haussier|neutre|neutre|BCE plus hawkish que BOE|News: divergence maintenue
EUR/JPY|haussier|haussier|haussier|haussier|Carry trade actif risk on|News: sentiment positif
GBP/JPY|haussier|haussier|haussier|neutre|Carry trade BOJ inactif|News: volatilite elevee
USD/MXN|baissier|neutre|baissier|neutre|Banxico taux eleves peso fort|News: relations US Mexique
EUR/CAD|neutre|neutre|neutre|neutre|BCE vs BOC similaires|News: petrole indecis

FOREX_SURVEILLER:
EUR/USD|1.0820|1.0920|haussier|OB haussier 4H zone cle
GBP/USD|1.2600|1.2750|baissier|FVG baissier resistance majeure
USD/JPY|148.00|150.50|haussier|OTE zone support intervention BOJ

ACTIONS_ETABLIES:
AAPL|Apple|haussier|haussier|haussier|haussier|Resultats solides AI integration
MSFT|Microsoft|haussier|haussier|haussier|haussier|Azure croissance Cloud domination
NVDA|Nvidia|haussier|haussier|haussier|haussier|Demande GPU AI insatiable
AMZN|Amazon|haussier|neutre|haussier|haussier|AWS solide retail resilient
GOOGL|Alphabet|neutre|neutre|haussier|haussier|AI compet mais search stable
META|Meta|haussier|haussier|haussier|haussier|Reels monetisation forte

ACTIONS_EMERGENTES:
SMCI|Super Micro Computer|haussier|haussier|haussier|haussier|Serveurs AI forte demande
PLTR|Palantir|haussier|haussier|haussier|haussier|Contrats gouvernement AI
ARM|ARM Holdings|haussier|haussier|haussier|haussier|Chips AI mobile domination
RDDT|Reddit|neutre|neutre|haussier|haussier|Monetisation donnees AI

CRYPTO:
BTC/USDT|haussier|haussier|haussier|haussier|ETF institutionnel halving|News: adoption institutionnelle
ETH/USDT|neutre|neutre|haussier|haussier|Staking rendement stable|News: upgrade reseau
SOL/USDT|haussier|haussier|haussier|haussier|DeFi actif TVL croissant|News: ecosysteme fort
XRP/USDT|neutre|neutre|neutre|haussier|Reglementaire incertain SEC|News: proces en cours

NEWS:
Fed maintient taux directeurs|Politique monetaire|Dollar renforce pause Fed attendue impact baissier EUR|haute|EUR/USD USD/JPY
BCE signaux hawkish persistants|Politique monetaire|Euro soutenu divergence Fed BCE favorable EUR|haute|EUR/USD EUR/GBP EUR/JPY
Chine stimulus economique|Macro global|AUD soutenu matieres premieres hausse risk on crypto|moyenne|AUD/USD BTC ETH
Emploi US resilient|Macro USA|Dollar fort toutes paires USD impact baissier majeurs|haute|EUR/USD GBP/USD AUD/USD
Tensions geopolitiques persistantes|Geopolitique|CHF JPY demande refuge or hausse crypto mixte|moyenne|USD/CHF USD/JPY XAU/USD

Remplace les valeurs par des donnees reelles du ${dateStr}. Garde format pipe exact.`;

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
      return {
        statusCode: resp.status, headers,
        body: JSON.stringify({ error: data.error?.message || "Erreur API" })
      };
    }

    let raw = '';
    (data.content || []).forEach(b => { if (b.type === 'text') raw += b.text; });

    const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    const result = {
      actions: [], forex: [], forex_surveiller: [],
      crypto: [], news: [],
      agenda: agendaData,
      source_agenda: agendaData.length > 0 ? 'Finnhub' : 'Estimé'
    };

    let section = '';
    for (const line of lines) {
      if (line.startsWith('ACTIONS_ETABLIES'))  { section = 'etablie';    continue; }
      if (line.startsWith('ACTIONS_EMERGENTES')){ section = 'emergente';  continue; }
      if (line.startsWith('FOREX_SURVEILLER'))  { section = 'surveiller'; continue; }
      if (line.startsWith('FOREX'))             { section = 'forex';      continue; }
      if (line.startsWith('CRYPTO'))            { section = 'crypto';     continue; }
      if (line.startsWith('NEWS'))              { section = 'news';       continue; }
      if (!line.includes('|')) continue;
      const p = line.split('|').map(x => x.trim());

      if ((section==='etablie'||section==='emergente') && p.length>=7) {
        result.actions.push({
          ticker:p[0], nom:p[1], categorie:section, tendance:p[2],
          court:p[3], moyen:p[4], long:p[5], analyse:p[6]
        });
      } else if (section==='forex' && p.length>=7) {
        result.forex.push({
          paire:p[0], biais:p[1], court:p[2], moyen:p[3], long:p[4],
          analyse:p[5], impact_news:p[6]
        });
      } else if (section==='surveiller' && p.length>=5) {
        result.forex_surveiller.push({
          paire:p[0], support:p[1], resistance:p[2], biais:p[3], raison:p[4]
        });
      } else if (section==='crypto' && p.length>=7) {
        result.crypto.push({
          actif:p[0], biais:p[1], court:p[2], moyen:p[3], long:p[4],
          analyse:p[5], impact_news:p[6]
        });
      } else if (section==='news' && p.length>=5) {
        result.news.push({
          titre:p[0], categorie:p[1], impact:p[2], importance:p[3], marches:p[4]
        });
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
