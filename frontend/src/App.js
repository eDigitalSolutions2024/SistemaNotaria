// src/App.js
import React from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import MainPage from './pages/MainPage';
import Login from './components/Login'; // tu Login.jsx en components

// Componente “puerta”: elige qué renderizar
function Gate() {
  const { isAuthenticated } = useAuth(); // viene del AuthContext
  return isAuthenticated ? <MainPage /> : <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
