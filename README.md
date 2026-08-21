# Frigo Tracker

App web (PWA) per tenere traccia delle scadenze di frigo e dispensa tramite comando vocale, senza intelligenza artificiale nell'uso quotidiano.

## Come funziona

1. Apri l'app (da telefono o PC, tramite browser)
2. Tocca il pulsante "+" in basso, poi la scheda Vocale (predefinita) o Testo
3. Elenca cosa hai comprato, nel formato:
   `<prodotto> <giorno> <mese> [per <motivo>]`, separando più prodotti con "poi"/"e poi"/"quindi"/una virgola

   Esempio:
   > "yogurt diciotto marzo per la torta, poi salmone ventuno luglio"

4. L'app riconosce i prodotti (dalla voce o dal testo) e li mostra in una lista da controllare
5. Correggi eventuali errori direttamente nei campi, o tocca di nuovo il microfono/scrivi ancora per aggiungerne altri
6. Tocca "Salva tutto"

I prodotti compaiono in home ordinati per scadenza, con un anello colorato che indica quanto manca (verde: tranquillo, ambra: entro 7 giorni, rosso: entro 2 giorni o scaduto). Se un prodotto dura meno una volta aperto, "Segna come aperto" nel dettaglio fa ricalcolare la scadenza mostrata sulla durata che indichi tu, invece di quella stampata sulla confezione.

Per prodotti senza una data stampata (es. verdura fresca), invece della data di' una durata approssimativa: "verdura tra una settimana". Compare comunque con l'anello colorato come gli altri, con un'etichetta "Stima" a ricordarti che la data è approssimativa.

Eliminare o consumare un prodotto non lo cancella per sempre: resta nel filtro "Storico" per 24 ore, con un tasto per ripristinarlo in caso di errore.

Nel dettaglio di un prodotto "aperto" o a scadenza stimata trovi un tasto "+7 giorni" per allungare la scadenza senza dover rifare i calcoli a mano. Per i prodotti "aperto" vedi anche da quanti giorni sono aperti (informazione discreta, solo nel dettaglio). Dalla schermata di aggiunta prodotto (pulsante "+" in basso) puoi impostare una "linea di consumo": una data oltre la quale, in home, compare una riga che separa cosa consumare con priorità (es. prima di partire per un viaggio) da tutto il resto — solo un promemoria visivo, non cambia colori o urgenza.

## Account e sincronizzazione (opzionale)

Tocca l'icona account nell'header per accedere con Google. Da loggato, i prodotti si sincronizzano automaticamente tra tutti i dispositivi collegati allo stesso account (via Firestore). Il login è facoltativo: senza accedere, l'app funziona esattamente come in locale, salvando solo nel browser corrente. Se hai già dati salvati in locale, al primo accesso viene chiesto se caricarli online (restano comunque anche in locale).

## Avvio in locale (Windows)

Doppio click su `run.bat`. Si apre un piccolo server locale e il browser su `http://localhost:8420`.
Serve Python installato (già presente su molte configurazioni Windows moderne, altrimenti scaricabile da python.org).

## Requisiti browser

Il riconoscimento vocale usa la Web Speech API. Funziona bene su Chrome (Android e desktop). Su iPhone/Safari il supporto è più limitato.

## Stato del progetto

Salvataggio dati: locale nel browser (localStorage) di default; con login Google opzionale, sync automatica multi-dispositivo (Firestore).

Limitazioni note:
1. Un solo contenitore generico (nessuna distinzione frigo/dispensa/freezer)
2. Notifiche solo visive nell'app (nessuna notifica push reale, anche ad app chiusa)
3. Il parsing è basato su regole, non su AI: può sbagliare con frasi complesse, per questo c'è sempre un passaggio di controllo prima di salvare

## Backlog (prossime iterazioni)

1. Interfaccia dedicata per PC e per telefono, con passaggio automatico in base al dispositivo
2. Notifiche push vere (anche ad app chiusa)
3. Luoghi configurabili (frigo, dispensa, freezer, altro)
4. Analytics: cosa si compra più spesso, cosa scade più spesso
5. Inventario live (tracciamento anche di ciò che esce, non solo entra)
6. Integrazione Google Calendar
7. Notifiche configurabili (quanti giorni prima avvisare)

## Struttura del progetto

```
Frigo_Tracker/
  index.html                pagina principale
  css/style.css              stile (tema scuro)
  js/storage.js               salvataggio dati (localStorage o Firestore)
  js/speech.js                 riconoscimento vocale + parsing italiano
  js/auth.js                    login Google (Firebase Authentication)
  js/firebase-config.js          configurazione progetto Firebase
  js/version.js                   numero di versione app
  js/app.js                        logica interfaccia
  manifest.json                    configurazione PWA
  service-worker.js                funzionamento offline base
  icons/                            icone dell'app
  run.bat                            avvio rapido da Windows
```

## Changelog

- **v2.0.1** — Aggiunta l'icona dell'app (`icons/icon-192.png`, `icons/icon-512.png`): frigo a contorno neon verde con una foglia, prima mancante (installazione PWA senza icona propria).
- **v2.0.0** — Restyle grafico: font Baloo 2 + Nunito, palette più satura, header senza pulsanti microfono/testo/pillola account (sostituiti da un avatar account e da un pulsante "+" flottante in basso, unico punto di ingresso per aggiungere un prodotto). Corretto un bug di layout presente da sempre su desktop (header e lista non si impilavano correttamente).
- **v1.5.6** — Pagina aiuto e changelog allineati alle funzionalità delle versioni precedenti (+7 giorni, età apertura, redesign a schede), mancavano dai testi.
- **v1.5.5** — Schermata di aggiunta prodotto riorganizzata a schede (Vocale/Testo/Linea consumo, un pannello alla volta) invece di tutto impilato: meno affollata, la lista di revisione si vede meglio.
- **v1.5.4** — La linea di consumo si imposta ora dalla schermata di aggiunta prodotto invece che dalla pagina aiuto.
- **v1.5.3** — Tasto "+7 giorni" per prodotti "aperto" e a scadenza stimata (allunga la scadenza senza ricalcolare a mano). Riga discreta "Aperto da N giorni" nel dettaglio. Nuova "linea di consumo": data impostabile dalla pagina aiuto, separa in home cosa consumare con priorità da tutto il resto (solo visivo).
- **v1.5.2** — Prodotti senza data stampata (es. verdura): scadenza stimata dicendo "tra N giorni/settimane" invece di una data esatta, riconosciuta anche a voce/testo.
- **v1.5.1** — "Segna come aperto" precompila 7 giorni di default. Il prompt di sincronizzazione mostra i prodotti trovati solo in locale invece di chiedere conferma alla cieca.
- **v1.5.0** — Sync robusta tra Firestore e dati locali: al login non si perdono più prodotti aggiunti offline o su un dispositivo non ancora sincronizzato; conflitti risolti automaticamente in base a chi ha la modifica più recente.
- **v1.4.0** — Prodotto "aperto": indichi quanti giorni dura una volta aperto, la scadenza mostrata (colore, ordinamento) si aggiorna di conseguenza, quella originale resta comunque salvata.
- **v1.3.0** — Storico di prodotti eliminati/consumati, con possibilità di ripristino entro 24 ore.
- **v1.2.0** — Pagina aiuto in app (icona "?"); aggiunta prodotti anche scrivendo, non solo a voce.
- **v1.1.4** — Toccare di nuovo il microfono con una lista già riconosciuta ora aggiunge invece di sostituire; aggiunto un tasto "Cancella tutto"; risolti blocchi occasionali del microfono dopo pause lunghe.
- **v1.1.3** — Il parser riconosce "primo" del mese (non solo "uno"); non lascia più articoli (il/lo/la/i/gli/le) attaccati al nome del prodotto.
- **v1.1.2** — Messaggio d'errore di login più chiaro in caso di problemi.
- **v1.1.1** — Login opzionale con Google e sincronizzazione multi-dispositivo (Firestore); dati locali esistenti migrabili al primo accesso.
- **v1.0.5** — Più modi naturali per separare i prodotti a voce ("e poi", "poi anche", "e quindi", oltre a "poi"/"quindi"/virgola).
- **v1.0.4** — Risolto un bug che duplicava a valanga il testo dettato su Android (bug noto dell'ascolto continuo del browser).
- **v1.0.3** — Risolto un bug che bloccava gli aggiornamenti sui dispositivi già installati (cache del service worker rimasta vecchia); aggiunto il numero di versione visibile in fondo alla pagina.
- **Prime versioni** — Risolti i percorsi CSS/JS rotti (il sito appariva senza stile e il microfono non rispondeva) e una prima duplicazione del testo dettato.
