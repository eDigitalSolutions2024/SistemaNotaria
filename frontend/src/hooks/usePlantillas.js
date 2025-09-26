// src/hooks/usePlantillas.js
import { useEffect, useState } from 'react';
const API = process.env.REACT_APP_API_URL || 'http://localhost:4000';

export default function usePlantillas(){
  const [plantillas, setPlantillas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    (async()=>{
      try{
        const r = await fetch(`${API}/api/plantillas`);
        const data = await r.json();
        setPlantillas(data || []);
      }finally{
        setLoading(false);
      }
    })();
  }, []);

  return { plantillas, loading, API };
}
