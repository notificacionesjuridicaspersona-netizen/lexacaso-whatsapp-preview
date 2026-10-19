import React, { useState } from 'react';
import { runAI } from '../../lib/ai';

interface AnalisisIAProps {
  promptInicial?: string;
}

export const AnalisisIA: React.FC<AnalisisIAProps> = ({ promptInicial = '' }) => {
  const [prompt, setPrompt] = useState(promptInicial);
  const [resultado, setResultado] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ejecutarAnalisis = async () => {
    if (!prompt.trim()) return;
    setCargando(true);
    setError(null);

    try {
      const respuesta = await runAI(prompt);
      setResultado(respuesta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar la solicitud.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="analisis-ia-container">
      <h3>Análisis con Inteligencia Artificial</h3>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Ingrese la consulta o los hechos a analizar..."
        rows={4}
        className="w-full p-2 border rounded"
      />
      <button
        onClick={ejecutarAnalisis}
        disabled={cargando || !prompt.trim()}
        className="btn btn-primary mt-2"
      >
        {cargando ? 'Procesando...' : 'Ejecutar IA'}
      </button>

      {error && <div className="alert alert-error mt-2">{error}</div>}

      {resultado && (
        <div className="resultado-container mt-4 p-4 border rounded bg-gray-50">
          <h4>Resultado del Análisis:</h4>
          <pre className="whitespace-pre-wrap">{resultado}</pre>
        </div>
      )}
    </div>
  );
};

export default AnalisisIA;
