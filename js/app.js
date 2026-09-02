/* =========================================================
   App — collega storage, riconoscimento vocale e interfaccia
   ========================================================= */

const els = {
  list: document.getElementById('product-list'),
  emptyState: document.getElementById('empty-state'),
  filterRow: document.querySelector('.filter-row'),

  btnFabAdd: document.getElementById('btn-fab-add'),
  viewVoice: document.getElementById('view-voice'),
  btnCloseVoice: document.getElementById('btn-close-voice'),
  addModeRow: document.querySelector('.add-mode-row'),
  addExample: document.getElementById('add-example'),
  pannelloVocale: document.getElementById('pannello-vocale'),
  pannelloTesto: document.getElementById('pannello-testo'),
  pannelloLinea: document.getElementById('pannello-linea'),
  btnMic: document.getElementById('btn-mic'),
  micStatus: document.getElementById('mic-status'),
  liveTranscript: document.getElementById('live-transcript'),
  textInput: document.getElementById('text-input'),
  btnAnalizzaTesto: document.getElementById('btn-analizza-testo'),
  voiceReview: document.getElementById('voice-review'),
  reviewList: document.getElementById('review-list'),
  btnClearReview: document.getElementById('btn-clear-review'),
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
  btnRipristina: document.getElementById('btn-ripristina'),
  btnDuplica: document.getElementById('btn-duplica'),

  aperturaInfo: document.getElementById('apertura-info'),
  aperturaData: document.getElementById('apertura-data'),
  aperturaScadenzaEffettiva: document.getElementById('apertura-scadenza-effettiva'),
  aperturaEta: document.getElementById('apertura-eta'),
  btnPiu7Apertura: document.getElementById('btn-piu7-apertura'),
  btnAnnullaApertura: document.getElementById('btn-annulla-apertura'),
  aperturaForm: document.getElementById('apertura-form'),
  fDurataApertura: document.getElementById('f-durata-apertura'),
  btnAnnullaFormApertura: document.getElementById('btn-annulla-form-apertura'),
  btnConfermaApertura: document.getElementById('btn-conferma-apertura'),
  btnSegnaAperto: document.getElementById('btn-segna-aperto'),

  stimaInfo: document.getElementById('stima-info'),
  btnPiu7Stima: document.getElementById('btn-piu7-stima'),

  btnHelp: document.getElementById('btn-help'),
  viewHelp: document.getElementById('view-help'),
  btnCloseHelp: document.getElementById('btn-close-help'),
  helpVersion: document.getElementById('help-version'),
  fLineaConsumo: document.getElementById('f-linea-consumo'),
  btnImpostaLinea: document.getElementById('btn-imposta-linea'),
  btnRimuoviLinea: document.getElementById('btn-rimuovi-linea'),

  btnAccount: document.getElementById('btn-account'),
  viewAccount: document.getElementById('view-account'),
  btnCloseAccount: document.getElementById('btn-close-account'),
  accountLoggedOut: document.getElementById('account-logged-out'),
  accountLoggedIn: document.getElementById('account-logged-in'),
  accountEmail: document.getElementById('account-email'),
  btnGoogleLogin: document.getElementById('btn-google-login'),
  btnLogout: document.getElementById('btn-logout'),

  casaFuori: document.getElementById('casa-fuori'),
  casaDentro: document.getElementById('casa-dentro'),
  casaCaricamento: document.getElementById('casa-caricamento'),
  casaNomeInput: document.getElementById('casa-nome'),
  casaCodiceInput: document.getElementById('casa-codice-input'),
  btnCreaCasa: document.getElementById('btn-crea-casa'),
  btnEntraCasa: document.getElementById('btn-entra-casa'),
  casaNomeCorrente: document.getElementById('casa-nome-corrente'),
  casaConteggio: document.getElementById('casa-conteggio'),
  casaCodiceCorrente: document.getElementById('casa-codice-corrente'),
  btnCopiaCodice: document.getElementById('btn-copia-codice'),
  btnRigeneraCodice: document.getElementById('btn-rigenera-codice'),
  casaMembri: document.getElementById('casa-membri'),
  btnAbbandonaCasa: document.getElementById('btn-abbandona-casa'),

  lineaHint: document.getElementById('linea-hint'),

  viewMigrazione: document.getElementById('view-migrazione'),
  migrazioneTitolo: document.getElementById('migrazione-titolo'),
  migrazioneTesto: document.getElementById('migrazione-testo'),
  migrazioneLista: document.getElementById('migrazione-lista'),
  btnMigraSi: document.getElementById('btn-migra-si'),
  btnMigraNo: document.getElementById('btn-migra-no'),
  btnMigraElimina: document.getElementById('btn-migra-elimina'),

  toast: document.getElementById('toast')
};

let filtroAttivo = 'tutti';
let idProdottoInModifica = null;
let bozzaRiconosciuti = [];

// Raggruppamento visivo in lista (solo qui, mai nel modello dati: ogni
// prodotto resta un record indipendente in Storage). Chiavi dei gruppi
// espansi dall'utente: transiente, non persistito, azzerato a ogni ricarica.
let gruppiEspansi = new Set();

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

// Scadenza usata per colore/ordinamento/home: per un prodotto "aperto" non è
// più quella stampata sulla confezione (f.scadenza, che resta comunque
// salvata), ma data-apertura + durata-dopo-apertura inserita dall'utente.
function scadenzaAttiva(p) {
  if (p.aperto && p.dataApertura && p.durataApertoGiorni) {
    const d = new Date(p.dataApertura + 'T00:00:00');
    d.setDate(d.getDate() + Number(p.durataApertoGiorni));
    return dataLocaleISO(d);
  }
  return p.scadenza;
}

// Informazione secondaria e discreta nel dettaglio (non in home): da quanti
// giorni un prodotto "aperto" è aperto. giorniAllaScadenza(dataApertura) dà
// il numero negativo di giorni già trascorsi da quella data, basta invertirlo.
function testoEta(dataAperturaISO) {
  const giorni = -giorniAllaScadenza(dataAperturaISO);
  if (giorni <= 0) return 'Aperto oggi';
  if (giorni === 1) return 'Aperto da 1 giorno';
  return `Aperto da ${giorni} giorni`;
}

function formattaData(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

/* ---------------- Rendering lista ---------------- */

function creaAnello(giorni, stato, scalaGiorni = 14) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const frazione = Math.max(0, Math.min(1, giorni / scalaGiorni));
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
  if (filtroAttivo === 'storico') {
    renderStorico();
    return;
  }

  const tutti = Storage.getAttivi();

  const filtrati = tutti.filter(p => {
    const giorni = giorniAllaScadenza(scadenzaAttiva(p));
    if (filtroAttivo === 'urgente') return giorni <= 7 && giorni >= 0;
    if (filtroAttivo === 'scaduto') return giorni < 0;
    return true;
  }).sort((a, b) => scadenzaAttiva(a).localeCompare(scadenzaAttiva(b)));

  els.emptyState.classList.toggle('hidden', tutti.length > 0);
  els.emptyState.querySelector('h2').textContent = 'Dispensa vuota';
  els.emptyState.querySelector('p').textContent = 'Tocca il pulsante "+" in basso e inizia a elencare cosa hai comprato.';
  els.list.innerHTML = '';

  // Linea di consumo: separatore visivo (nessun cambio di colore/urgenza)
  // nel punto della lista, già ordinata per scadenza, dove cade la data
  // impostata dall'utente. Il raggruppamento (vedi renderGruppiProdotti) è
  // applicato separatamente prima e dopo la linea, cosicché un gruppo con
  // membri a cavallo della linea si divida automaticamente in due card.
  const lineaConsumo = getLineaConsumo();

  if (!lineaConsumo) {
    renderGruppiProdotti(filtrati);
    return;
  }

  let indiceSplit = filtrati.findIndex(p => scadenzaAttiva(p) >= lineaConsumo);
  if (indiceSplit === -1) indiceSplit = filtrati.length;

  renderGruppiProdotti(filtrati.slice(0, indiceSplit));
  els.list.appendChild(creaDivisoreLinea(lineaConsumo));
  renderGruppiProdotti(filtrati.slice(indiceSplit));
}

// Prodotti con lo stesso nome esatto (spazi e caratteri invisibili
// normalizzati prima del confronto) vengono aggregati in una sola card di
// gruppo; nomi anche solo leggermente diversi restano sempre separati,
// nessun accorpamento parziale/fuzzy. Puro calcolo di visualizzazione: non
// tocca mai Storage né il modello dati (ogni prodotto resta un record
// indipendente con il proprio stato/tag/note).
function normalizzaNome(nome) {
  return (nome || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}

function chiaveGruppo(nome) {
  return normalizzaNome(nome).toLowerCase();
}

function renderGruppiProdotti(lista) {
  const gruppi = new Map();
  lista.forEach(p => {
    const chiave = chiaveGruppo(p.nome);
    if (!gruppi.has(chiave)) gruppi.set(chiave, []);
    gruppi.get(chiave).push(p);
  });

  // L'ordine di inserimento in Map corrisponde all'ordine di scadenza (lista
  // è già ordinata), quindi sia i gruppi tra loro sia i membri dentro ogni
  // gruppo restano ordinati per scadenza senza bisogno di un sort aggiuntivo.
  gruppi.forEach((membri, chiave) => {
    if (membri.length === 1) {
      els.list.appendChild(creaCardProdotto(membri[0]));
    } else {
      creaCardGruppo(chiave, membri).forEach(li => els.list.appendChild(li));
    }
  });
}

function creaCardProdotto(p, extraClass) {
  const giorni = giorniAllaScadenza(scadenzaAttiva(p));
  const stato = statoDaGiorni(giorni);
  const scala = (p.aperto && p.durataApertoGiorni) ? Number(p.durataApertoGiorni) : 14;
  const li = document.createElement('li');
  li.className = 'product-card' + (extraClass ? ' ' + extraClass : '');
  li.dataset.id = p.id;
  li.innerHTML = `
    ${creaAnello(giorni, stato, scala)}
    <div class="product-info">
      <p class="product-name">${escapeHtml(p.nome)}</p>
      <p class="product-meta">
        <span>Scade ${formattaData(scadenzaAttiva(p))}</span>
        ${p.aperto ? `<span class="tag-aperto">Aperto</span>` : ''}
        ${p.scadenzaStimata ? `<span class="tag-stima">Stima</span>` : ''}
        ${p.motivo ? `<span class="tag-motivo">${escapeHtml(p.motivo)}</span>` : ''}
      </p>
    </div>`;
  li.addEventListener('click', () => apriDettaglio(p.id));
  return li;
}

// Pallino colorato compatto per i membri "secondari" di un gruppo compresso
// (tutti tranne quello che scade prima, mostrato in evidenza con l'anello
// grande) — stesso stato/colore di oggi, solo in formato più piccolo.
function creaMiniIndicatore(p) {
  const giorni = giorniAllaScadenza(scadenzaAttiva(p));
  const stato = statoDaGiorni(giorni);
  const etichetta = giorni < 0 ? 'Scad.' : giorni === 0 ? 'Oggi' : `${giorni}g`;
  return `<span class="group-mini-dot status-${stato}">${etichetta}</span>`;
}

// Card di gruppo: compressa (di default) mostra solo il membro che scade
// prima in evidenza + mini-indicatori degli altri, click per espandere;
// espansa mostra un'intestazione compatta + una creaCardProdotto() per ogni
// membro, con tutte le azioni già esistenti per un prodotto singolo (il
// click apre lo stesso dettaglio di sempre, nessuna funzione nuova lì).
function creaCardGruppo(chiave, membri) {
  const espanso = gruppiEspansi.has(chiave);

  if (!espanso) {
    const primo = membri[0];
    const altri = membri.slice(1);
    const giorni = giorniAllaScadenza(scadenzaAttiva(primo));
    const stato = statoDaGiorni(giorni);
    const scala = (primo.aperto && primo.durataApertoGiorni) ? Number(primo.durataApertoGiorni) : 14;
    const li = document.createElement('li');
    li.className = 'product-card product-card--group';
    li.innerHTML = `
      ${creaAnello(giorni, stato, scala)}
      <div class="product-info">
        <p class="product-name">${escapeHtml(primo.nome)} <span class="group-count">× ${membri.length}</span></p>
        <p class="product-meta">
          <span>Scade ${formattaData(scadenzaAttiva(primo))}</span>
          ${primo.aperto ? `<span class="tag-aperto">Aperto</span>` : ''}
          ${primo.scadenzaStimata ? `<span class="tag-stima">Stima</span>` : ''}
          ${primo.motivo ? `<span class="tag-motivo">${escapeHtml(primo.motivo)}</span>` : ''}
        </p>
        ${altri.length ? `<p class="group-mini-list">${altri.map(creaMiniIndicatore).join('')}</p>` : ''}
      </div>`;
    li.addEventListener('click', () => {
      gruppiEspansi.add(chiave);
      renderLista();
    });
    return [li];
  }

  const header = document.createElement('li');
  header.className = 'product-card product-card--group-header';
  header.innerHTML = `
    <div class="product-info">
      <p class="product-name">${escapeHtml(membri[0].nome)} <span class="group-count">× ${membri.length}</span></p>
    </div>
    <button type="button" class="btn-group-comprimi">Comprimi</button>`;
  header.querySelector('.btn-group-comprimi').addEventListener('click', (e) => {
    e.stopPropagation();
    gruppiEspansi.delete(chiave);
    renderLista();
  });

  return [header, ...membri.map(p => creaCardProdotto(p, 'product-card--group-member'))];
}

function creaDivisoreLinea(dataISO) {
  const li = document.createElement('li');
  li.className = 'linea-consumo';
  li.textContent = `── Consuma entro qui: ${formattaData(dataISO)} ──`;
  return li;
}

function renderStorico() {
  const storico = Storage.getStorico();

  els.emptyState.classList.toggle('hidden', storico.length > 0);
  els.emptyState.querySelector('h2').textContent = 'Storico vuoto';
  els.emptyState.querySelector('p').textContent = 'I prodotti consumati o eliminati restano qui per 24 ore, con la possibilità di ripristinarli.';
  els.list.innerHTML = '';

  storico.forEach(p => {
    const etichetta = p.stato === 'consumato' ? 'Consumato' : 'Eliminato';
    const li = document.createElement('li');
    li.className = 'product-card';
    li.dataset.id = p.id;
    li.innerHTML = `
      <div class="storico-badge ${p.stato}">${etichetta}</div>
      <div class="product-info">
        <p class="product-name">${escapeHtml(p.nome)}</p>
        <p class="product-meta">
          <span>Scadenza ${formattaData(p.scadenza)}</span>
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

els.btnFabAdd.addEventListener('click', apriVoce);
els.btnCloseVoice.addEventListener('click', chiudiVoce);

// Tre modi di aggiunta (vocale/testo/linea di consumo) mostrati uno alla
// volta invece che tutti impilati: la schermata era diventata affollata e
// la lista di revisione finiva fuori dallo schermo. Riusa lo stesso stile
// "chip" già usato per i filtri in home, così i due selettori sono coerenti.
const PANNELLI_AGGIUNTA = { vocale: els.pannelloVocale, testo: els.pannelloTesto, linea: els.pannelloLinea };

function selezionaModoAggiunta(modo) {
  els.addModeRow.querySelectorAll('.chip').forEach(c => c.classList.toggle('is-active', c.dataset.modo === modo));
  Object.entries(PANNELLI_AGGIUNTA).forEach(([nome, el]) => el.classList.toggle('hidden', nome !== modo));
  // L'esempio di frase è comune a vocale e testo (stesso formato), ma non
  // pertinente nella scheda della linea di consumo.
  els.addExample.classList.toggle('hidden', modo === 'linea');
  if (modo === 'testo') els.textInput.focus();
}

els.addModeRow.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  selezionaModoAggiunta(chip.dataset.modo);
});

function apriVoce() {
  bozzaRiconosciuti = [];
  els.voiceReview.classList.add('hidden');
  els.reviewList.innerHTML = '';
  els.liveTranscript.textContent = '';
  els.textInput.value = '';
  els.micStatus.textContent = 'Tocca per iniziare a parlare';
  els.btnMic.classList.remove('is-listening');
  selezionaModoAggiunta('vocale');
  aggiornaUILineaConsumo();
  els.viewVoice.classList.remove('hidden');

  if (!SpeechEngine.isSupported()) {
    els.micStatus.textContent = 'Riconoscimento vocale non supportato su questo browser. Usa Chrome su Android o desktop.';
    els.btnMic.disabled = true;
  } else {
    els.btnMic.disabled = false;
  }
}

els.btnAnalizzaTesto.addEventListener('click', () => {
  const testo = els.textInput.value.trim();
  if (!testo) return;
  elaboraTrascrizione(testo);
  els.textInput.value = '';
});

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
      } else if (err === 'avvio-fallito') {
        els.micStatus.textContent = 'Il microfono si è bloccato, tocca di nuovo per riprovare';
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
  // Si accoda a quanto già riconosciuto in eventuali sessioni precedenti
  // (es. l'utente tocca di nuovo il microfono per aggiungere i prodotti
  // mancanti), non lo sostituisce: altrimenti si perderebbe tutto quello
  // già raccolto.
  bozzaRiconosciuti = bozzaRiconosciuti.concat(riconosciuti);
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

els.btnClearReview.addEventListener('click', () => {
  bozzaRiconosciuti = [];
  renderReview();
  els.voiceReview.classList.add('hidden');
});

els.btnSaveAll.addEventListener('click', () => {
  const validi = bozzaRiconosciuti.filter(p => p.nome && p.scadenza);
  if (validi.length === 0) {
    mostraToast('Nessun prodotto da salvare');
    return;
  }
  Storage.aggiungiMassivo(validi);
  mostraToast(`Salvati ${validi.length} prodotti`);
  chiudiVoce();
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

  const attivo = p.stato === 'attivo';
  els.btnConsumato.classList.toggle('hidden', !attivo);
  els.btnElimina.classList.toggle('hidden', !attivo);
  els.btnRipristina.classList.toggle('hidden', attivo);

  aggiornaAperturaUI(p);

  els.viewDetail.classList.remove('hidden');
}

// La sezione "apertura" ha tre stati possibili, mutuamente esclusivi:
// 1. prodotto già aperto → info + "Annulla apertura"
// 2. si sta compilando la durata → form con l'input
// 3. nessuno dei due → solo il tasto "Segna come aperto"
// Non attiva per prodotti non attivi (storico): non avrebbe senso.
function aggiornaAperturaUI(p) {
  els.aperturaForm.classList.add('hidden');

  if (p.stato !== 'attivo') {
    els.aperturaInfo.classList.add('hidden');
    els.btnSegnaAperto.classList.add('hidden');
    els.stimaInfo.classList.add('hidden');
    return;
  }

  els.stimaInfo.classList.toggle('hidden', !p.scadenzaStimata);

  if (p.aperto) {
    els.aperturaInfo.classList.remove('hidden');
    els.btnSegnaAperto.classList.add('hidden');
    els.aperturaData.textContent = formattaData(p.dataApertura);
    els.aperturaScadenzaEffettiva.textContent = formattaData(scadenzaAttiva(p));
    els.aperturaEta.textContent = testoEta(p.dataApertura);
  } else {
    els.aperturaInfo.classList.add('hidden');
    els.btnSegnaAperto.classList.remove('hidden');
  }
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
});

els.btnConsumato.addEventListener('click', () => {
  if (!idProdottoInModifica) return;
  Storage.segnaStato(idProdottoInModifica, 'consumato');
  mostraToast('Segnato come consumato');
  chiudiDettaglio();
});

els.btnElimina.addEventListener('click', () => {
  if (!idProdottoInModifica) return;
  if (!confirm('Eliminare questo prodotto? Potrai ripristinarlo dallo storico per le prossime 24 ore.')) return;
  Storage.elimina(idProdottoInModifica);
  mostraToast('Prodotto eliminato');
  chiudiDettaglio();
});

els.btnRipristina.addEventListener('click', () => {
  if (!idProdottoInModifica) return;
  Storage.ripristina(idProdottoInModifica);
  mostraToast('Prodotto ripristinato');
  chiudiDettaglio();
});

// Duplica: nuovo record indipendente (nuovo id, nessun legame con
// l'originale dopo la creazione). Non eredita lo stato "aperto" — Storage.
// aggiungi() copia solo i campi passati esplicitamente qui sotto, quindi
// aperto/dataApertura/durataApertoGiorni restano fuori senza bisogno di
// escluderli a mano. Nasce sempre attivo (anche duplicando dallo storico):
// altrimenti il nuovo prodotto non comparirebbe da nessuna parte dopo la
// navigazione automatica al suo dettaglio, richiesta subito sotto.
els.btnDuplica.addEventListener('click', () => {
  if (!idProdottoInModifica) return;
  const originale = Storage.getById(idProdottoInModifica);
  if (!originale) return;
  const duplicato = Storage.aggiungi({
    nome: originale.nome,
    scadenza: originale.scadenza,
    acquisto: originale.acquisto,
    motivo: originale.motivo,
    note: originale.note,
    scadenzaStimata: originale.scadenzaStimata
  });
  mostraToast('Prodotto duplicato');
  apriDettaglio(duplicato.id);
});

/* ---------------- Prodotto "aperto" ---------------- */

els.btnSegnaAperto.addEventListener('click', () => {
  els.fDurataApertura.value = '7';
  els.btnSegnaAperto.classList.add('hidden');
  els.aperturaForm.classList.remove('hidden');
  els.fDurataApertura.focus();
  els.fDurataApertura.select();
});

els.btnAnnullaFormApertura.addEventListener('click', () => {
  els.aperturaForm.classList.add('hidden');
  els.btnSegnaAperto.classList.remove('hidden');
});

els.btnConfermaApertura.addEventListener('click', () => {
  if (!idProdottoInModifica) return;
  const durata = parseInt(els.fDurataApertura.value, 10);
  if (!durata || durata < 1) {
    mostraToast('Inserisci un numero di giorni valido');
    return;
  }
  Storage.aggiorna(idProdottoInModifica, {
    aperto: true,
    dataApertura: oggiISO(),
    durataApertoGiorni: durata
  });
  mostraToast('Prodotto segnato come aperto');
  chiudiDettaglio();
});

els.btnAnnullaApertura.addEventListener('click', () => {
  if (!idProdottoInModifica) return;
  Storage.aggiorna(idProdottoInModifica, { aperto: false });
  mostraToast('Apertura annullata');
  chiudiDettaglio();
});

// La scadenza "aperto" è già calcolata al volo da scadenzaAttiva() a partire
// da durataApertoGiorni: basta sommare 7 al contatore, nessun altro campo da
// toccare (a differenza di +7 sulla stima, vedi sotto: sono due meccanismi
// diversi che non condividono dati, vanno tenuti separati).
els.btnPiu7Apertura.addEventListener('click', () => {
  if (!idProdottoInModifica) return;
  const p = Storage.getById(idProdottoInModifica);
  if (!p) return;
  Storage.aggiorna(idProdottoInModifica, { durataApertoGiorni: Number(p.durataApertoGiorni) + 7 });
  mostraToast('Aggiunti 7 giorni');
  chiudiDettaglio();
});

/* ---------------- Prodotto a scadenza stimata ("verdura tra una settimana") ---------------- */

// Qui, a differenza di +7 sull'apertura, non esiste un contatore di giorni
// salvato da incrementare: la stima è già stata scritta direttamente nel
// campo scadenza al momento del riconoscimento (vedi js/speech.js), quindi
// si sposta in avanti quel campo stesso.
els.btnPiu7Stima.addEventListener('click', () => {
  if (!idProdottoInModifica) return;
  const p = Storage.getById(idProdottoInModifica);
  if (!p) return;
  const d = new Date(p.scadenza + 'T00:00:00');
  d.setDate(d.getDate() + 7);
  Storage.aggiorna(idProdottoInModifica, { scadenza: dataLocaleISO(d) });
  mostraToast('Scadenza spostata di 7 giorni');
  chiudiDettaglio();
});

/* ---------------- Aiuto ---------------- */

els.btnHelp.addEventListener('click', () => {
  els.helpVersion.textContent = APP_VERSION;
  els.viewHelp.classList.remove('hidden');
});
els.btnCloseHelp.addEventListener('click', () => els.viewHelp.classList.add('hidden'));

// Pagina aiuto a sezioni comprimibili: un solo listener delegato invece di
// uno per sezione, dato che il numero di sezioni cresce nel tempo.
document.querySelector('.help-body').addEventListener('click', (e) => {
  const toggle = e.target.closest('.help-accordion-toggle');
  if (!toggle) return;
  toggle.closest('.help-accordion').classList.toggle('is-open');
});

/* ---------------- Linea di consumo ----------------
   Data target impostabile liberamente, non legata a nessun prodotto:
   solo effetto visivo (un separatore in lista), niente cambi di colore o
   urgenza. Una sola linea attiva alla volta: impostarne una nuova sostituisce
   la precedente.

   Fuori da una casa condivisa è un promemoria di dispositivo, salvato solo
   in localStorage e non sincronizzato (come sempre). Dentro una casa
   condivisa diventa invece un dato della casa (punto 10): stessa data per
   tutti i membri, aggiornata in tempo reale via Storage.onCasaChange.
   ========================================================= */

const LINEA_CONSUMO_KEY = 'frigo_tracker_linea_consumo';

function getLineaConsumo() {
  if (Storage.inCasa()) {
    const info = Storage.getCasaInfo();
    return (info && !info.caricamento && info.lineaConsumo) || null;
  }
  return localStorage.getItem(LINEA_CONSUMO_KEY) || null;
}

function aggiornaUILineaConsumo() {
  const data = getLineaConsumo();
  els.fLineaConsumo.value = data || '';
  els.btnRimuoviLinea.classList.toggle('hidden', !data);
  if (els.lineaHint) {
    els.lineaHint.textContent = Storage.inCasa()
      ? 'Condivisa con la casa: la stessa data vale per tutti i membri. I prodotti che scadono prima vengono separati in home.'
      : 'I prodotti che scadono prima di questa data vengono separati in home, da consumare con priorità.';
  }
}

els.btnImpostaLinea.addEventListener('click', () => {
  const data = els.fLineaConsumo.value;
  if (!data) {
    mostraToast('Scegli prima una data');
    return;
  }
  if (Storage.inCasa()) {
    Storage.setLineaConsumoCasa(data)
      .then(() => mostraToast('Linea di consumo condivisa impostata'))
      .catch(() => mostraToast('Errore, riprova'));
    return;
  }
  localStorage.setItem(LINEA_CONSUMO_KEY, data);
  mostraToast('Linea di consumo impostata');
  aggiornaUILineaConsumo();
  renderLista();
});

els.btnRimuoviLinea.addEventListener('click', () => {
  if (Storage.inCasa()) {
    Storage.setLineaConsumoCasa(null)
      .then(() => mostraToast('Linea di consumo rimossa'))
      .catch(() => mostraToast('Errore, riprova'));
    return;
  }
  localStorage.removeItem(LINEA_CONSUMO_KEY);
  mostraToast('Linea di consumo rimossa');
  aggiornaUILineaConsumo();
  renderLista();
});

/* ---------------- Account ---------------- */

els.btnAccount.addEventListener('click', apriAccount);
els.btnCloseAccount.addEventListener('click', () => els.viewAccount.classList.add('hidden'));

function apriAccount() {
  aggiornaViewAccount();
  els.viewAccount.classList.remove('hidden');
}

function aggiornaViewAccount() {
  const utente = Auth.utenteCorrente();
  els.accountLoggedOut.classList.toggle('hidden', !!utente);
  els.accountLoggedIn.classList.toggle('hidden', !utente);
  if (utente) els.accountEmail.textContent = utente.email || '';
  aggiornaBottoneAccount(utente);
  aggiornaViewCasa();
}

/* ---------------- Casa condivisa ----------------
   Sezione dentro l'overlay Account, visibile solo da loggati. Due stati:
   "fuori da una casa" (crea / entra col codice) e "dentro una casa" (nome +
   contatore N/5, codice invito, lista membri, rigenera codice se sei il
   creatore, abbandona). Si ridisegna a ogni Storage.onCasaChange (un altro
   membro entra/esce, il creatore rigenera il codice, cambia la linea).
   ========================================================= */

function aggiornaViewCasa() {
  const utente = Auth.utenteCorrente();
  if (!utente) return;   // il blocco padre (#account-logged-in) è già nascosto

  const info = Storage.getCasaInfo();

  if (info && info.caricamento) {
    els.casaFuori.classList.add('hidden');
    els.casaDentro.classList.add('hidden');
    els.casaCaricamento.classList.remove('hidden');
    return;
  }
  els.casaCaricamento.classList.add('hidden');

  if (!info) {
    els.casaFuori.classList.remove('hidden');
    els.casaDentro.classList.add('hidden');
    return;
  }

  els.casaFuori.classList.add('hidden');
  els.casaDentro.classList.remove('hidden');

  els.casaNomeCorrente.textContent = info.nome;
  els.casaConteggio.textContent = Object.keys(info.membri).length + '/5';
  els.casaCodiceCorrente.textContent = info.codice;
  els.btnRigeneraCodice.classList.toggle('hidden', !info.sonoCreatore);

  const mioUid = utente.uid;
  els.casaMembri.innerHTML = Object.entries(info.membri).map(([uid, m]) => {
    const nome = escapeHtml(m.nome || m.email || 'Membro');
    const io = uid === mioUid ? ' <span class="casa-tu">(tu)</span>' : '';
    const email = m.email ? `<span class="migrazione-data">${escapeHtml(m.email)}</span>` : '';
    return `<li><span class="migrazione-nome">${nome}${io}</span>${email}</li>`;
  }).join('');
}

els.btnCreaCasa.addEventListener('click', () => {
  els.btnCreaCasa.disabled = true;
  Storage.creaCasa(els.casaNomeInput.value)
    .then(() => { mostraToast('Casa condivisa creata'); els.casaNomeInput.value = ''; })
    .catch((e) => mostraToast('Non riesco a creare la casa: ' + (e.message || 'errore')))
    .finally(() => { els.btnCreaCasa.disabled = false; });
});

els.btnEntraCasa.addEventListener('click', () => {
  const codice = els.casaCodiceInput.value.trim();
  if (!codice) { mostraToast('Inserisci il codice invito'); return; }
  els.btnEntraCasa.disabled = true;
  Storage.entraInCasaConCodice(codice)
    .then(() => { mostraToast('Sei entrato nella casa'); els.casaCodiceInput.value = ''; })
    .catch((e) => {
      const msg = e && e.motivo === 'piena' ? 'Questa casa ha già 5 membri'
        : e && e.motivo === 'gia-dentro' ? 'Sei già in questa casa'
        : e && e.motivo === 'non-valido' ? 'Codice non valido'
        : 'Non riesco a entrare: ' + ((e && e.message) || 'errore');
      mostraToast(msg);
    })
    .finally(() => { els.btnEntraCasa.disabled = false; });
});

function copiaCodiceCasa() {
  const codice = els.casaCodiceCorrente.textContent;
  if (!codice) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(codice)
      .then(() => mostraToast('Codice copiato: ' + codice))
      .catch(() => mostraToast('Copia non riuscita, copialo a mano'));
  } else {
    mostraToast('Codice: ' + codice);
  }
}

// Copia sia dal pulsante dedicato sia toccando direttamente il codice.
els.btnCopiaCodice.addEventListener('click', copiaCodiceCasa);
els.casaCodiceCorrente.addEventListener('click', copiaCodiceCasa);

els.btnRigeneraCodice.addEventListener('click', () => {
  if (!confirm('Rigenerare il codice? Quello attuale smetterà di funzionare per nuove adesioni. I membri già dentro restano.')) return;
  els.btnRigeneraCodice.disabled = true;
  Storage.rigeneraCodiceCasa()
    .then((nuovo) => mostraToast('Nuovo codice: ' + nuovo))
    .catch((e) => mostraToast('Non riesco a rigenerare: ' + (e.message || 'errore')))
    .finally(() => { els.btnRigeneraCodice.disabled = false; });
});

els.btnAbbandonaCasa.addEventListener('click', () => {
  if (!confirm('Abbandonare questa casa? Terrai una copia dei prodotti così come sono ora, tra i tuoi prodotti personali. Gli altri membri non ne risentono.')) return;
  els.btnAbbandonaCasa.disabled = true;
  Storage.abbandonaCasa()
    .then(() => mostraToast('Hai abbandonato la casa'))
    .catch((e) => mostraToast('Errore durante l\'uscita: ' + (e.message || 'errore')))
    .finally(() => { els.btnAbbandonaCasa.disabled = false; });
});

const ICONA_ACCOUNT = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5Z" fill="currentColor"/></svg>';

// Da loggato mostra la foto profilo Google (utente.photoURL, disponibile
// dall'oggetto restituito da Firebase Auth per il provider Google), o in
// mancanza l'iniziale del nome. Sostituisce la vecchia pillola testuale
// "Ciao, Nome", che su nomi lunghi si sovrapponeva agli altri pulsanti
// dell'header.
function aggiornaBottoneAccount(utente) {
  els.btnAccount.classList.remove('avatar-iniziale');
  if (utente) {
    els.btnAccount.title = 'Account';
    if (utente.photoURL) {
      els.btnAccount.innerHTML = `<img class="avatar-img" src="${utente.photoURL}" alt="">`;
    } else {
      const nome = utente.displayName || utente.email || '?';
      els.btnAccount.textContent = nome.charAt(0).toUpperCase();
      els.btnAccount.classList.add('avatar-iniziale');
    }
  } else {
    els.btnAccount.innerHTML = ICONA_ACCOUNT;
    els.btnAccount.title = 'Accedi';
  }
}

els.btnGoogleLogin.addEventListener('click', () => {
  els.btnGoogleLogin.disabled = true;
  Auth.accediConGoogle()
    .then((risultato) => {
      const nome = (risultato.user.displayName || '').split(' ')[0];
      mostraToast(nome ? `Bentornato, ${nome}` : 'Accesso effettuato');
      els.viewAccount.classList.add('hidden');
    })
    .catch((e) => {
      if (e.code === 'auth/popup-closed-by-user') return;
      mostraToast('Accesso non riuscito: ' + (e.code || e.message || 'errore sconosciuto'));
      console.error('Errore accesso Google', e);
    })
    .finally(() => { els.btnGoogleLogin.disabled = false; });
});

els.btnLogout.addEventListener('click', () => {
  Auth.esci();
  els.viewAccount.classList.add('hidden');
  mostraToast('Disconnesso');
});

/* ---------------- Prodotti solo locali in attesa di conferma ----------------
   Tre opzioni esplicite (punto 4), sia per la sync personale sia per
   l'adesione a una casa: Aggiungi (carica su account/casa) / Lascia solo qui
   (resta locale, si ri-chiede alla prossima apertura) / Elimina definitivamente
   (rimozione irreversibile, con conferma). Il testo cambia in base al contesto.
   ========================================================= */

function renderListaMigrazione(prodotti) {
  els.migrazioneLista.innerHTML = prodotti.map(p => `
    <li>
      <span class="migrazione-nome">${escapeHtml(p.nome)}</span>
      <span class="migrazione-data">Scade ${formattaData(p.scadenza)}</span>
    </li>
  `).join('');
}

function mostraPromptSoloLocali(prodotti, contesto) {
  renderListaMigrazione(prodotti);
  const casa = contesto === 'casa';
  els.migrazioneTitolo.textContent = casa
    ? 'Prodotti non ancora nella casa'
    : 'Dati trovati su questo dispositivo';
  els.migrazioneTesto.textContent = casa
    ? 'Hai prodotti salvati solo su questo dispositivo, non nella casa condivisa. Cosa vuoi farne?'
    : 'Hai prodotti salvati solo su questo dispositivo. Vuoi caricarli nel tuo account? Si sincronizzeranno su tutti i dispositivi.';
  els.btnMigraSi.textContent = casa ? 'Aggiungi alla casa' : 'Carica nel mio account';
  els.viewMigrazione.classList.remove('hidden');
}

els.btnMigraSi.addEventListener('click', () => {
  Storage.confermaCaricamentoSoloLocali()
    .then(() => mostraToast('Prodotti aggiunti'))
    .catch(() => mostraToast('Errore durante il caricamento, riprova più tardi'));
  els.viewMigrazione.classList.add('hidden');
});

els.btnMigraNo.addEventListener('click', () => {
  Storage.rifiutaCaricamentoSoloLocali();
  els.viewMigrazione.classList.add('hidden');
});

els.btnMigraElimina.addEventListener('click', () => {
  if (!confirm('Eliminare definitivamente questi prodotti da questo dispositivo? Non si potranno recuperare.')) return;
  Storage.eliminaSoloLocaliInAttesa();
  mostraToast('Prodotti eliminati');
  els.viewMigrazione.classList.add('hidden');
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

Auth.onChange(() => aggiornaViewAccount());

Storage.onChange(renderLista);
Storage.onCasaChange(() => {
  aggiornaViewCasa();
  aggiornaUILineaConsumo();
  renderLista();
});
Storage.onDatiSoloLocali((prodotti, contesto) => {
  mostraPromptSoloLocali(prodotti, contesto);
});
Storage.init();
try {
  Auth.init();
} catch (e) {
  console.error('Errore avvio Auth, si continua in modalità locale', e);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
