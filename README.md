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

## Avvio in locale (Windows)

Doppio click su `run.bat`. Si apre un piccolo server locale e il browser su `http://localhost:8420`.
Serve Python installato (già presente su molte configurazioni Windows moderne, altrimenti scaricabile da python.org).

## Requisiti browser

Il riconoscimento vocale usa la Web Speech API. Funziona bene su Chrome (Android e desktop). Su iPhone/Safari il supporto è più limitato.

## Stato del progetto (V1)

Salvataggio dati: locale nel browser (localStorage), nessun account, nessuna sync tra dispositivi.

Limitazioni note della V1:
1. Un solo contenitore generico (nessuna distinzione frigo/dispensa/freezer)
2. Notifiche solo visive nell'app (nessuna notifica push)
3. Nessuna sync tra telefono e PC (i dati restano sul dispositivo/browser dove li inserisci)
4. Il parsing vocale è basato su regole, non su AI: può sbagliare con frasi complesse, per questo c'è sempre un passaggio di controllo prima di salvare

## Backlog (prossime iterazioni)

1. Firebase: account leggero, sync multi dispositivo, notifiche push vere
2. Luoghi configurabili (frigo, dispensa, freezer, altro)
3. Analytics: cosa si compra più spesso, cosa scade più spesso
4. Inventario live (tracciamento anche di ciò che esce, non solo entra)
5. Integrazione Google Calendar
6. Notifiche configurabili (quanti giorni prima avvisare)

## Struttura del progetto

```
Frigo_Tracker/
  index.html          pagina principale
  css/style.css        stile (tema scuro)
  js/storage.js         salvataggio dati (localStorage)
  js/speech.js           riconoscimento vocale + parsing italiano
  js/app.js               logica interfaccia
  manifest.json          configurazione PWA
  service-worker.js       funzionamento offline base
  icons/                  icone dell'app
  run.bat                  avvio rapido da Windows
```
