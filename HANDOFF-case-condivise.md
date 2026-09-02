# Handoff — feature "Inventari condivisi (case)" — da testare sull'altro PC

> File temporaneo di passaggio. **Cancellare prima del merge su `main`.**
> Data passaggio: sessione di sviluppo V2.3, branch non ancora testato né mergiato.

## Stato

- Tutto il lavoro è sul branch **`feature/case-condivise`**, pushato su GitHub.
  `main` è **intatto** (locale e remoto fermi a `b49a6ca` = v2.2.0), quindi il
  sito live su GitHub Pages non è toccato.
- Ultimo commit sul branch al momento del passaggio: **`0fd4332`**
  (3 commit totali sopra `main`: `71945a3`, `4d6dd03`, `0fd4332`).
- Versione già bumpata a **`2.3.0`** in `js/version.js`.
- La feature è **implementata per intero** ma:
  - **non è stata eseguita nessuna verifica automatica** (il PC di sviluppo non
    aveva Node/Playwright) — solo un check grezzo di bilanciamento parentesi/tag
    con uno script Python;
  - **le regole di sicurezza Firestore non sono ancora pubblicate** sul progetto
    reale `frigo-tracker` (vedi sotto).

## Cosa fare all'avvio sull'altro PC

```bash
git fetch origin
git checkout feature/case-condivise
git pull
```

Poi dire a Claude Code, in una nuova sessione:

> Stiamo continuando la feature "Inventari condivisi (case)" per Frigo Tracker,
> branch `feature/case-condivise`. Il codice è implementato ma non testato.
> Leggi `HANDOFF-case-condivise.md`, `CLAUDE.md` (nota tecnica "Inventari
> condivisi" + note V2.3) e `firestore.rules`, poi esegui le verifiche.

## Verifiche da eseguire

### 1. Sintassi / statiche
- `node --check js/storage.js js/app.js js/auth.js js/speech.js service-worker.js`

### 2. Test unitari sulle funzioni pure (scrivere script usa-e-getta in Node, come già fatto per `calcolaMerge`)
Sono in `js/storage.js`, a livello di modulo o come metodi:
- `calcolaSoloLocali(locali, remoti)` → prodotti locali il cui `id` non è nei remoti.
  Casi: nessun locale; tutti già remoti; alcuni solo locali; array vuoti.
- `calcolaMerge(locali, cloud)` → invariata, ma ricontrollare che non sia rotta.
- `Storage._msEntrata(membro)` → gestisce `entratoIl` come `Timestamp` Firestore
  (`.toMillis()`), come stringa ISO (legacy), o assente (→ 0).
- `Storage._membroPiuAnziano(membri, uidCandidati)` → ritorna l'uid con
  `entratoIl` più vecchio.
- Generatore codice invito (`Storage._generaCodice`): 6 caratteri, alfabeto
  `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (niente 0/O/1/I), nessuna collisione su N
  generazioni.

### 3. Regole Firestore
Preferibile: **Firebase Emulator Suite** (`npm i -g firebase-tools`, serve Java)
+ `@firebase/rules-unit-testing`. Scenari da coprire:
- personale: solo il proprietario legge/scrive `utenti/{uid}/prodotti`;
- `case/{id}`: `get` ok da autenticato, `list` sempre negato;
- `create` casa: ok solo se `creatoDa == uid`, unico membro, voce membro valida
  (`mioMembroValido`: 3 campi, email = token, `entratoIl == request.time`);
- `isJoin`: aggiunge solo la propria uid, con valore valido, size precedente < 5;
  rifiuta il 6° membro; rifiuta `entratoIl` falsificato (stringa passata a mano);
  rifiuta email diversa da quella del token;
- `isLeave` / `isLeaveCreatore`: rimuove solo la propria uid; il creatore può
  spostare `creatoDa` solo su un membro ancora presente;
- `isRigeneraCodice`: solo il creatore, cambia solo `codice`;
- `case/{id}/prodotti`: read/write solo ai membri;
- `codiciInvito/{codice}`: `get` da autenticato, `create`/`delete` solo dal
  creatore della casa puntata, `update` negato.

### 4. Playwright (E2E)
Senza emulatore/Firebase i flussi casa non sono testabili end-to-end. Coprire
almeno:
- l'app carica senza errori console;
- flusso personale invariato (aggiunta prodotto locale, lista, filtri);
- overlay Account: la sezione "Casa condivisa" compare da loggati, i due stati
  (fuori/dentro) si alternano;
- overlay `#view-migrazione`: 3 pulsanti (`btn-migra-si`, `btn-migra-no`,
  `btn-migra-elimina`).

I flussi multi-membro (realtime, cap 5, handoff creatore, pulizia casa vuota)
vanno provati con l'emulatore **oppure** manualmente sul progetto reale con 2
account Google di test, dopo aver pubblicato le regole.

## Pubblicare le regole sul progetto reale (se non si usa l'emulatore)

Se `firebase-tools` è installato e autenticato sul progetto `frigo-tracker`:
```bash
firebase deploy --only firestore:rules
```
(usa il file `firestore.rules` nella root)

Altrimenti a mano: Console Firebase → progetto `frigo-tracker` → Build →
Firestore Database → scheda **Rules** → sostituire tutto con il contenuto di
`firestore.rules` → **Publish**.

Nessun indice composito da creare. Le collezioni `case` e `codiciInvito` si
creano da sole al primo utilizzo.

## Nuove collezioni / campi Firestore (per controllare nella Console)

- `case/{casaId}` (casaId = auto-id): `nome` (default "Casa condivisa"),
  `creatoDa` (uid, cambia se il creatore esce), `creatoIl` (ISO), `codice`
  (6 char), `membri` (mappa `uid → {nome, email, entratoIl}`, max 5, `entratoIl`
  è un server Timestamp), `lineaConsumo` (ISO | null).
- `case/{casaId}/prodotti/{prodId}`: stessa forma dei prodotti personali.
- `codiciInvito/{codice}` (id doc = il codice): `{ caseId }`.
- localStorage nuovi (solo device): `frigo_tracker_casa_attiva`,
  `frigo_tracker_casa_prodotti`.

## Scelte autonome ancora da validare con l'utente

1. Handoff `creatoDa` all'uscita del creatore: il client sceglie il membro
   entrato per primo; nessuna notifica al nuovo creatore.
2. Ultimo membro che esce → cancellazione **immediata** di casa + prodotti +
   codice invito (non un TTL "dopo tot giorni").
3. `get` aperto su `case`/`codiciInvito` per gli autenticati (serve alla schermata
   di ingresso). Mitigato da id non enumerabile + `list` negato.
4. Dopo l'uscita da una casa, da loggati, ricompare il prompt "solo locali" per i
   prodotti ex-casa (consenso al caricamento sul cloud personale).
5. `_svuotaCasaCompletamente` fa una `get()` non paginata dei prodotti: con >500
   prodotti in una casa il batch fallirebbe (irrealistico, non gestito).

## Dopo che i test passano

1. Cancellare questo file (`HANDOFF-case-condivise.md`) con un commit dedicato.
2. Aggiornare la sezione "Novità" in `index.html` e il changelog `README.md`
   solo se emergono modifiche rispetto a quanto già scritto per v2.3.0.
3. Merge `feature/case-condivise` → `main` (l'utente testa sempre in locale con
   `run.bat` **prima** di dare l'ok; il push su `main` va fatto **solo** dopo
   conferma esplicita dell'utente — è quello che aggiorna il sito live).
4. Pubblicare le regole Firestore sul progetto reale se non già fatto.
