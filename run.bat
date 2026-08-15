@echo off
title Frigo Tracker
echo Avvio Frigo Tracker...
echo.
echo Se il browser non si apre da solo, vai su http://localhost:8420
echo Per fermare il server: chiudi questa finestra oppure premi CTRL+C
echo.
start "" http://localhost:8420
python -m http.server 8420
pause
