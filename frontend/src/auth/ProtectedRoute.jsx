import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, user, ready } = useAuth();

  // Espera a conocer el estado (evita pantallazo)
  if (!ready) return null;

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (roles && roles.length > 0 && !roles.includes(user?.role)) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
