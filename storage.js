/* =========================================================
   Storage — salvataggio locale (localStorage)
   In futuro questo file verrà sostituito/esteso per Firebase,
   mantenendo le stesse funzioni esposte così il resto
   dell'app non deve cambiare.
   ========================================================= */

const STORAGE_KEY = 'frigo_tracker_prodotti_v1';

const Storage = {

  _leggiTutti() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Errore lettura storage', e);
      return [];
    }
  },

  _scriviTutti(lista) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
  },

  getTutti() {
    return this._leggiTutti().sort((a, b) => a.scadenza.localeCompare(b.scadenza));
  },

  getAttivi() {
    return this.getTutti().filter(p => p.stato === 'attivo');
  },

  getById(id) {
    return this._leggiTutti().find(p => p.id === id) || null;
  },

  aggiungi(prodotto) {
    const lista = this._leggiTutti();
    const nuovo = {
      id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      nome: prodotto.nome,
      scadenza: prodotto.scadenza,       // YYYY-MM-DD
      acquisto: prodotto.acquisto || new Date().toISOString().slice(0, 10),
      motivo: prodotto.motivo || '',
      note: prodotto.note || '',
      stato: 'attivo'                     // attivo | consumato | eliminato
    };
    lista.push(nuovo);
    this._scriviTutti(lista);
    return nuovo;
  },

  aggiungiMassivo(prodotti) {
    return prodotti.map(p => this.aggiungi(p));
  },

  aggiorna(id, cambi) {
    const lista = this._leggiTutti();
    const idx = lista.findIndex(p => p.id === id);
    if (idx === -1) return null;
    lista[idx] = { ...lista[idx], ...cambi };
    this._scriviTutti(lista);
    return lista[idx];
  },

  segnaStato(id, stato) {
    return this.aggiorna(id, { stato });
  },

  elimina(id) {
    const lista = this._leggiTutti().filter(p => p.id !== id);
    this._scriviTutti(lista);
  }
};
