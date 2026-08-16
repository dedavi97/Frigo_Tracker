# Contesto progetto: Frigo Tracker

## Cos'è
PWA (Progressive Web App, sito installabile come app) per tracciare le scadenze di frigo/dispensa tramite comando vocale. Nessuna AI nell'uso quotidiano: il parsing del testo dettato è basato su regole/regex scritte a mano (vedi `js/speech.js`), sempre seguito da un passaggio di conferma/correzione manuale dell'utente prima del salvataggio.

## Stack
Vanilla JavaScript, HTML, CSS. Nessun framework, nessun build step. Web Speech API per il riconoscimento vocale (lingua it-IT).

## Stato attuale
Dati salvati in localStorage di default; login opzionale con Google che attiva sync multi-dispositivo via Firestore (vedi Note tecniche). Un solo contenitore generico (no distinzione frigo/dispensa/freezer). Notifiche solo visive (anello colorato in lista), nessuna notifica push reale.

## Decisioni di design prese con l'utente
1. PWA scelta al posto di app nativa: sviluppo più rapido, un solo codice per telefono e PC, iterazione più semplice
2. Sviluppo incrementale: Firebase e sync multi-dispositivo volutamente lasciati fuori dalla V1 iniziale, aggiunti solo dopo aver validato voce/lista/parsing con uso reale
3. Motivo di acquisto (es. "yogurt comprato per la torta") è un campo di prima classe, dettato a voce insieme a prodotto e data
4. Il parsing vocale non userà mai AI per restare "semplice e trasparente": è accettato un margine di errore compensato dal passaggio di revisione manuale
5. Nessuna eliminazione diretta senza conferma (principio già applicato in altri tool dell'utente, tipo Media_Dedup); per lo stesso motivo, al primo login con dati già presenti in locale si chiede se caricarli online invece di deciderlo in automatico, e comunque restano anche in locale
6. Login con Google sempre opzionale: l'app deve continuare a funzionare solo in locale anche senza account, e degradare in locale se Firebase non è raggiungibile

## Backlog concordato (in ordine di probabile priorità)
1. Notifiche push reali (anche ad app chiusa) — l'account/sync di base è già stato implementato, questo pezzo era stato scorporato ed è rimasto a parte
2. Luoghi configurabili (frigo, dispensa, freezer, altro), oggi fissi a un contenitore unico
3. Analytics (prodotti più comprati, frequenza scadenze)
4. Inventario live entrata/uscita (richiede che l'utente tracci anche i consumi, non solo gli acquisti; complessità riconosciuta e discussa, da validare solo dopo uso reale della V1)
5. Integrazione Google Calendar (sync bidirezionale)
6. Notifiche configurabili (giorni prima dell'avviso, oggi fissi a 7 e 2 giorni come riferimento visivo)
7. Interfaccia dedicata per PC e per telefono, con passaggio automatico in base al dispositivo (oggi c'è un solo layout responsive, vedi `css/style.css`)

## Convenzioni utente (valide per tutti i suoi progetti)
1. Nomi progetti: PascalCase con underscore (es. Frigo_Tracker)
2. Tema scuro moderno sempre, priorità a UI/UX curata
3. Se l'app va avviata da CMD, includere un file .bat di avvio
4. Discutere sempre i punti aperti e ottenere conferma esplicita prima di generare codice/file (non applicabile a piccole modifiche incrementali già concordate)
5. Repo GitHub personali sotto l'account dedavi97
6. Spiegazioni tecniche sempre in linguaggio semplice, con esempi incrementali (l'utente non è uno sviluppatore)

## Note tecniche specifiche
Il parser (`js/speech.js`, funzione `parseTranscript`) si aspetta frasi nel formato: `<prodotto> <giorno> <mese> [per <motivo>]`, con più prodotti separati dicendo "poi"/"e poi"/"poi anche"/"quindi"/"e quindi"/"virgola"/"inoltre" (lista in `SEPARATORI`). Senza questi separatori il parser non riesce ad affidabile distinguere dove finisce il motivo e inizia il prodotto successivo: è una limitazione nota e accettata (vedi discussione con l'utente), non un bug da correggere silenziosamente. Ampliare questa lista è un intervento a basso rischio già validato con l'utente; usare la pausa tra le frasi come separatore automatico è stato invece scartato per ora (più naturale da dire ma comportamento meno prevedibile, da rivalutare solo dopo altro uso reale).

Versione app in `js/version.js` (costante `APP_VERSION`, mostrata in fondo alla pagina): va incrementata ad ogni push. Il service worker (`service-worker.js`) usa questo numero nel nome della cache, quindi alzarlo è anche ciò che forza i dispositivi già installati a scaricare la versione nuova invece di restare bloccati su una cache vecchia.

Storico eliminati/consumati (`js/storage.js`, `js/app.js`): `Storage.elimina(id)` non cancella più il prodotto per davvero, cambia solo `stato` a `'eliminato'` (soft-delete) tramite `segnaStato`, che aggiorna anche il campo `cambiatoIl` (timestamp). `Storage.getStorico()` restituisce i prodotti con `stato !== 'attivo'` cambiati nelle ultime 24 ore; `Storage.ripristina(id)` li rimette `attivo`. In home, il filtro "Storico" (`renderStorico()` in `app.js`) mostra questi prodotti con un badge di stato al posto dell'anello di scadenza; dal dettaglio, i pulsanti mostrati cambiano in base allo stato (`btn-ripristina` solo se non attivo).

Prodotto "aperto" (`js/app.js`, campi `aperto`/`dataApertura`/`durataApertoGiorni` sul prodotto): la funzione `scadenzaAttiva(p)` calcola la scadenza da mostrare/ordinare/colorare (data-apertura + durata se aperto, altrimenti la scadenza originale invariata). `creaAnello()` accetta ora una scala in giorni (default 14, uguale a `durataApertoGiorni` per i prodotti aperti) invece del valore fisso di prima.

Attenzione con le date "di oggi": usare sempre `oggiISO()`/`dataLocaleISO()` (`js/storage.js`, esposte globalmente), mai `new Date().toISOString().slice(0,10)`. `toISOString()` è in UTC: vicino alla mezzanotte, in fusi orari avanti rispetto a UTC (Italia inclusa), restituisce la data di ieri invece di oggi. Bug reale trovato e corretto durante l'implementazione del prodotto "aperto" (c'era sia nel calcolo di `scadenzaAttiva` sia nella data di acquisto di default).

Manca la cartella `icons/` (referenziata da `index.html` e `manifest.json` per l'icona PWA): 404 innocuo, non blocca l'uso del sito ma impedisce l'installazione con icona propria. Non ancora prioritizzato dall'utente.

Account/sync (`js/auth.js`, `js/firebase-config.js`, esteso in `js/storage.js`): login con Google via Firebase Auth (SDK caricati da CDN in `index.html`, versione "compat", nessun build step), progetto Firebase reale "frigo-tracker" già configurato in `js/firebase-config.js`. Login fatto con `signInWithPopup` (non `signInWithRedirect`): il redirect apriva/chiudeva la pagina passando per il dominio di Firebase e su `localhost`/http si inceppava spesso per via delle restrizioni dei browser moderni sullo scambio dati tra domini diversi — il popup resta sulla stessa pagina ed è più affidabile, sia in locale sia in produzione. `Storage` mantiene la stessa interfaccia pubblica usata da `app.js` (`getAttivi`, `aggiungi`, `aggiorna`, `elimina`, ecc.) sia in modalità locale (localStorage) sia in modalità cloud (Firestore, collezione `utenti/{uid}/prodotti`), tramite una cache in memoria aggiornata via `Storage.onChange`. Se Firebase non è raggiungibile l'app degrada in automatico alla modalità locale (vedi decisione #6). Le regole di sicurezza Firestore in uso: solo `request.auth.uid == uid` può leggere/scrivere la propria collezione `utenti/{uid}/prodotti`.

Sync robusta (`js/storage.js`): al passaggio a modalità cloud, il **primo** snapshot Firestore non sostituisce la cache come farebbero i successivi (aggiornamenti realtime durante la sessione), ma passa da `_riconciliaConCloud()`, che confronta con quanto già in `localStorage` usando la funzione pura `calcolaMerge()` (nessun accesso a Firestore/localStorage al suo interno, quindi testabile passandole array fabbricati, senza bisogno di credenziali Firebase reali). Regole: prodotto solo su Firebase → scaricato subito; prodotto in entrambi → vince chi ha `modificatoIl` più recente (campo aggiornato ad ogni salvataggio in `_salvaProdotto`, distinto da `cambiatoIl` che serve solo allo storico); prodotto solo in locale → resta subito visibile/usabile ma non viene inviato a Firestore finché l'utente non conferma in blocco (`Storage.onDatiSoloLocali`/`confermaCaricamentoSoloLocali`/`rifiutaCaricamentoSoloLocali`, riusa l'overlay `#view-migrazione`). Questo prompt si ripresenta ad ogni apertura finché non viene confermato, senza memoria di un eventuale rifiuto precedente (scelta deliberata: meglio ridomandare che perdere di vista dati non sincronizzati). Il vecchio meccanismo di migrazione una-tantum (`MIGRAZIONE_CHIESTA_KEY`, `Storage.haDatiLocaliDaMigrare`/`migraDatiLocaliSuCloud`) è stato rimosso, superato da questo. `_salvaProdotto()` scrive sempre anche in `localStorage`, pure in modalità cloud, come base di riserva se il dispositivo va offline prima che Firestore confermi. Non implementato: gestione tombstone per cancellazioni definitive (non serve finché nulla viene mai espulso per davvero dallo storage, vedi nota sullo storico) e transazioni Firestore per conflitti da scritture simultanee su più dispositivi (rischio accettato, coerente con la filosofia del progetto).
