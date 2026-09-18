const settings = document.querySelector('#settingsDialog');
const getKey = () => localStorage.getItem('fundlens-gemini-key') || '';
const defaultPositions = [
  { ticker: 'VOO', shares: 24, price: 590.20 }, { ticker: 'QQQ', shares: 12, price: 586.10 },
  { ticker: 'VTI', shares: 20, price: 344.80 }, { ticker: 'VXUS', shares: 35, price: 68.40 },
  { ticker: 'BND', shares: 65, price: 73.30 }, { ticker: 'NVDA', shares: 15, price: 172.30 },
  { ticker: 'AAPL', shares: 22, price: 230.50 }, { ticker: 'MSFT', shares: 10, price: 510.40 }
];
const getPositions = () => JSON.parse(localStorage.getItem('fundlens-portfolio') || JSON.stringify(defaultPositions));
const formatMoney = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const portfolioContext = () => {
  const positions = getPositions();
  const total = positions.reduce((sum, p) => sum + p.shares * p.price, 0);
  const lines = positions.map(p => `${p.ticker}: ${p.shares} shares × $${p.price.toFixed(2)} = $${(p.shares * p.price).toFixed(2)}`).join('; ');
  return `User-entered portfolio value: $${total.toFixed(2)}. Positions: ${lines}. Do not claim look-through holdings, sectors, or fund overlap unless the user supplied that information.`;
};
function renderPortfolioSummary() {
  const positions = getPositions();
  const total = positions.reduce((sum, p) => sum + p.shares * p.price, 0);
  document.querySelector('#portfolioValue').textContent = formatMoney(total);
  document.querySelector('#positionCount').textContent = positions.length;
  document.querySelector('#portfolioNote').textContent = positions.length ? 'From your saved positions' : 'Add positions to begin';
  const colors = ['#7aaee9', '#e8a18f', '#b4b6b6', '#f2b34b', '#e88278'];
  document.querySelector('#holdingsList').innerHTML = positions
    .map(p => ({ ...p, value: p.shares * p.price })).sort((a, b) => b.value - a.value).slice(0, 5)
    .map((p, index) => {
      const weight = total ? p.value / total * 100 : 0;
      return `<div class="holding"><div class="company"><span class="ticker" style="background:${colors[index]}">${p.ticker}</span><span>${p.shares} shares</span></div><div class="bar"><i style="width:${Math.min(weight * 10, 100)}%"></i></div><b>${weight.toFixed(1)}%</b></div>`;
    }).join('') || '<p class="empty-state">Add positions to see your allocation.</p>';
}
function openPortfolioEditor() {
  document.querySelector('#portfolioInput').value = getPositions().map(p => `${p.ticker}, ${p.shares}, ${p.price}`).join('\n');
  document.querySelector('#portfolioDialog').showModal();
}
document.querySelector('#editPortfolioButton').addEventListener('click', openPortfolioEditor);
document.querySelector('#inlineEdit').addEventListener('click', openPortfolioEditor);
document.querySelector('#portfolioDialog').addEventListener('close', event => {
  if (event.target.returnValue !== 'save') return;
  const positions = document.querySelector('#portfolioInput').value.split('\n').map(line => {
    const [ticker, shares, price] = line.split(',').map(value => value.trim());
    return { ticker: (ticker || '').toUpperCase(), shares: Number(shares), price: Number(price) };
  }).filter(p => p.ticker && Number.isFinite(p.shares) && p.shares > 0 && Number.isFinite(p.price) && p.price > 0);
  localStorage.setItem('fundlens-portfolio', JSON.stringify(positions));
  renderPortfolioSummary();
});
renderPortfolioSummary();

document.querySelector('#settingsButton').addEventListener('click', () => {
  document.querySelector('#geminiApiKey').value = getKey();
  document.querySelector('#googleClientId').value = localStorage.getItem('fundlens-google-client-id') || '';
  settings.showModal();
});
settings.addEventListener('close', () => {
  if (settings.returnValue === 'save') {
    localStorage.setItem('fundlens-gemini-key', document.querySelector('#geminiApiKey').value.trim());
    localStorage.setItem('fundlens-google-client-id', document.querySelector('#googleClientId').value.trim());
  }
});

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  const view = button.dataset.view;
  document.querySelectorAll('.tabs button').forEach(tab => tab.classList.toggle('active', tab.dataset.view === view));
  document.querySelectorAll('.dashboard, .detail-view').forEach(section => section.classList.add('hidden'));
  document.querySelector(`#${view}View`).classList.remove('hidden');
}));

function demoAnswer(question) {
  const q = question.toLowerCase();
  if (q.includes('nvidia') || q.includes('nvda')) return 'NVIDIA represents an estimated 8.4% of your portfolio after looking through your funds and direct shares. It is your largest effective company position.';
  if (q.includes('overlap')) return 'The strongest overlap is VOO × QQQ at 42% by holdings. Both funds tilt toward the same mega-cap technology names, so holding both may give you less variety than the ticker list suggests.';
  if (q.includes('tech') || q.includes('technology')) return 'Technology is 31.6% of your portfolio, about 4.1 percentage points above the broad US market. Your direct shares plus the VOO/QQQ overlap are the largest contributors.';
  return 'Your diversification score is 72/100: a solid mix across US, international, and fixed income, with meaningful concentration in large-cap technology. The 42% VOO/QQQ overlap is the clearest place to inspect.';
}

async function askGemini(question) {
  const key = getKey();
  if (!key) return demoAnswer(question);
  const prompt = `You are FundLens, an educational portfolio-exposure analyst. Answer concisely in 2-4 sentences using only this portfolio data: ${portfolioContext()}\n\nUser question: ${question}\n\nDo not provide personalized buy/sell advice. Note uncertainty where data is incomplete.`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:.3,maxOutputTokens:260}})});
  if (!response.ok) throw new Error('Gemini request failed');
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'I could not generate an analysis for that question.';
}

const form = document.querySelector('#askForm');
form.addEventListener('submit', async event => {
  event.preventDefault();
  const input = document.querySelector('#question'); const question = input.value.trim(); if (!question) return;
  const button = form.querySelector('button'); button.textContent = '…'; button.disabled = true;
  try { document.querySelector('#answerText').textContent = await askGemini(question); }
  catch { document.querySelector('#answerText').textContent = 'FundLens could not reach Gemini. Check the API key in Settings, then try again.'; }
  document.querySelector('#answer').classList.remove('hidden'); button.textContent = '↑'; button.disabled = false;
});
document.querySelectorAll('.prompt-chips button').forEach(chip => chip.addEventListener('click', () => { document.querySelector('#question').value = chip.textContent; form.requestSubmit(); }));

document.querySelector('#googleSignIn').addEventListener('click', () => {
  const clientId = localStorage.getItem('fundlens-google-client-id');
  if (!clientId) { settings.showModal(); return; }
  if (!window.google?.accounts?.id) { alert('Google Sign-In is still loading. Please try again.'); return; }
  window.google.accounts.id.initialize({client_id: clientId, callback: credential => {
    const payload = JSON.parse(atob(credential.credential.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    document.querySelector('#accountLabel').textContent = payload.given_name || 'Signed in';
  }});
  window.google.accounts.id.prompt();
});
