/* =========================================================
   App — collega storage, riconoscimento vocale e interfaccia
   ========================================================= */

const els = {
  list: document.getElementById('product-list'),
  emptyState: document.getElementById('empty-state'),
  filterRow: document.querySelector('.filter-row'),

  btnAdd: document.getElementById('btn-add'),
  viewVoice: document.getElementById('view-voice'),
  btnCloseVoice: document.getElementById('btn-close-voice'),
  btnMic: document.getElementById('btn-mic'),
  micStatus: document.getElementById('mic-status'),
  liveTranscript: document.getElementById('live-transcript'),
  voiceReview: document.getElementById('voice-review'),
  reviewList: document.getElementById('review-list'),
  btnSaveAll: document.getElementById('btn-save-all'),

  viewDetail: document.getElementById('view-detail'),
  btnCloseDetail: document.getElementById('btn-close-detail'),
  detailForm: document.getElementById('detail-form'),
  fNome: document.getElementById('f-nome'),
  fScadenza: document.getElementById('f-scadenza'),
  fAcquisto: document.getElementById('f-acquisto'),
  fMotivo: document.getElementById('f-motivo'),
  fNote: document.getElementById('f-note'),
  btnConsumato: document.getElementById('btn-consumato'),
  btnElimina: document.getElementById('btn-elimina'),

  toast: document.getElementById('toast')
};

let filtroAttivo = 'tutti';
let idProdottoInModifica = null;
let bozzaRiconosciuti = [];

/* ---------------- Utility date/stato ---------------- */

function giorniAllaScadenza(scadenzaISO) {
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const scad = new Date(scadenzaISO + 'T00:00:00');
  return Math.round((scad - oggi) / (1000 * 60 * 60 * 24));
}

function statoDaGiorni(giorni) {
  if (giorni < 0) return 'urgent';
  if (giorni <= 2) return 'urgent';
  if (giorni <= 7) return 'warn';
  return 'fresh';
}

function formattaData(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

/* ---------------- Rendering lista ---------------- */

function creaAnello(giorni, stato) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const frazione = Math.max(0, Math.min(1, giorni / 14));
  const offset = circ * (1 - frazione);
  const etichetta = giorni < 0 ? 'Scad.' : giorni === 0 ? 'Oggi' : `${giorni}g`;

  return `
    <div class="ring-wrap status-${stato}">
      <svg width="46" height="46" viewBox="0 0 46 46">
        <circle class="ring-track" cx="23" cy="23" r="${r}"></circle>
        <circle class="ring-progress" cx="23" cy="23" r="${r}"
          stroke-dasharray="${circ}" stroke-dashoffset="${offset}"></circle>
      </svg>
      <div class="ring-days">${etichetta}</div>
    </div>`;
}

function renderLista() {
  const tutti = Storage.getAttivi();

  const filtrati = tutti.filter(p => {
    const giorni = giorniAllaScadenza(p.scadenza);
    if (filtroAttivo === 'urgente') return giorni <= 7 && giorni >= 0;
    if (filtroAttivo === 'scaduto') return giorni < 0;
    return true;
  });

  els.emptyState.classList.toggle('hidden', tutti.length > 0);
  els.list.innerHTML = '';

  filtrati.forEach(p => {
    const giorni = giorniAllaScadenza(p.scadenza);
    const stato = statoDaGiorni(giorni);
    const li = document.createElement('li');
    li.className = 'product-card';
    li.dataset.id = p.id;
    li.innerHTML = `
      ${creaAnello(giorni, stato)}
      <div class="product-info">
        <p class="product-name">${escapeHtml(p.nome)}</p>
        <p class="product-meta">
          <span>Scade ${formattaData(p.scadenza)}</span>
          ${p.motivo ? `<span class="tag-motivo">${escapeHtml(p.motivo)}</span>` : ''}
        </p>
      </div>`;
    li.addEventListener('click', () => apriDettaglio(p.id));
    els.list.appendChild(li);
  });
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s || '';
  return div.innerHTML;
}

/* ---------------- Filtri ---------------- */

els.filterRow.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('is-active'));
  chip.classList.add('is-active');
  filtroAttivo = chip.dataset.filter;
  renderLista();
});

/* ---------------- Overlay voce ---------------- */

els.btnAdd.addEventListener('click', apriVoce);
els.btnCloseVoice.addEventListener('click', chiudiVoce);

function apriVoce() {
  bozzaRiconosciuti = [];
  els.voiceReview.classList.add('hidden');
  els.reviewList.innerHTML = '';
  els.liveTranscript.textContent = '';
  els.micStatus.textContent = 'Tocca per iniziare a parlare';
  els.btnMic.classList.remove('is-listening');
  els.viewVoice.classList.remove('hidden');

  if (!SpeechEngine.isSupported()) {
    els.micStatus.textContent = 'Riconoscimento vocale non supportato su questo browser. Usa Chrome su Android o desktop.';
    els.btnMic.disabled = true;
  } else {
    els.btnMic.disabled = false;
  }
}

function chiudiVoce() {
  SpeechEngine.stop();
  els.viewVoice.classList.add('hidden');
}

let ascoltoAttivo = false;

els.btnMic.addEventListener('click', () => {
  if (ascoltoAttivo) {
    SpeechEngine.stop();
    return;
  }
  ascoltoAttivo = true;
  els.btnMic.classList.add('is-listening');
  els.micStatus.textContent = 'Ti ascolto... tocca di nuovo per fermare';

  SpeechEngine.start({
    onInterim: (testo) => { els.liveTranscript.textContent = testo; },
    onError: (err) => {
      ascoltoAttivo = false;
      els.btnMic.classList.remove('is-listening');
      if (err === 'no-speech') {
        els.micStatus.textContent = 'Non ho sentito nulla, riprova';
      } else if (err === 'not-allowed') {
        els.micStatus.textContent = 'Permesso microfono negato';
      } else {
        els.micStatus.textContent = 'Errore riconoscimento: ' + err;
      }
    },
    onEnd: (testoFinale) => {
      ascoltoAttivo = false;
      els.btnMic.classList.remove('is-listening');
      els.micStatus.textContent = 'Tocca per iniziare a parlare';
      if (testoFinale) elaboraTrascrizione(testoFinale);
    }
  });
});

function elaboraTrascrizione(testo) {
  const riconosciuti = SpeechParser.parseTranscript(testo);
  if (riconosciuti.length === 0) {
    mostraToast('Non ho riconosciuto prodotti con una data. Riprova.');
    return;
  }
  bozzaRiconosciuti = riconosciuti;
  renderReview();
  els.voiceReview.classList.remove('hidden');
}

function renderReview() {
  els.reviewList.innerHTML = '';
  bozzaRiconosciuti.forEach((p, idx) => {
    const li = document.createElement('li');
    li.className = 'review-item';
    li.innerHTML = `
      <div class="row">
        <input type="text" data-field="nome" value="${escapeHtml(p.nome)}" placeholder="Nome prodotto">
      </div>
      <div class="row">
        <input type="date" data-field="scadenza" value="${p.scadenza}">
        <input type="text" data-field="motivo" value="${escapeHtml(p.motivo || '')}" placeholder="Motivo (opzionale)">
      </div>
      <button type="button" class="remove-btn" data-idx="${idx}">Rimuovi</button>
    `;
    li.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('input', () => {
        bozzaRiconosciuti[idx][inp.dataset.field] = inp.value;
      });
    });
    li.querySelector('.remove-btn').addEventListener('click', () => {
      bozzaRiconosciuti.splice(idx, 1);
      renderReview();
    });
    els.reviewList.appendChild(li);
  });
}

els.btnSaveAll.addEventListener('click', () => {
  const validi = bozzaRiconosciuti.filter(p => p.nome && p.scadenza);
  if (validi.length === 0) {
    mostraToast('Nessun prodotto da salvare');
    return;
  }
  Storage.aggiungiMassivo(validi);
  mostraToast(`Salvati ${validi.length} prodotti`);
  chiudiVoce();
  renderLista();
});

/* ---------------- Overlay dettaglio ---------------- */

els.btnCloseDetail.addEventListener('click', chiudiDettaglio);

function apriDettaglio(id) {
  const p = Storage.getById(id);
  if (!p) return;
  idProdottoInModifica = id;
  els.fNome.value = p.nome;
  els.fScadenza.value = p.scadenza;
  els.fAcquisto.value = p.acquisto || '';
  els.fMotivo.value = p.motivo || '';
  els.fNote.value = p.note || '';
  els.viewDetail.classList.remove('hidden');
}

function chiudiDettaglio() {
  els.viewDetail.classList.add('hidden');
  idProdottoInModifica = null;
}

els.detailForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!idProdottoInModifica) return;
  Storage.aggiorna(idProdottoInModifica, {
    nome: els.fNome.value.trim(),
    scadenza: els.fScadenza.value,
    acquisto: els.fAcquisto.value,
    motivo: els.fMotivo.value.trim(),
    note: els.fNote.value.trim()
  });
  mostraToast('Modifiche salvate');
  chiudiDettaglio();
  renderLista();
});

els.btnConsumato.addEventListener('click', () => {
  if (!idProdottoInModifica) return;
  Storage.segnaStato(idProdottoInModifica, 'consumato');
  mostraToast('Segnato come consumato');
  chiudiDettaglio();
  renderLista();
});

els.btnElimina.addEventListener('click', () => {
  if (!idProdottoInModifica) return;
  if (!confirm('Eliminare definitivamente questo prodotto?')) return;
  Storage.elimina(idProdottoInModifica);
  mostraToast('Prodotto eliminato');
  chiudiDettaglio();
  renderLista();
});

/* ---------------- Toast ---------------- */

let toastTimer = null;
function mostraToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 2600);
}

/* ---------------- Avvio ---------------- */

document.getElementById('app-version').textContent = APP_VERSION;
renderLista();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
