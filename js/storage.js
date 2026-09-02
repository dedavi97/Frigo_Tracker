/* =========================================================
   Storage — tre backend, stessa interfaccia pubblica per il
   resto dell'app (getAttivi, getById, aggiungi, aggiorna,
   segnaStato, elimina, aggiungiMassivo):

   - 'locale'  → localStorage, nessun login
   - 'cloud'   → Firestore utenti/{uid}/prodotti, login Google
   - 'casa'    → Firestore case/{casaId}/prodotti, inventario
                 condiviso fino a 5 membri (vedi sezione Casa in
                 fondo al file)

   Una cache in memoria (_cache) alimenta le letture, sempre
   sincrone: in modalità locale viene popolata da localStorage,
   nelle modalità cloud/casa da un listener realtime di Firestore
   (onSnapshot) più aggiornamenti ottimistici ad ogni scrittura,
   così l'interfaccia resta identica indipendentemente dal
   backend. Un solo meccanismo di notifica (Storage.onChange)
   avvisa app.js di qualunque cambiamento, locale o da un altro
   dispositivo/membro sincronizzato.

   Al passaggio a modalità cloud (login), il primo snapshot da
   Firestore non sostituisce la cache: viene riconciliato con
   quanto già presente in locale (vedi calcolaMerge/
   _riconciliaConCloud), per non perdere prodotti aggiunti offline
   o non ancora migrati. Scrive sempre anche in localStorage,
   anche in modalità cloud, come base di riserva.

   In modalità casa la casa è autoritativa (nessun merge per
   "modifica più recente"): il primo snapshot sostituisce la
   cache e i prodotti personali che non sono nella casa vengono
   solo segnalati (calcolaSoloLocali) per il prompt a 3 opzioni.
   ========================================================= */

const STORAGE_KEY = 'frigo_tracker_prodotti_v1';
// caseId della casa condivisa attualmente attiva su questo dispositivo:
// persistito così al riavvio si rientra subito nella casa (i listener si
// riattaccano appena Firebase Auth conferma il login).
const CASA_ATTIVA_KEY = 'frigo_tracker_casa_attiva';
// Fotografia locale dei prodotti della casa: riserva offline mentre si è
// dentro + copia che resta al dispositivo quando abbandona la casa.
const CASA_PRODOTTI_KEY = 'frigo_tracker_casa_prodotti';

// Codice invito casa: 6 caratteri, alfabeto senza 0/O/1/I per non confondersi
// leggendolo o dettandolo ad alta voce.
const ALFABETO_CODICE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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

// Prodotti presenti in locale ma NON nella casa condivisa (confronto per id).
// Pura, come calcolaMerge. In modalità casa non serve un merge completo: la
// casa è autoritativa, quindi i prodotti già presenti in entrambi si prendono
// dalla casa e basta; interessano solo quelli che il dispositivo ha in più,
// da proporre all'utente (aggiungi alla casa / ignora / elimina).
function calcolaSoloLocali(locali, remoti) {
  const idRemoti = new Set(remoti.map(p => p.id));
  return locali.filter(p => !idRemoti.has(p.id));
}

const Storage = {
  _cache: [],
  _listeners: [],
  _listenersSoloLocali: [],
  _casaListeners: [],
  _soloLocaliInAttesa: null,
  _contestoSoloLocali: null,   // 'personale' | 'casa' — guida il testo del prompt
  _modalita: 'locale',         // 'locale' | 'cloud' | 'casa'
  _uid: null,
  _casaId: null,
  _casaDoc: null,              // ultimo snapshot del documento case/{casaId}
  _unsubscribeFirestore: null,
  _unsubscribeCasaDoc: null,
  _unsubscribeCasaProdotti: null,

  init() {
    // Mostra subito i dati disponibili, senza aspettare Firebase. Se sul
    // dispositivo c'è una casa attiva partiamo dalla sua fotografia locale
    // (così offline si vede comunque qualcosa), altrimenti dai prodotti
    // personali. Il passaggio alla versione realtime avviene poco dopo,
    // tramite Auth.onChange.
    const casaId = this._leggiCasaAttiva();
    if (casaId) {
      this._casaId = casaId;
      this._modalita = 'casa';
      this._cache = this._leggiCasaProdotti();
    } else {
      this._cache = this._leggiLocale();
    }
    this._notifica();

    if (window.Auth) {
      Auth.onChange((utente) => {
        if (utente) {
          const casa = this._leggiCasaAttiva();
          if (casa) this._passaACasa(casa);
          else this._passaACloud(utente.uid);
        } else {
          this._passaALocale();
        }
      });
    }
  },

  onChange(cb) {
    this._listeners.push(cb);
  },

  onCasaChange(cb) {
    this._casaListeners.push(cb);
  },

  _notifica() {
    this._listeners.forEach(cb => cb());
  },

  _notificaCasa() {
    this._casaListeners.forEach(cb => cb());
  },

  /* ---------------- Passaggio tra modalità ---------------- */

  _staccaListenerCloud() {
    if (this._unsubscribeFirestore) {
      this._unsubscribeFirestore();
      this._unsubscribeFirestore = null;
    }
  },

  _staccaListenerCasa() {
    if (this._unsubscribeCasaDoc) {
      this._unsubscribeCasaDoc();
      this._unsubscribeCasaDoc = null;
    }
    if (this._unsubscribeCasaProdotti) {
      this._unsubscribeCasaProdotti();
      this._unsubscribeCasaProdotti = null;
    }
  },

  _passaACloud(uid) {
    this._modalita = 'cloud';
    this._uid = uid;
    this._casaId = null;
    this._casaDoc = null;
    this._staccaListenerCasa();
    this._staccaListenerCloud();

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
      this._contestoSoloLocali = 'personale';
      this._listenersSoloLocali.forEach(cb => cb(soloLocali, 'personale'));
    }
  },

  _passaALocale() {
    this._modalita = 'locale';
    this._uid = null;
    this._casaId = null;
    this._casaDoc = null;
    this._staccaListenerCloud();
    this._staccaListenerCasa();
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

  _leggiCasaAttiva() {
    try {
      return localStorage.getItem(CASA_ATTIVA_KEY) || null;
    } catch (e) {
      return null;
    }
  },

  _casaProdottiGrezzi() {
    try {
      const raw = localStorage.getItem(CASA_PRODOTTI_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Errore lettura fotografia casa', e);
      return [];
    }
  },

  _leggiCasaProdotti() {
    return this._casaProdottiGrezzi().sort((a, b) => a.scadenza.localeCompare(b.scadenza));
  },

  _scriviCasaProdotti(lista) {
    try {
      localStorage.setItem(CASA_PRODOTTI_KEY, JSON.stringify(lista));
    } catch (e) {
      console.error('Errore scrittura fotografia casa', e);
    }
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

  // Aggiornamento ottimistico della cache (uguale in tutte le modalità,
  // così chi chiama aggiungi/aggiorna non deve mai aspettare la rete),
  // seguito dalla scrittura effettiva. In modalità locale/cloud scrive sempre
  // anche in localStorage (base di riserva se il dispositivo va offline prima
  // che Firestore confermi); in modalità casa scrive la copia di riserva nella
  // fotografia casa, non nei prodotti personali (che restano intatti per il
  // confronto "solo locali" e per il ritorno al personale).
  _salvaProdotto(prodotto) {
    prodotto.modificatoIl = new Date().toISOString();

    const idx = this._cache.findIndex(p => p.id === prodotto.id);
    if (idx === -1) this._cache.push(prodotto);
    else this._cache[idx] = prodotto;
    this._ordinaCache();
    this._notifica();

    if (this._modalita === 'casa') {
      this._scriviCasaProdotti(this._cache);
      if (typeof firebase !== 'undefined' && this._casaId) {
        this._collezioneCasaProdotti().doc(prodotto.id).set(prodotto)
          .catch(e => console.error('Errore salvataggio casa', e));
      }
      return;
    }

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

  // Carica i prodotti "solo locali" pendenti sulla destinazione giusta in base
  // al contesto: il cloud personale (utenti/{uid}/prodotti) oppure la casa
  // condivisa attiva (case/{casaId}/prodotti). Gli id restano gli stessi, così
  // alla riapertura non ricompaiono come "solo locali".
  confermaCaricamentoSoloLocali() {
    const pendenti = this._soloLocaliInAttesa || [];
    const contesto = this._contestoSoloLocali;
    this._soloLocaliInAttesa = null;
    this._contestoSoloLocali = null;
    if (pendenti.length === 0) return Promise.resolve();
    if (typeof firebase === 'undefined') return Promise.resolve();

    const db = firebase.firestore();
    let coll;
    if (contesto === 'casa' && this._casaId) {
      coll = this._collezioneCasaProdotti();
    } else if (this._modalita === 'cloud') {
      coll = this._collezioneCloud();
    } else {
      return Promise.resolve();
    }
    const batch = db.batch();
    pendenti.forEach(p => batch.set(coll.doc(p.id), p));
    return batch.commit();
  },

  rifiutaCaricamentoSoloLocali() {
    this._soloLocaliInAttesa = null;
    this._contestoSoloLocali = null;
  },

  // Terza opzione del prompt: rimuove definitivamente dallo storage locale i
  // prodotti "solo locali" pendenti. È sicuro cancellarli davvero: non sono
  // mai stati sincronizzati da nessuna parte, quindi non serve nessun
  // tombstone per propagare la cancellazione.
  eliminaSoloLocaliInAttesa() {
    const pendenti = this._soloLocaliInAttesa || [];
    this._soloLocaliInAttesa = null;
    this._contestoSoloLocali = null;
    if (pendenti.length === 0) return;
    const daRimuovere = new Set(pendenti.map(p => p.id));
    this._scriviLocale(this._prodottiLocaliGrezzi().filter(p => !daRimuovere.has(p.id)));
    // In modalità cloud/locale la cache contiene anche i solo-locali (vedi
    // calcolaMerge); in modalità casa no. Filtrare in ogni caso è corretto.
    this._cache = this._cache.filter(p => !daRimuovere.has(p.id));
    this._notifica();
  },

  /* =========================================================
     Casa condivisa (inventario di gruppo, max 5 membri)

     Struttura Firestore:
       case/{casaId}
         nome, creatoDa, creatoIl, codice,
         membri: { <uid>: { nome, email, entratoIl } },
         lineaConsumo: string|null
       case/{casaId}/prodotti/{prodId}    (stessa forma dei prodotti personali)
       codiciInvito/{codice}  →  { caseId }   (mapping per la join)

     Le regole di sicurezza Firestore vanno tenute allineate a
     mano (vedi firestore.rules nella root del repo).
     ========================================================= */

  inCasa() {
    return this._modalita === 'casa';
  },

  // Info per la UI account (nome, codice, lista membri, "N/5", linea consumo
  // condivisa). null se non si è in una casa; { caricamento: true } se si è in
  // una casa ma il primo snapshot del documento non è ancora arrivato.
  getCasaInfo() {
    if (this._modalita !== 'casa') return null;
    if (!this._casaDoc) return { caricamento: true };
    const utente = window.Auth ? Auth.utenteCorrente() : null;
    return {
      id: this._casaId,
      nome: this._casaDoc.nome || 'Casa condivisa',
      codice: this._casaDoc.codice || '',
      membri: this._casaDoc.membri || {},
      lineaConsumo: this._casaDoc.lineaConsumo || null,
      sonoCreatore: !!(utente && this._casaDoc.creatoDa === utente.uid)
    };
  },

  _docCasa() {
    return firebase.firestore().collection('case').doc(this._casaId);
  },

  _collezioneCasaProdotti() {
    return firebase.firestore().collection('case').doc(this._casaId).collection('prodotti');
  },

  _generaCodice() {
    let c = '';
    for (let i = 0; i < 6; i++) {
      c += ALFABETO_CODICE[Math.floor(Math.random() * ALFABETO_CODICE.length)];
    }
    return c;
  },

  // Genera un codice non ancora usato in codiciInvito. Le collisioni su 6
  // caratteri (~887M combinazioni) sono rarissime; qualche tentativo basta.
  _generaCodiceUnico(tentativiRimasti = 6) {
    const codice = this._generaCodice();
    return firebase.firestore().collection('codiciInvito').doc(codice).get()
      .then(snap => {
        if (!snap.exists) return codice;
        if (tentativiRimasti <= 1) throw new Error('Impossibile generare un codice, riprova');
        return this._generaCodiceUnico(tentativiRimasti - 1);
      });
  },

  // Valore associato alla propria uid nella mappa `membri`. `entratoIl` è un
  // server timestamp (non l'orologio del client): le regole lo validano come
  // `== request.time`, così nessuno può falsificare la propria anzianità per
  // ereditare `creatoDa` quando il creatore esce. `email` deve combaciare con
  // quella del token di autenticazione (niente impersonazione in lista membri).
  _membroSelf() {
    const utente = Auth.utenteCorrente();
    return {
      nome: (utente && utente.displayName) || '',
      email: (utente && utente.email) || '',
      entratoIl: firebase.firestore.FieldValue.serverTimestamp()
    };
  },

  // Crea una nuova casa condivisa con l'utente corrente come unico membro e
  // creatore. Scrive PRIMA il documento casa e POI il mapping codiciInvito:
  // le regole del mapping leggono creatoDa dal documento casa, che deve quindi
  // già esistere.
  creaCasa(nome) {
    const utente = window.Auth ? Auth.utenteCorrente() : null;
    if (!utente || typeof firebase === 'undefined') {
      return Promise.reject(new Error('Serve essere connessi a un account'));
    }
    const db = firebase.firestore();
    const casaRef = db.collection('case').doc();
    const nomePulito = (nome || '').trim() || 'Casa condivisa';
    let codice;

    return this._generaCodiceUnico()
      .then(c => {
        codice = c;
        return casaRef.set({
          nome: nomePulito,
          creatoDa: utente.uid,
          creatoIl: new Date().toISOString(),
          codice: codice,
          membri: { [utente.uid]: this._membroSelf() },
          lineaConsumo: null
        });
      })
      .then(() => db.collection('codiciInvito').doc(codice).set({ caseId: casaRef.id }))
      .then(() => {
        this._impostaCasaAttiva(casaRef.id);
        this._passaACasa(casaRef.id);
        return casaRef.id;
      });
  },

  // Entra in una casa esistente dato il codice invito. Reject con
  // { motivo: 'non-valido' | 'piena' | 'gia-dentro' }.
  entraInCasaConCodice(codiceRaw) {
    const utente = window.Auth ? Auth.utenteCorrente() : null;
    if (!utente || typeof firebase === 'undefined') {
      return Promise.reject(new Error('Serve essere connessi a un account'));
    }
    const codice = (codiceRaw || '').trim().toUpperCase();
    if (!codice) return Promise.reject({ motivo: 'non-valido' });

    const db = firebase.firestore();
    let casaId;

    return db.collection('codiciInvito').doc(codice).get()
      .then(snap => {
        if (!snap.exists) return Promise.reject({ motivo: 'non-valido' });
        casaId = snap.data().caseId;
        return db.collection('case').doc(casaId).get();
      })
      .then(casaSnap => {
        if (!casaSnap || !casaSnap.exists) return Promise.reject({ motivo: 'non-valido' });
        const membri = casaSnap.data().membri || {};
        if (membri[utente.uid]) return Promise.reject({ motivo: 'gia-dentro' });
        if (Object.keys(membri).length >= 5) return Promise.reject({ motivo: 'piena' });
        const patch = {};
        patch['membri.' + utente.uid] = this._membroSelf();
        return db.collection('case').doc(casaId).update(patch);
      })
      .then(() => {
        this._impostaCasaAttiva(casaId);
        this._passaACasa(casaId);
      });
  },

  // Abbandona la casa: la fotografia locale della casa viene comunque fusa
  // nello storage personale (i prodotti della casa vincono per id — vedi
  // _uscitaCasaLocale). Da qui in poi quei prodotti sono "personali" a tutti
  // gli effetti: se si è loggati, la normale riconciliazione li propone per il
  // caricamento sul cloud personale. "Scollegato" vale solo verso la casa: gli
  // altri membri non vedono più nulla di questo dispositivo.
  //
  // Tre casi lato server:
  //  - restano altri membri e NON ero il creatore → tolgo solo la mia uid;
  //  - restano altri membri ed ERO il creatore → tolgo la mia uid e passo
  //    `creatoDa` al membro più anziano (chi è entrato per primo), così il
  //    codice invito resta rigenerabile;
  //  - ero l'ultimo membro → pulizia completa (prodotti + documento casa +
  //    mapping codice invito), niente documenti orfani da tenere lì.
  abbandonaCasa() {
    const utente = window.Auth ? Auth.utenteCorrente() : null;
    const casaId = this._casaId;
    if (!casaId) return Promise.resolve();

    const membri = (this._casaDoc && this._casaDoc.membri) || {};
    const altri = Object.keys(membri).filter(u => !utente || u !== utente.uid);

    let p = Promise.resolve();
    if (utente && typeof firebase !== 'undefined') {
      if (altri.length === 0) {
        p = this._svuotaCasaCompletamente(casaId)
          .catch(e => console.error('Errore pulizia casa (si esce comunque in locale)', e));
      } else {
        const patch = {};
        patch['membri.' + utente.uid] = firebase.firestore.FieldValue.delete();
        if (this._casaDoc && this._casaDoc.creatoDa === utente.uid) {
          patch['creatoDa'] = this._membroPiuAnziano(membri, altri);
        }
        p = firebase.firestore().collection('case').doc(casaId).update(patch)
          .catch(e => console.error('Errore uscita casa (si esce comunque in locale)', e));
      }
    }
    return p.then(() => this._uscitaCasaLocale());
  },

  _membroPiuAnziano(membri, uidCandidati) {
    return uidCandidati.slice().sort((a, b) =>
      this._msEntrata(membri[a]) - this._msEntrata(membri[b])
    )[0];
  },

  // entratoIl può essere un Timestamp Firestore (nuovo formato) o, per dati
  // vecchi, una stringa ISO. Gestisce entrambi; valori assenti/illeggibili
  // contano come "entrato all'inizio dei tempi".
  _msEntrata(membro) {
    const e = membro && membro.entratoIl;
    if (!e) return 0;
    if (typeof e.toMillis === 'function') return e.toMillis();
    const t = new Date(e).getTime();
    return isNaN(t) ? 0 : t;
  },

  // Cancella tutto ciò che riguarda una casa rimasta senza membri: prima i
  // prodotti (finché sono ancora membro le regole me lo permettono), poi il
  // mapping del codice invito, poi il documento casa. Tutto in un batch: le
  // regole valutano ogni scrittura sullo stato PRECEDENTE al batch, quindi
  // l'ordine dentro il batch non conta, conta solo che il documento casa e la
  // mia membership esistano ancora (ed esistono, non ho ancora fatto l'update
  // di uscita). Limite Firestore: 500 scritture per batch — più che
  // sufficiente per un frigo.
  _svuotaCasaCompletamente(casaId) {
    const db = firebase.firestore();
    const casaRef = db.collection('case').doc(casaId);
    const codice = this._casaDoc && this._casaDoc.codice;
    return casaRef.collection('prodotti').get().then(snap => {
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      if (codice) batch.delete(db.collection('codiciInvito').doc(codice));
      batch.delete(casaRef);
      return batch.commit();
    });
  },

  // Solo il creatore. batch: elimina il vecchio mapping, ne crea uno nuovo,
  // aggiorna case.codice. Il vecchio codice smette subito di far entrare
  // nuovi membri; quelli già dentro restano.
  rigeneraCodiceCasa() {
    const utente = window.Auth ? Auth.utenteCorrente() : null;
    if (!utente || typeof firebase === 'undefined' || !this._casaId) {
      return Promise.reject(new Error('Operazione non disponibile'));
    }
    if (!this._casaDoc || this._casaDoc.creatoDa !== utente.uid) {
      return Promise.reject(new Error('Solo chi ha creato la casa può rigenerare il codice'));
    }
    const db = firebase.firestore();
    const vecchio = this._casaDoc.codice;
    return this._generaCodiceUnico().then(nuovo => {
      const batch = db.batch();
      if (vecchio) batch.delete(db.collection('codiciInvito').doc(vecchio));
      batch.set(db.collection('codiciInvito').doc(nuovo), { caseId: this._casaId });
      batch.update(db.collection('case').doc(this._casaId), { codice: nuovo });
      return batch.commit().then(() => nuovo);
    });
  },

  // Linea di consumo condivisa a livello di casa (punto 10): quando si è in una
  // casa la linea non è più un promemoria di dispositivo ma un dato della casa,
  // uguale per tutti i membri e aggiornato in tempo reale.
  setLineaConsumoCasa(dataISO) {
    if (typeof firebase === 'undefined' || !this._casaId) {
      return Promise.reject(new Error('Non sei in una casa condivisa'));
    }
    return this._docCasa().update({ lineaConsumo: dataISO || null });
  },

  _impostaCasaAttiva(casaId) {
    try {
      localStorage.setItem(CASA_ATTIVA_KEY, casaId);
    } catch (e) {
      console.error('Errore salvataggio casa attiva', e);
    }
  },

  _passaACasa(casaId) {
    this._modalita = 'casa';
    this._casaId = casaId;
    const utente = window.Auth ? Auth.utenteCorrente() : null;
    if (utente) this._uid = utente.uid;
    this._staccaListenerCloud();
    this._staccaListenerCasa();

    if (typeof firebase === 'undefined') {
      // Offline / Firebase non disponibile: si resta sulla fotografia locale
      // della casa. I listener si attaccheranno quando Firebase torna e
      // Auth.onChange richiama questo metodo.
      this._cache = this._leggiCasaProdotti();
      this._notifica();
      return;
    }

    const db = firebase.firestore();

    // Listener 1: documento casa (nome, codice, membri, linea consumo).
    this._unsubscribeCasaDoc = db.collection('case').doc(casaId).onSnapshot((snap) => {
      if (!snap.exists) {
        this._casaDoc = null;
        this._notificaCasa();
        return;
      }
      this._casaDoc = snap.data();
      this._notificaCasa();
    }, (e) => {
      console.error('Errore sync documento casa', e);
      // permission-denied: non si è (più) membri di questa casa → uscita pulita.
      if (e && e.code === 'permission-denied') this._uscitaCasaLocale();
    });

    // Listener 2: prodotti della casa. La casa è autoritativa: si sostituisce
    // la cache direttamente. Solo il primo snapshot controlla se ci sono
    // prodotti personali in più da proporre (prompt a 3 opzioni).
    let primoSnapshot = true;
    this._unsubscribeCasaProdotti = db.collection('case').doc(casaId).collection('prodotti')
      .onSnapshot((snapshot) => {
        const daCasa = snapshot.docs.map(d => d.data());
        this._cache = daCasa;
        this._ordinaCache();
        this._scriviCasaProdotti(daCasa);
        this._notifica();
        if (primoSnapshot) {
          primoSnapshot = false;
          this._verificaSoloLocaliCasa(daCasa);
        }
      }, (e) => console.error('Errore sync prodotti casa', e));
  },

  _verificaSoloLocaliCasa(daCasa) {
    const soloLocali = calcolaSoloLocali(this._prodottiLocaliGrezzi(), daCasa);
    if (soloLocali.length === 0) return;
    this._soloLocaliInAttesa = soloLocali;
    this._contestoSoloLocali = 'casa';
    this._listenersSoloLocali.forEach(cb => cb(soloLocali, 'casa'));
  },

  _uscitaCasaLocale() {
    // Fonde la fotografia della casa nello storage personale prima di
    // cancellarla: i prodotti della casa vincono sui locali con lo stesso id.
    const casaProdotti = this._casaProdottiGrezzi();
    if (casaProdotti.length > 0) {
      const mappa = new Map(this._prodottiLocaliGrezzi().map(p => [p.id, p]));
      casaProdotti.forEach(p => mappa.set(p.id, p));
      this._scriviLocale(Array.from(mappa.values()));
    }

    try {
      localStorage.removeItem(CASA_ATTIVA_KEY);
      localStorage.removeItem(CASA_PRODOTTI_KEY);
    } catch (e) { /* ignora */ }

    this._staccaListenerCasa();
    this._casaId = null;
    this._casaDoc = null;
    this._soloLocaliInAttesa = null;
    this._contestoSoloLocali = null;

    const utente = window.Auth ? Auth.utenteCorrente() : null;
    if (utente) this._passaACloud(utente.uid);
    else this._passaALocale();
    this._notificaCasa();
  }
};
