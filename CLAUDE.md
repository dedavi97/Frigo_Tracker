# Contesto progetto: Frigo Tracker

## Cos'è
PWA (Progressive Web App, sito installabile come app) per tracciare le scadenze di frigo/dispensa tramite comando vocale. Nessuna AI nell'uso quotidiano: il parsing del testo dettato è basato su regole/regex scritte a mano (vedi `js/speech.js`), sempre seguito da un passaggio di conferma/correzione manuale dell'utente prima del salvataggio.

## Stack
Vanilla JavaScript, HTML, CSS. Nessun framework, nessun build step. Web Speech API per il riconoscimento vocale (lingua it-IT).

## Stato attuale (V1)
Dati salvati in localStorage, nessun account, nessuna sync tra dispositivi. Un solo contenitore generico (no distinzione frigo/dispensa/freezer). Notifiche solo visive (anello colorato in lista), nessuna notifica push.

## Decisioni di design prese con l'utente
1. PWA scelta al posto di app nativa: sviluppo più rapido, un solo codice per telefono e PC, iterazione più semplice
2. Sviluppo incrementale: Firebase e sync multi-dispositivo volutamente in backlog, non nella V1
3. Motivo di acquisto (es. "yogurt comprato per la torta") è un campo di prima classe, dettato a voce insieme a prodotto e data
4. Il parsing vocale non userà mai AI per restare "semplice e trasparente": è accettato un margine di errore compensato dal passaggio di revisione manuale
5. Nessuna eliminazione diretta senza conferma (principio già applicato in altri tool dell'utente, tipo Media_Dedup)

## Backlog concordato (in ordine di probabile priorità)
1. Firebase: account leggero + sync multi dispositivo + notifiche push reali
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
Il parser (`js/speech.js`, funzione `parseTranscript`) si aspetta frasi nel formato: `<prodotto> <giorno> <mese> [per <motivo>]`, con più prodotti separati dicendo "poi"/"quindi"/"virgola". Senza questi separatori il parser non riesce ad affidabile distinguere dove finisce il motivo e inizia il prodotto successivo: è una limitazione nota e accettata (vedi discussione con l'utente), non un bug da correggere silenziosamente.
