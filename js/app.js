/* =========================================================
   App — collega storage, riconoscimento vocale e interfaccia
   ========================================================= */

const els = {
  list: document.getElementById('product-list'),
  emptyState: document.getElementById('empty-state'),
  filterRow: document.querySelector('.filter-row'),

  btnAdd: document.getElementById('btn-add'),
  btnAddText: document.getElementById('btn-add-text'),
  viewVoice: document.getElementById('view-voice'),
  btnCloseVoice: document.getElementById('btn-close-voice'),
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

  aperturaInfo: document.getElementById('apertura-info'),
  aperturaData: document.getElementById('apertura-data'),
  aperturaScadenzaEffettiva: document.getElementById('apertura-scadenza-effettiva'),
  btnAnnullaApertura: document.getElementById('btn-annulla-apertura'),
  aperturaForm: document.getElementById('apertura-form'),
  fDurataApertura: document.getElementById('f-durata-apertura'),
  btnAnnullaFormApertura: document.getElementById('btn-annulla-form-apertura'),
  btnConfermaApertura: document.getElementById('btn-conferma-apertura'),
  btnSegnaAperto: document.getElementById('btn-segna-aperto'),

  btnHelp: document.getElementById('btn-help'),
  viewHelp: document.getElementById('view-help'),
  btnCloseHelp: document.getElementById('btn-close-help'),
  helpVersion: document.getElementById('help-version'),

  btnAccount: document.getElementById('btn-account'),
  viewAccount: document.getElementById('view-account'),
  btnCloseAccount: document.getElementById('btn-close-account'),
  accountLoggedOut: document.getElementById('account-logged-out'),
  accountLoggedIn: document.getElementById('account-logged-in'),
  accountEmail: document.getElementById('account-email'),
  btnGoogleLogin: document.getElementById('btn-google-login'),
  btnLogout: document.getElementById('btn-logout'),

  viewMigrazione: document.getElementById('view-migrazione'),
  btnMigraSi: document.getElementById('btn-migra-si'),
  btnMigraNo: document.getElementById('btn-migra-no'),

  toast: document.getElementById('toast')
};

const MIGRAZIONE_CHIESTA_KEY = 'frigo_tracker_migrazione_chiesta';

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
  els.emptyState.querySelector('p').textContent = 'Tocca il microfono in alto e inizia a elencare cosa hai comprato.';
  els.list.innerHTML = '';

  filtrati.forEach(p => {
    const giorni = giorniAllaScadenza(scadenzaAttiva(p));
    const stato = statoDaGiorni(giorni);
    const scala = (p.aperto && p.durataApertoGiorni) ? Number(p.durataApertoGiorni) : 14;
    const li = document.createElement('li');
    li.className = 'product-card';
    li.dataset.id = p.id;
    li.innerHTML = `
      ${creaAnello(giorni, stato, scala)}
      <div class="product-info">
        <p class="product-name">${escapeHtml(p.nome)}</p>
        <p class="product-meta">
          <span>Scade ${formattaData(scadenzaAttiva(p))}</span>
          ${p.aperto ? `<span class="tag-aperto">Aperto</span>` : ''}
          ${p.motivo ? `<span class="tag-motivo">${escapeHtml(p.motivo)}</span>` : ''}
        </p>
      </div>`;
    li.addEventListener('click', () => apriDettaglio(p.id));
    els.list.appendChild(li);
  });
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

els.btnAdd.addEventListener('click', apriVoce);
els.btnAddText.addEventListener('click', () => {
  apriVoce();
  els.textInput.focus();
});
els.btnCloseVoice.addEventListener('click', chiudiVoce);

function apriVoce() {
  bozzaRiconosciuti = [];
  els.voiceReview.classList.add('hidden');
  els.reviewList.innerHTML = '';
  els.liveTranscript.textContent = '';
  els.textInput.value = '';
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
    return;
  }

  if (p.aperto) {
    els.aperturaInfo.classList.remove('hidden');
    els.btnSegnaAperto.classList.add('hidden');
    els.aperturaData.textContent = formattaData(p.dataApertura);
    els.aperturaScadenzaEffettiva.textContent = formattaData(scadenzaAttiva(p));
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

/* ---------------- Prodotto "aperto" ---------------- */

els.btnSegnaAperto.addEventListener('click', () => {
  els.fDurataApertura.value = '';
  els.btnSegnaAperto.classList.add('hidden');
  els.aperturaForm.classList.remove('hidden');
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

/* ---------------- Aiuto ---------------- */

els.btnHelp.addEventListener('click', () => {
  els.helpVersion.textContent = APP_VERSION;
  els.viewHelp.classList.remove('hidden');
});
els.btnCloseHelp.addEventListener('click', () => els.viewHelp.classList.add('hidden'));

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
}

const ICONA_ACCOUNT = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5Z" fill="currentColor"/></svg>';

function aggiornaBottoneAccount(utente) {
  if (utente) {
    const nome = utente.displayName ? utente.displayName.split(' ')[0] : (utente.email || '').split('@')[0];
    els.btnAccount.textContent = `Ciao, ${nome}`;
    els.btnAccount.classList.add('btn-account-loggato');
    els.btnAccount.title = 'Account';
  } else {
    els.btnAccount.innerHTML = ICONA_ACCOUNT;
    els.btnAccount.classList.remove('btn-account-loggato');
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

/* ---------------- Migrazione dati locali ---------------- */

els.btnMigraSi.addEventListener('click', () => {
  Storage.migraDatiLocaliSuCloud()
    .then(() => mostraToast('Dati caricati nel tuo account'))
    .catch(() => mostraToast('Errore durante il caricamento, riprova più tardi'));
  localStorage.setItem(MIGRAZIONE_CHIESTA_KEY, '1');
  els.viewMigrazione.classList.add('hidden');
});

els.btnMigraNo.addEventListener('click', () => {
  localStorage.setItem(MIGRAZIONE_CHIESTA_KEY, '1');
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

Auth.onChange((utente) => {
  aggiornaViewAccount();
  if (utente && Storage.haDatiLocaliDaMigrare() && !localStorage.getItem(MIGRAZIONE_CHIESTA_KEY)) {
    els.viewMigrazione.classList.remove('hidden');
  }
});

Storage.onChange(renderLista);
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
