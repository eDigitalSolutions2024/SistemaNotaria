import React, { useEffect, useRef } from 'react';
import FormCliente from '../components/FormCliente';
import TablaAbogados from '../components/AbogadosTable';
import TablaClientes from '../components/TablaClientes';
import TablaSalas from '../components/TablaSala';

import '../css/Home.css';
import { io } from 'socket.io-client';

// Conexión socket al backend
const socket = io(process.env.REACT_APP_API_URL);

function Home() {
  const clientesRef = useRef(null);
  const salasRef = useRef(null);
  const abogadosRef = useRef(null);

  useEffect(() => {
    // Evento: cliente actualizado
    socket.on('clienteActualizado', () => {
      console.log('🔁 Evento: clienteActualizado');
      if (clientesRef.current?.recargarClientes) {
        clientesRef.current.recargarClientes();
      }
    });

    // Evento: sala actualizada
    socket.on('salaActualizada', () => {
      console.log('🔁 Evento: salaActualizada');
      if (salasRef.current?.recargarSalas) {
        salasRef.current.recargarSalas();
      }
    });

    // Evento: abogado actualizado
    socket.on('abogadoActualizado', () => {
      console.log('🔁 Evento: abogadoActualizado');
      if (abogadosRef.current?.recargarAbogados) {
        abogadosRef.current.recargarAbogados();
      }
    });

    return () => {
      socket.off('clienteActualizado');
      socket.off('salaActualizada');
      socket.off('abogadoActualizado');
    };
  }, []);

  return (
    <div className="contenedor-formulario-y-abogados">
      
      {/* Formulario de registro */}
      <div className="formulario-cliente">
        <FormCliente onCreado={() => {
    // refresca tabla de clientes directo
    if (clientesRef.current?.recargarClientes) {
      clientesRef.current.recargarClientes();
    }
    // además puedes emitir evento al backend si quieres notificar a todos
    socket.emit("clienteCreado"); 
  }} />
      </div>

      {/* Tabla de salas */}
      <div className="tabla-sala">
        <TablaSalas ref={salasRef} />
      </div>

      {/* Tabla de clientes */}
      <div className="tabla-clientes">
        <TablaClientes ref={clientesRef} />
      </div>
      {/* Tabla de abogados */}
      <div className="tabla-abogados">
        <TablaAbogados ref={abogadosRef} />
      </div>
    </div>
  );
}

export default Home;
