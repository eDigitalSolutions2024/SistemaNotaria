// src/App.js
import React, { useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import MainPage from './pages/MainPage';
import Login from './components/Login'; // tu Login.jsx en components
import SplashScreen from './components/SplashScreen';

// Componente “puerta”: elige qué renderizar
function Gate() {
  const { isAuthenticated } = useAuth(); // viene del AuthContext
  return isAuthenticated ? <MainPage /> : <Login />;
}

export default function App() {
  // Bienvenida de ~3s solo al cargar la app (no en cada navegación interna,
  // Gate/MainPage siguen montados normalmente después).
  const [showSplash, setShowSplash] = useState(true);

  return (
    <AuthProvider>
      {showSplash && <SplashScreen duration={3000} onFinish={() => setShowSplash(false)} />}
      <Gate />
    </AuthProvider>
  );
}
