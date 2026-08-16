/* =========================================================
   Speech — riconoscimento vocale (Web Speech API) e parsing
   del testo italiano in una lista di prodotti strutturati.

   Nessuna AI coinvolta: solo regole/regex scritte a mano.
   Per questo il parsing va sempre confermato/corretto
   dall'utente prima del salvataggio (vedi voice_review in app.js).
   ========================================================= */

const MESI = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12
};

const NUMERI_PAROLA = {
  primo: 1, // "il primo settembre" è il modo naturale di dire il giorno 1, non "uno settembre"
  uno: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8,
  nove: 9, dieci: 10, undici: 11, dodici: 12, tredici: 13, quattordici: 14,
  quindici: 15, sedici: 16, diciassette: 17, diciotto: 18, diciannove: 19,
  venti: 20, ventuno: 21, ventidue: 22, ventitre: 23, ventitré: 23,
  ventiquattro: 24, venticinque: 25, ventisei: 26, ventisette: 27,
  ventotto: 28, ventinove: 29, trenta: 30, trentuno: 31
};

// Parole/espressioni che segnalano "fine di un prodotto, ne arriva un altro".
// Elenco fisso e scritto a mano (nessuna AI): più forme naturali qui dentro,
// meno l'utente deve ricordarsi di dire esattamente "poi".
const SEPARATORI = /\b(e\s+poi|poi\s+anche|e\s+quindi|poi|quindi|virgola|inoltre)\b/gi;

function numeroDaTesto(token) {
  if (/^\d{1,2}$/.test(token)) return parseInt(token, 10);
  return NUMERI_PAROLA[token.toLowerCase()] || null;
}

const NOME_GIORNO = Object.keys(NUMERI_PAROLA).concat(['\\d{1,2}']).join('|');
const NOME_MESE = Object.keys(MESI).join('|');
const DATA_REGEX = new RegExp(
  `\\b(${NOME_GIORNO})\\s+(${NOME_MESE})\\b(?:\\s+(\\d{4}))?`,
  'gi'
);

// Per prodotti senza una data stampata (es. verdura fresca): invece di una
// data esatta, una durata approssimativa da oggi ("tra una settimana", "tra
// tre giorni"). "un"/"una" non sono in NUMERI_PAROLA (lì non avrebbero senso
// per un giorno del mese), qui invece sono l'unico modo naturale di dire 1.
const UNITA_DURATA = { giorno: 1, giorni: 1, settimana: 7, settimane: 7 };
const NUMERI_DURATA = Object.assign({ un: 1, una: 1 }, NUMERI_PAROLA);
const NOME_NUMERO_DURATA = Object.keys(NUMERI_DURATA).concat(['\\d{1,2}']).join('|');
const NOME_UNITA_DURATA = Object.keys(UNITA_DURATA).join('|');
const DURATA_REGEX = new RegExp(
  `\\btra\\s+(${NOME_NUMERO_DURATA})\\s+(${NOME_UNITA_DURATA})\\b`,
  'gi'
);

function numeroDurataDaTesto(token) {
  if (/^\d{1,2}$/.test(token)) return parseInt(token, 10);
  return NUMERI_DURATA[token.toLowerCase()] || null;
}

function pulisciTesto(t) {
  return t
    .replace(/[.,;:!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rimuoviParoleIniziali(t) {
  return t.replace(/^\s*(allora|dunque|ok|okay|ecco)\s+/i, '').trim();
}

// Toglie un articolo residuo attaccato alla fine del nome prodotto, che resta
// lì quando si parla in modo naturale prima della data (es. "hummus il
// tredici settembre" → il nome grezzo prima della data è "hummus il").
function rimuoviArticoloFinale(t) {
  return t.replace(/\s+(il|lo|la|i|gli|le|l')$/i, '').trim();
}

function dataISO(giornoNum, meseNum, annoOpz) {
  const oggi = new Date();
  let anno = annoOpz ? parseInt(annoOpz, 10) : oggi.getFullYear();
  let candidata = new Date(anno, meseNum - 1, giornoNum);
  // Se la data (senza anno esplicito) è già passata da più di 30 giorni,
  // assumiamo che l'utente intendesse l'anno prossimo.
  if (!annoOpz) {
    const diffGiorni = (oggi - candidata) / (1000 * 60 * 60 * 24);
    if (diffGiorni > 30) {
      anno += 1;
      candidata = new Date(anno, meseNum - 1, giornoNum);
    }
  }
  const mm = String(meseNum).padStart(2, '0');
  const dd = String(giornoNum).padStart(2, '0');
  return `${anno}-${mm}-${dd}`;
}

// dataLocaleISO/oggiISO sono definite in storage.js, caricato prima di
// questo file: le riusiamo per restare coerenti col resto dell'app (mai
// toISOString(), vedi il bug di fuso orario corretto in js/storage.js).
function dataDaOggiPiuGiorni(giorni) {
  const d = new Date();
  d.setDate(d.getDate() + giorni);
  return dataLocaleISO(d);
}

/**
 * Analizza il testo dettato ed estrae una lista di prodotti.
 * Formato atteso per elemento: "<prodotto> <giorno> <mese> [per <motivo>]"
 * (o, per prodotti senza data stampata, "<prodotto> tra <numero> giorni/
 * settimane [per <motivo>]"). Più elementi si separano dicendo "poi" (o
 * "quindi"/"virgola") tra un prodotto e l'altro.
 */
function parseTranscript(testoGrezzo) {
  const testo = rimuoviParoleIniziali(pulisciTesto(testoGrezzo));
  if (!testo) return [];

  // Due tipi di "ancora" possibili per ogni prodotto (data esatta o durata
  // stimata): si cercano entrambi, poi si uniscono in ordine di comparsa nel
  // testo così lo stesso ciclo qui sotto può estrarre nome/motivo attorno a
  // ciascuna, indipendentemente dal tipo.
  const ancoreData = [...testo.matchAll(DATA_REGEX)].map(m => ({
    index: m.index,
    lunghezza: m[0].length,
    tipo: 'data',
    giornoNum: numeroDaTesto(m[1]),
    meseNum: MESI[m[2].toLowerCase()],
    anno: m[3]
  }));

  const ancoreDurata = [...testo.matchAll(DURATA_REGEX)].map(m => ({
    index: m.index,
    lunghezza: m[0].length,
    tipo: 'durata',
    numero: numeroDurataDaTesto(m[1]),
    unita: m[2].toLowerCase()
  }));

  const match = ancoreData.concat(ancoreDurata).sort((a, b) => a.index - b.index);
  if (match.length === 0) return [];

  const risultati = [];
  let nomeInAttesa = testo.slice(0, match[0].index).trim();

  for (let i = 0; i < match.length; i++) {
    const m = match[i];

    const nomeGrezzo = nomeInAttesa;
    nomeInAttesa = '';

    const fineAncora = m.index + m.lunghezza;
    const prossimoInizio = (i + 1 < match.length) ? match[i + 1].index : testo.length;
    const spanIntermedio = testo.slice(fineAncora, prossimoInizio).trim();

    let motivo = '';
    let resto = spanIntermedio;

    const perMatch = spanIntermedio.match(/^per\s+(.+)$/i);
    if (perMatch) {
      resto = perMatch[1];
      const sepMatch = resto.match(SEPARATORI);
      if (sepMatch) {
        const idx = resto.search(SEPARATORI);
        motivo = resto.slice(0, idx).trim();
        nomeInAttesa = resto.slice(idx).replace(SEPARATORI, '').trim();
      } else {
        motivo = resto.trim();
      }
    } else if (spanIntermedio) {
      // Nessun "per": tutto ciò che c'è va considerato inizio del prossimo prodotto,
      // ripulito da eventuali separatori come "poi"/"quindi".
      nomeInAttesa = spanIntermedio.replace(SEPARATORI, '').trim();
    }

    const nomePulito = rimuoviArticoloFinale(nomeGrezzo.replace(SEPARATORI, '').trim());
    if (!nomePulito) continue;

    if (m.tipo === 'data') {
      if (!m.giornoNum || !m.meseNum) continue;
      risultati.push({
        nome: capitalizza(nomePulito),
        scadenza: dataISO(m.giornoNum, m.meseNum, m.anno),
        motivo: capitalizza(motivo)
      });
    } else {
      if (!m.numero) continue;
      const giorni = m.numero * UNITA_DURATA[m.unita];
      risultati.push({
        nome: capitalizza(nomePulito),
        scadenza: dataDaOggiPiuGiorni(giorni),
        scadenzaStimata: true,
        motivo: capitalizza(motivo)
      });
    }
  }

  return risultati;
}

function capitalizza(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---------------- Wrapper Web Speech API ----------------
   Su Chrome Android la modalità "ascolto continuo" (continuous: true)
   ha un bug noto: quando il motore si riavvia internamente durante la
   sessione, a volte ripropone frasi già sentite come se fossero nuove,
   causando ripetizioni a valanga nella trascrizione. Non è qualcosa che
   possiamo correggere lato nostro leggendo l'array dei risultati in modo
   diverso: l'API stessa restituisce dati sporchi in quella modalità.

   Workaround: non usiamo mai l'ascolto continuo. Ascoltiamo una frase
   alla volta e, appena finisce, facciamo ripartire subito una nuova
   sessione da zero. Il testo definitivo di ogni frase viene aggiunto
   una volta sola al nostro elenco (_segmenti): non ci affidiamo più
   alla "memoria" che l'API mantiene tra un riavvio e l'altro.
   ========================================================= */

const SpeechEngine = {
  _recognition: null,
  _segmenti: [],
  _inAscolto: false,
  _callback: {},
  _tentativiAvvioFalliti: 0,

  isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  },

  start({ onInterim, onError, onEnd }) {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      onError && onError('not-supported');
      return;
    }
    this._segmenti = [];
    this._inAscolto = true;
    this._tentativiAvvioFalliti = 0;
    this._callback = { onInterim, onError, onEnd };
    this._avviaSessione(Ctor);
  },

  _avviaSessione(Ctor) {
    const rec = new Ctor();
    rec.lang = 'it-IT';
    rec.continuous = false;
    rec.interimResults = true;

    rec.onresult = (event) => {
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          this._aggiungiSegmento(chunk);
        } else {
          interim += chunk;
        }
      }
      this._callback.onInterim && this._callback.onInterim((this._testoCompleto() + ' ' + interim).trim());
    };

    rec.onerror = (event) => {
      // "no-speech" è normale: capita ogni volta che il riavvio automatico
      // attende la frase successiva e nel frattempo c'è silenzio. Non è un
      // errore da mostrare all'utente finché siamo ancora in ascolto.
      if (event.error === 'no-speech' && this._inAscolto) return;
      this._inAscolto = false;
      this._callback.onError && this._callback.onError(event.error);
    };

    rec.onend = () => {
      if (!this._inAscolto) {
        this._callback.onEnd && this._callback.onEnd(this._testoCompleto());
        return;
      }
      // Breve pausa prima di riavviare: su alcuni dispositivi Android far
      // ripartire il riconoscimento nello stesso istante in cui finisce il
      // precedente fa fallire l'avvio in modo silenzioso, perché il motore
      // vocale non ha ancora rilasciato il microfono.
      setTimeout(() => {
        if (this._inAscolto) this._avviaSessione(Ctor);
      }, 120);
    };

    this._recognition = rec;
    this._avviaConProtezione(rec, Ctor);
  },

  // rec.start() può fallire in modo sincrono e silenzioso (tipicamente un
  // errore "InvalidStateError" quando il motore vocale non è ancora pronto
  // dopo un riavvio troppo ravvicinato). Prima di questa protezione, in quel
  // caso l'app restava bloccata su "Ti ascolto..." senza che il microfono
  // ascoltasse davvero, costringendo a chiudere e riaprire per sbloccarsi.
  // Ora si ritenta un paio di volte con una pausa breve prima di arrendersi
  // e avvisare l'utente con un errore visibile.
  _avviaConProtezione(rec, Ctor) {
    try {
      rec.start();
      this._tentativiAvvioFalliti = 0;
    } catch (e) {
      this._tentativiAvvioFalliti++;
      if (this._tentativiAvvioFalliti > 3) {
        this._inAscolto = false;
        this._tentativiAvvioFalliti = 0;
        this._callback.onError && this._callback.onError('avvio-fallito');
        return;
      }
      setTimeout(() => {
        if (this._inAscolto) this._avviaSessione(Ctor);
      }, 300);
    }
  },

  _aggiungiSegmento(testoGrezzo) {
    const testo = testoGrezzo.trim();
    if (!testo) return;
    const ultimo = this._segmenti[this._segmenti.length - 1];
    if (testo === ultimo) return;
    this._segmenti.push(testo);
  },

  _testoCompleto() {
    return this._segmenti.join(' ');
  },

  stop() {
    this._inAscolto = false;
    if (this._recognition) this._recognition.stop();
  }
};

// Esposti globalmente per app.js
window.SpeechParser = { parseTranscript };
window.SpeechEngine = SpeechEngine;
