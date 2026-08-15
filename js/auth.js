/* =========================================================
   Auth — wrapper minimo su Firebase Authentication (Google).

   Espone lo stato di login corrente e un solo punto di
   iscrizione (Auth.onChange) usato da storage.js per sapere
   quando passare da modalità locale a modalità cloud.

   Login opzionale: se non configurato o se l'utente non accede,
   il resto dell'app deve continuare a funzionare solo in locale.
   ========================================================= */

const Auth = {
  _utente: null,
  _listeners: [],

  init() {
    if (typeof firebase === 'undefined') {
      // Script Firebase non disponibili (es. CDN irraggiungibile offline):
      // l'app deve continuare a funzionare in locale, senza login.
      console.error('Firebase non disponibile, si continua in modalità locale');
      return;
    }
    firebase.initializeApp(FIREBASE_CONFIG);
    firebase.auth().onAuthStateChanged((utente) => {
      this._utente = utente;
      this._listeners.forEach(cb => cb(utente));
    });
  },

  utenteCorrente() {
    return this._utente;
  },

  onChange(cb) {
    this._listeners.push(cb);
  },

  accediConGoogle() {
    if (typeof firebase === 'undefined') {
      return Promise.reject(new Error('Firebase non disponibile, impossibile accedere ora'));
    }
    // Popup invece di redirect: il login avviene in una finestra sopra la
    // pagina, senza mai lasciarla. Il redirect (che porta il browser fuori
    // dal sito e lo riporta indietro) su domini non-https come "localhost"
    // spesso si inceppa per via delle restrizioni dei browser moderni sullo
    // scambio di dati tra il dominio del sito e quello di autenticazione.
    const provider = new firebase.auth.GoogleAuthProvider();
    return firebase.auth().signInWithPopup(provider);
  },

  esci() {
    if (typeof firebase === 'undefined') return Promise.resolve();
    return firebase.auth().signOut();
  }
};

window.Auth = Auth;
