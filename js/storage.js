/* =========================================================
   Storage — doppio backend: localStorage (nessun login) o
   Firestore (login attivo), stessa interfaccia pubblica per
   il resto dell'app (getAttivi, getById, aggiungi, aggiorna,
   segnaStato, elimina, aggiungiMassivo).

   Una cache in memoria (_cache) alimenta le letture, sempre
   sincrone: in modalità locale viene popolata da localStorage,
   in modalità cloud da un listener realtime di Firestore
   (onSnapshot) più aggiornamenti ottimistici ad ogni scrittura,
   così l'interfaccia resta identica indipendentemente dal
   backend. Un solo meccanismo di notifica (Storage.onChange)
   avvisa app.js di qualunque cambiamento, locale o da un altro
   dispositivo sincronizzato.

   Al passaggio a modalità cloud (login), il primo snapshot da
   Firestore non sostituisce la cache: viene riconciliato con
   quanto già presente in locale (vedi calcolaMerge/
   _riconciliaConCloud), per non perdere prodotti aggiunti offline
   o non ancora migrati. Scrive sempre anche in localStorage,
   anche in modalità cloud, come base di riserva.
   ========================================================= */

const STORAGE_KEY = 'frigo_tracker_prodotti_v1';

// Formatta una data in locale come YYYY-MM-DD. Non usare toISOString(), che è
// in UTC: vicino alla mezzanotte, in fusi orari avanti rispetto a UTC (es.
// l'Italia in ora legale), restituirebbe il giorno prima di quello locale.
function dataLocaleISO(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const gg = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${gg}`;
}

function oggiISO() {
  return dataLocaleISO(new Date());
}

// Confronta due elenchi di prodotti (locale e cloud) e decide come unirli.
// Pura: nessun accesso a Firestore/localStorage, così è facile da testare
// passandole array fabbricati (vedi scratchpad di test della sessione).
//  - presente solo su cloud → incluso così com'è
//  - presente in entrambi → vince chi ha modificatoIl più recente (i prodotti
//    senza questo campo, dati vecchi, contano come "modificati nel 1970" e
//    perdono sempre il confronto)
//  - presente solo in locale → incluso comunque nel risultato (subito
//    visibile/usabile), ma raccolto a parte come "da confermare" prima di
//    inviarlo a Firestore
function calcolaMerge(locali, cloud) {
  const mappaLocale = new Map(locali.map(p => [p.id, p]));
  const mappaCloud = new Map(cloud.map(p => [p.id, p]));

  const risultato = [];
  const daInviareACloud = [];
  const soloLocali = [];

  cloud.forEach(pCloud => {
    const pLocale = mappaLocale.get(pCloud.id);
    if (!pLocale) {
      risultato.push(pCloud);
      return;
    }
    const tLocale = new Date(pLocale.modificatoIl || 0).getTime();
    const tCloud = new Date(pCloud.modificatoIl || 0).getTime();
    if (tLocale > tCloud) {
      risultato.push(pLocale);
      daInviareACloud.push(pLocale);
    } else {
      risultato.push(pCloud);
    }
  });

  locali.forEach(pLocale => {
    if (!mappaCloud.has(pLocale.id)) {
      risultato.push(pLocale);
      soloLocali.push(pLocale);
    }
  });

  return { risultato, daInviareACloud, soloLocali };
}

const Storage = {
  _cache: [],
  _listeners: [],
  _listenersSoloLocali: [],
  _soloLocaliInAttesa: null,
  _modalita: 'locale',   // 'locale' | 'cloud'
  _uid: null,
  _unsubscribeFirestore: null,

  init() {
    // Mostra subito i dati locali, senza aspettare Firebase: se l'accesso
    // Google risulta già attivo, il passaggio a Firestore avviene poco
    // dopo tramite Auth.onChange e aggiorna di nuovo la vista.
    this._cache = this._leggiLocale();
    this._notifica();

    if (window.Auth) {
      Auth.onChange((utente) => {
        if (utente) this._passaACloud(utente.uid);
        else this._passaALocale();
      });
    }
  },

  onChange(cb) {
    this._listeners.push(cb);
  },

  _notifica() {
    this._listeners.forEach(cb => cb());
  },

  /* ---------------- Passaggio tra modalità ---------------- */

  _passaACloud(uid) {
    this._modalita = 'cloud';
    this._uid = uid;
    if (this._unsubscribeFirestore) this._unsubscribeFirestore();

    // Solo il primo snapshot dopo il login richiede una riconciliazione con
    // quanto già presente in locale (vedi _riconciliaConCloud): gli snapshot
    // successivi sono aggiornamenti realtime durante la sessione (es. un
    // altro dispositivo che salva qualcosa) e a quel punto i due lati sono
    // già stati confrontati una volta, quindi si può sostituire la cache
    // direttamente come prima.
    let primoSnapshot = true;
    this._unsubscribeFirestore = this._collezioneCloud().onSnapshot((snapshot) => {
      const daCloud = snapshot.docs.map(d => d.data());
      if (primoSnapshot) {
        primoSnapshot = false;
        this._riconciliaConCloud(daCloud);
      } else {
        this._cache = daCloud;
        this._ordinaCache();
        this._notifica();
      }
    }, (e) => console.error('Errore sync Firestore', e));
  },

  _riconciliaConCloud(daCloud) {
    const locali = this._prodottiLocaliGrezzi();
    const { risultato, daInviareACloud, soloLocali } = calcolaMerge(locali, daCloud);

    this._cache = risultato;
    this._ordinaCache();
    this._scriviLocale(risultato);
    this._notifica();

    daInviareACloud.forEach(p => {
      this._collezioneCloud().doc(p.id).set(p)
        .catch(e => console.error('Errore sync verso cloud', e));
    });

    if (soloLocali.length > 0) {
      this._soloLocaliInAttesa = soloLocali;
      this._listenersSoloLocali.forEach(cb => cb(soloLocali));
    }
  },

  _passaALocale() {
    this._modalita = 'locale';
    this._uid = null;
    if (this._unsubscribeFirestore) {
      this._unsubscribeFirestore();
      this._unsubscribeFirestore = null;
    }
    this._cache = this._leggiLocale();
    this._notifica();
  },

  _collezioneCloud() {
    return firebase.firestore().collection('utenti').doc(this._uid).collection('prodotti');
  },

  _ordinaCache() {
    this._cache.sort((a, b) => a.scadenza.localeCompare(b.scadenza));
  },

  /* ---------------- Lettura/scrittura localStorage ---------------- */

  _leggiLocale() {
    const lista = this._prodottiLocaliGrezzi();
    return lista.sort((a, b) => a.scadenza.localeCompare(b.scadenza));
  },

  _prodottiLocaliGrezzi() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Errore lettura storage', e);
      return [];
    }
  },

  _scriviLocale(lista) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
  },

  /* ---------------- Lettura pubblica (sempre sincrona) ---------------- */

  getTutti() {
    return this._cache.slice();
  },

  getAttivi() {
    return this._cache.filter(p => p.stato === 'attivo');
  },

  getById(id) {
    const p = this._cache.find(x => x.id === id);
    return p ? { ...p } : null;
  },

  /* ---------------- Scrittura pubblica ---------------- */

  aggiungi(prodotto) {
    const nuovo = {
      id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      nome: prodotto.nome,
      scadenza: prodotto.scadenza,       // YYYY-MM-DD
      acquisto: prodotto.acquisto || oggiISO(),
      motivo: prodotto.motivo || '',
      note: prodotto.note || '',
      stato: 'attivo',                    // attivo | consumato | eliminato
      scadenzaStimata: !!prodotto.scadenzaStimata  // true se calcolata da "tra N giorni/settimane" invece di una data esatta
    };
    this._salvaProdotto(nuovo);
    return nuovo;
  },

  aggiungiMassivo(prodotti) {
    return prodotti.map(p => this.aggiungi(p));
  },

  aggiorna(id, cambi) {
    const esistente = this.getById(id);
    if (!esistente) return null;
    const aggiornato = { ...esistente, ...cambi };
    this._salvaProdotto(aggiornato);
    return aggiornato;
  },

  // cambiatoIl traccia quando lo stato è cambiato l'ultima volta: serve a
  // getStorico() per sapere quali eliminati/consumati sono ancora "recenti"
  // (visibili nello storico) e quali no.
  segnaStato(id, stato) {
    return this.aggiorna(id, { stato, cambiatoIl: new Date().toISOString() });
  },

  // Eliminazione "morbida": il prodotto non sparisce subito per sempre, resta
  // recuperabile dallo storico (vedi getStorico/ripristina) coerentemente con
  // il principio "nessuna eliminazione diretta senza conferma/possibilità di
  // tornare indietro" già seguito altrove nell'app.
  elimina(id) {
    return this.segnaStato(id, 'eliminato');
  },

  ripristina(id) {
    return this.segnaStato(id, 'attivo');
  },

  // Prodotti consumati/eliminati nelle ultime 24 ore: oltre sparisce dalla
  // vista (ma il dato resta comunque salvato, non viene mai cancellato per
  // davvero da qui).
  getStorico() {
    const soglia = Date.now() - 24 * 60 * 60 * 1000;
    return this._cache.filter(p =>
      p.stato !== 'attivo' && p.cambiatoIl && new Date(p.cambiatoIl).getTime() >= soglia
    );
  },

  // Aggiornamento ottimistico della cache (uguale in entrambe le modalità,
  // così chi chiama aggiungi/aggiorna non deve mai aspettare la rete),
  // seguito dalla scrittura effettiva. Scrive sempre anche in localStorage,
  // pure in modalità cloud: così la copia locale resta una base di riserva
  // aggiornata se il dispositivo va offline prima che Firestore confermi.
  _salvaProdotto(prodotto) {
    prodotto.modificatoIl = new Date().toISOString();

    const idx = this._cache.findIndex(p => p.id === prodotto.id);
    if (idx === -1) this._cache.push(prodotto);
    else this._cache[idx] = prodotto;
    this._ordinaCache();
    this._notifica();

    this._scriviProdottoLocale(prodotto);

    if (this._modalita === 'cloud') {
      this._collezioneCloud().doc(prodotto.id).set(prodotto)
        .catch(e => console.error('Errore salvataggio cloud', e));
    }
  },

  _scriviProdottoLocale(prodotto) {
    const lista = this._prodottiLocaliGrezzi();
    const idx = lista.findIndex(p => p.id === prodotto.id);
    if (idx === -1) lista.push(prodotto);
    else lista[idx] = prodotto;
    this._scriviLocale(lista);
  },

  /* ---------------- Prodotti presenti solo in locale, in attesa di conferma ---------------- */

  onDatiSoloLocali(cb) {
    this._listenersSoloLocali.push(cb);
  },

  confermaCaricamentoSoloLocali() {
    const pendenti = this._soloLocaliInAttesa || [];
    this._soloLocaliInAttesa = null;
    if (pendenti.length === 0 || this._modalita !== 'cloud') return Promise.resolve();
    const batch = firebase.firestore().batch();
    const coll = this._collezioneCloud();
    pendenti.forEach(p => batch.set(coll.doc(p.id), p));
    return batch.commit();
  },

  rifiutaCaricamentoSoloLocali() {
    this._soloLocaliInAttesa = null;
  }
};
