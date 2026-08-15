# Frigo Tracker

App web (PWA) per tenere traccia delle scadenze di frigo e dispensa tramite comando vocale, senza intelligenza artificiale nell'uso quotidiano.

## Come funziona

1. Apri l'app (da telefono o PC, tramite browser)
2. Tocca l'icona del microfono
3. Elenca a voce cosa hai comprato, nel formato:
   `<prodotto> <giorno> <mese> [per <motivo>]`, separando più prodotti con "poi"

   Esempio:
   > "yogurt diciotto marzo per la torta, poi salmone ventuno luglio"

4. L'app trascrive e riconosce i prodotti, mostrandoli in una lista da controllare
5. Correggi eventuali errori di riconoscimento direttamente nei campi
6. Tocca "Salva tutto"

I prodotti compaiono in home ordinati per scadenza, con un anello colorato che indica quanto manca (verde: tranquillo, ambra: entro 7 giorni, rosso: entro 2 giorni o scaduto).

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
3. Il parsing vocale è basato su regole, non su AI: può sbagliare con frasi complesse, per questo c'è sempre un passaggio di controllo prima di salvare
4. L'aggiunta prodotti è possibile solo a voce, non ancora tramite testo scritto

## Backlog (prossime iterazioni)

1. Notifiche push vere (anche ad app chiusa)
2. Luoghi configurabili (frigo, dispensa, freezer, altro)
3. Analytics: cosa si compra più spesso, cosa scade più spesso
4. Inventario live (tracciamento anche di ciò che esce, non solo entra)
5. Integrazione Google Calendar
6. Notifiche configurabili (quanti giorni prima avvisare)
7. Interfaccia dedicata per PC e per telefono, con passaggio automatico in base al dispositivo
8. Aggiunta prodotti anche tramite testo scritto, non solo a voce (icona aggiuntiva accanto al microfono)

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
