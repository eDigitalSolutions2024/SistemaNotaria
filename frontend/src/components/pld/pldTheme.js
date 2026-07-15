// src/components/pld/pldTheme.js
//
// Tema de MUI acotado al módulo PLD. El resto de la app no usa
// ThemeProvider (todo corre con el default de MUI), así que los botones y
// Chips de PLD se veían con el azul genérico de MUI en vez del azul real
// del sistema. En vez de introducir un ThemeProvider global (riesgo de
// romper estilos existentes en otros módulos), este tema se aplica SOLO
// dentro del árbol de ExpedientePLD.
//
// Valores tomados literalmente de frontend/src/pages/MainPage.css (--accent,
// --accent-hover, font-family) para que el módulo se sienta parte del
// mismo sistema, no un añadido con la paleta por default de MUI.
import { createTheme } from '@mui/material/styles';

const pldTheme = createTheme({
  palette: {
    primary: {
      main: '#2563eb', // --accent en MainPage.css
      dark: '#1d4ed8', // --accent-hover en MainPage.css
    },
  },
  typography: {
    fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
  },
});

export default pldTheme;
