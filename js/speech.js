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

function pulisciTesto(t) {
  return t
    .replace(/[.,;:!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rimuoviParoleIniziali(t) {
  return t.replace(/^\s*(allora|dunque|ok|okay|ecco)\s+/i, '').trim();
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

/**
 * Analizza il testo dettato ed estrae una lista di prodotti.
 * Formato atteso per elemento: "<prodotto> <giorno> <mese> [per <motivo>]"
 * Più elementi si separano dicendo "poi" (o "quindi"/"virgola") tra un
 * prodotto e l'altro.
 */
function parseTranscript(testoGrezzo) {
  const testo = rimuoviParoleIniziali(pulisciTesto(testoGrezzo));
  if (!testo) return [];

  const match = [...testo.matchAll(DATA_REGEX)];
  if (match.length === 0) return [];

  const risultati = [];
  let nomeInAttesa = testo.slice(0, match[0].index).trim();

  for (let i = 0; i < match.length; i++) {
    const m = match[i];
    const giornoNum = numeroDaTesto(m[1]);
    const meseNum = MESI[m[2].toLowerCase()];
    const anno = m[3];

    const nomeGrezzo = nomeInAttesa;
    nomeInAttesa = '';

    const fineData = m.index + m[0].length;
    const prossimoInizio = (i + 1 < match.length) ? match[i + 1].index : testo.length;
    const spanIntermedio = testo.slice(fineData, prossimoInizio).trim();

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

    const nomePulito = nomeGrezzo.replace(SEPARATORI, '').trim();

    if (giornoNum && meseNum && nomePulito) {
      risultati.push({
        nome: capitalizza(nomePulito),
        scadenza: dataISO(giornoNum, meseNum, anno),
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
      if (this._inAscolto) {
        this._avviaSessione(Ctor);
      } else {
        this._callback.onEnd && this._callback.onEnd(this._testoCompleto());
      }
    };

    this._recognition = rec;
    rec.start();
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
