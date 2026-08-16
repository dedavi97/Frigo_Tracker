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
8. Aggiunta prodotti anche tramite testo scritto, non solo a voce (icona aggiuntiva accanto al microfono, stesso flusso di revisione/parsing già esistente)

## Funzionalità pianificate (decise con l'utente, non ancora implementate)
Da implementare **nell'ordine seguente**: la Feature "Sync robusta" è la più delicata (rischio di conflitti/perdita dati) e va fatta e testata da sola prima di aggiungere le altre tre nella stessa sessione, per non confondere eventuali bug di sync con bug di funzionalità nuove.

1. **Sync robusta Firebase↔locale** (estende quanto già implementato in `js/storage.js`): confronto solo all'apertura app/login, non periodico. Conflitto sullo stesso prodotto: campo "ultima modifica" su ogni prodotto, vince automaticamente il più recente senza chiedere conferma. Prodotto solo su Firebase → scaricato in automatico. Prodotto solo in locale → chiede conferma (unica, in blocco per tutti i prodotti "solo locali" insieme, non uno per uno). Cancellazioni: mai silenziose, serve un record leggero di cancellazione (tombstone: solo ID + data) così la sync distingue "cancellato, propaga la cancellazione" da "nuovo, scarica"; tombstone tenuti 30 giorni (a differenza dello storico visibile sotto, che dura solo 24 ore — non confondere le due scadenze).
2. **Storico eliminati/consumati con ripristino**: lista unica (non due separate), stato distinguibile a colpo d'occhio per riga. Ripristino riporta a "attivo" senza gestioni speciali (anche se la scadenza è nel frattempo passata). Visibile per 24 ore dal cambio stato, poi sparisce dalla vista (ma il tombstone della Feature 1 resta più a lungo, sono due cose diverse).
3. **Prodotto "aperto"**: azione "Segna come aperto" nel dettaglio, con durata-dopo-apertura inserita manualmente dall'utente (niente default automatici per categoria). Da quel momento la scadenza "attiva" (colore, ordinamento, home) diventa data-apertura + durata; la scadenza originale resta salvata ma non è più quella mostrata. L'anello colorato ricalibra la sua scala sulla nuova finestra invece dei 14 giorni fissi usati oggi in `creaAnello()` (`js/app.js`), così un prodotto aperto con 2 giorni di vita non sembra sempre "quasi finito" sulla stessa scala di uno mai aperto.
4. **Pagina aiuto/about**: icona "?" in home accanto al microfono. Contenuto: cos'è l'app, come si usa (esempio frase vocale, campo motivo, "segna come aperto"), legenda colori anello, elenco funzioni della versione corrente, numero versione (`APP_VERSION`).

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

Account/sync (`js/auth.js`, `js/firebase-config.js`, esteso in `js/storage.js`): login con Google via Firebase Auth (SDK caricati da CDN in `index.html`, versione "compat", nessun build step), progetto Firebase reale "frigo-tracker" già configurato in `js/firebase-config.js`. Login fatto con `signInWithPopup` (non `signInWithRedirect`): il redirect apriva/chiudeva la pagina passando per il dominio di Firebase e su `localhost`/http si inceppava spesso per via delle restrizioni dei browser moderni sullo scambio dati tra domini diversi — il popup resta sulla stessa pagina ed è più affidabile, sia in locale sia in produzione. `Storage` mantiene la stessa interfaccia pubblica usata da `app.js` (`getAttivi`, `aggiungi`, `aggiorna`, `elimina`, ecc.) sia in modalità locale (localStorage) sia in modalità cloud (Firestore, collezione `utenti/{uid}/prodotti`), tramite una cache in memoria aggiornata via `Storage.onChange`. Se Firebase non è raggiungibile l'app degrada in automatico alla modalità locale (vedi decisione #6). Le regole di sicurezza Firestore in uso: solo `request.auth.uid == uid` può leggere/scrivere la propria collezione `utenti/{uid}/prodotti`.
