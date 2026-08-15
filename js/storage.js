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
   ========================================================= */

const STORAGE_KEY = 'frigo_tracker_prodotti_v1';

const Storage = {
  _cache: [],
  _listeners: [],
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
    this._unsubscribeFirestore = this._collezioneCloud().onSnapshot((snapshot) => {
      this._cache = snapshot.docs.map(d => d.data());
      this._ordinaCache();
      this._notifica();
    }, (e) => console.error('Errore sync Firestore', e));
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
      acquisto: prodotto.acquisto || new Date().toISOString().slice(0, 10),
      motivo: prodotto.motivo || '',
      note: prodotto.note || '',
      stato: 'attivo'                     // attivo | consumato | eliminato
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

  segnaStato(id, stato) {
    return this.aggiorna(id, { stato });
  },

  elimina(id) {
    this._cache = this._cache.filter(p => p.id !== id);
    this._notifica();

    if (this._modalita === 'cloud') {
      this._collezioneCloud().doc(id).delete()
        .catch(e => console.error('Errore eliminazione cloud', e));
    } else {
      this._scriviLocale(this._prodottiLocaliGrezzi().filter(p => p.id !== id));
    }
  },

  // Aggiornamento ottimistico della cache (uguale in entrambe le modalità,
  // così chi chiama aggiungi/aggiorna non deve mai aspettare la rete),
  // seguito dalla scrittura effettiva sul backend attivo.
  _salvaProdotto(prodotto) {
    const idx = this._cache.findIndex(p => p.id === prodotto.id);
    if (idx === -1) this._cache.push(prodotto);
    else this._cache[idx] = prodotto;
    this._ordinaCache();
    this._notifica();

    if (this._modalita === 'cloud') {
      this._collezioneCloud().doc(prodotto.id).set(prodotto)
        .catch(e => console.error('Errore salvataggio cloud', e));
    } else {
      const lista = this._prodottiLocaliGrezzi();
      const idxLocale = lista.findIndex(p => p.id === prodotto.id);
      if (idxLocale === -1) lista.push(prodotto);
      else lista[idxLocale] = prodotto;
      this._scriviLocale(lista);
    }
  },

  /* ---------------- Migrazione locale → cloud ---------------- */

  haDatiLocaliDaMigrare() {
    return this._prodottiLocaliGrezzi().length > 0;
  },

  migraDatiLocaliSuCloud() {
    if (this._modalita !== 'cloud') return Promise.resolve();
    const locali = this._prodottiLocaliGrezzi();
    const batch = firebase.firestore().batch();
    const coll = this._collezioneCloud();
    locali.forEach(p => batch.set(coll.doc(p.id), p));
    return batch.commit();
  }
};
