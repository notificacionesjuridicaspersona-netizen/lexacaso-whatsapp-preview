const openaiKey = import.meta.env.VITE_OPENAI_API_KEY;
const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;

export type AIProvider = 'openai' | 'gemini' | 'local';

export function getAIProvider(): AIProvider {
  if (openaiKey) return 'openai';
  if (geminiKey) return 'gemini';
  return 'local';
}

export function isAIConfigured(): boolean {
  return true;
}

interface AIResult {
  content: string;
  provider: AIProvider;
  error?: string;
}

export async function runAI(prompt: string, context: string): Promise<AIResult> {
  const provider = getAIProvider();

  const fullPrompt = context
    ? `Contexto del expediente:\n${context}\n\nInstrucción:\n${prompt}`
    : prompt;

  try {
    if (provider === 'openai') {
      return await callOpenAI(fullPrompt);
    } else if (provider === 'gemini') {
      return await callGemini(fullPrompt);
    } else {
      return generateLocalAnalysis(prompt, context);
    }
  } catch (e) {
    return { content: '', provider: 'local', error: (e as Error).message };
  }
}

function generateLocalAnalysis(prompt: string, context: string): AIResult {
  const lines: string[] = [];

  lines.push('ANÁLISIS JURÍDICO GENERADO');
  lines.push('='.repeat(50));
  lines.push('');

  const expedienteInfo = extractField(context, 'Título:', 'Descripción:', 'Área jurídica:', 'Pretensiones:', 'Actuaciones previas:', 'Observaciones:');

  if (expedienteInfo.titulo) {
    lines.push(`EXPEDIENTE: ${expedienteInfo.titulo}`);
  }
  if (expedienteInfo.area) {
    lines.push(`ÁREA JURÍDICA: ${expedienteInfo.area}`);
  }
  lines.push(`Fecha de análisis: ${new Date().toLocaleString('es-CO')}`);
  lines.push('');

  const docNames = extractDocumentNames(context);
  const docContents = extractDocumentContents(context);

  if (docNames.length > 0) {
    lines.push('DOCUMENTOS ANALIZADOS:');
    lines.push('-'.repeat(40));
    for (const name of docNames) {
      lines.push(`  • ${name}`);
    }
    lines.push('');
  }

  if (expedienteInfo.descripcion) {
    lines.push('DESCRIPCIÓN DEL CASO:');
    lines.push('-'.repeat(40));
    lines.push(expedienteInfo.descripcion);
    lines.push('');
  }

  if (expedienteInfo.pretensiones) {
    lines.push('PRETENSIONES:');
    lines.push('-'.repeat(40));
    lines.push(expedienteInfo.pretensiones);
    lines.push('');
  }

  if (expedienteInfo.actuaciones) {
    lines.push('ACTUACIONES PREVIAS:');
    lines.push('-'.repeat(40));
    lines.push(expedienteInfo.actuaciones);
    lines.push('');
  }

  if (docContents.length > 0) {
    lines.push('CONTENIDO RELEVANTE DE DOCUMENTOS:');
    lines.push('-'.repeat(40));
    for (const doc of docContents) {
      const preview = doc.texto.length > 500 ? doc.texto.substring(0, 500) + ' [...]' : doc.texto;
      lines.push(`  [${doc.nombre}]`);
      lines.push(`  ${preview}`);
      lines.push('');
    }
  }

  const promptLower = prompt.toLowerCase();

  if (promptLower.includes('analice') || promptLower.includes('analizar')) {
    lines.push('ANÁLISIS DE DOCUMENTOS:');
    lines.push('-'.repeat(40));
    if (docNames.length > 0) {
      lines.push(`Se identificaron ${docNames.length} documento(s) en el expediente:`);
      for (const name of docNames) {
        const ext = name.split('.').pop()?.toUpperCase() || 'DESCONOCIDO';
        lines.push(`  • ${name} (formato: ${ext})`);
      }
      lines.push('');
      if (docContents.length > 0) {
        lines.push('Del contenido extraído se destacan los siguientes elementos probatorios:');
        for (const doc of docContents) {
          const keywords = extractKeywords(doc.texto);
          if (keywords.length > 0) {
            lines.push(`  • ${doc.nombre}: ${keywords.join(', ')}`);
          }
        }
      } else {
        lines.push('  • Los documentos no contienen texto extraíble automáticamente (posibles imágenes o PDFs escaneados).');
        lines.push('  • Se recomienda revisar manualmente cada documento para determinar su valor probatorio.');
      }
    } else {
      lines.push('  • No hay documentos cargados en el expediente para analizar.');
    }
    lines.push('');
  }

  if (promptLower.includes('resuma') || promptLower.includes('resumir') || promptLower.includes('cronológicamente')) {
    lines.push('RESUMEN CRONOLÓGICO DE HECHOS:');
    lines.push('-'.repeat(40));
    if (expedienteInfo.descripcion || expedienteInfo.actuaciones) {
      lines.push('Con base en la información del expediente, la cronología de eventos es:');
      lines.push(`  1. ${expedienteInfo.descripcion || 'Descripción del caso no disponible'}`);
      if (expedienteInfo.actuaciones) {
        lines.push(`  2. Actuaciones previas: ${expedienteInfo.actuaciones}`);
      }
      lines.push('  3. Estado actual del proceso pendiente de actualización con fechas específicas.');
    } else {
      lines.push('  • No hay información suficiente para construir una cronología detallada.');
      lines.push('  • Se recomienda completar la descripción del caso y las actuaciones previas.');
    }
    if (docContents.length > 0) {
      lines.push('');
      lines.push('  Los documentos pueden contener fechas y eventos relevantes que complementen esta cronología.');
    }
    lines.push('');
  }

  if (promptLower.includes('problemas') || promptLower.includes('cuestiones')) {
    lines.push('PROBLEMAS JURÍDICOS IDENTIFICADOS:');
    lines.push('-'.repeat(40));
    const problemas = inferirProblemas(expedienteInfo, docContents);
    for (let i = 0; i < problemas.length; i++) {
      lines.push(`  ${i + 1}. ${problemas[i]}`);
    }
    lines.push('');
  }

  if (promptLower.includes('jurisprudencia')) {
    lines.push('INVESTIGACIÓN DE JURISPRUDENCIA:');
    lines.push('-'.repeat(40));
    lines.push('  Para una investigación jurisprudencial completa, se recomienda consultar:');
    lines.push('  • Corte Suprema de Justicia: https://www.cortesuprema.gov.co');
    lines.push('  • Consejo de Estado: https://www.consejodeestado.gov.co');
    lines.push('  • Corte Constitucional: https://www.corteconstitucional.gov.co');
    if (expedienteInfo.area) {
      lines.push(`  • Filtrar por área jurídica: ${expedienteInfo.area}`);
    }
    lines.push('  • Verificar vigencia y aplicabilidad de cada sentencia al caso concreto.');
    lines.push('');
  }

  if (promptLower.includes('normatividad') || promptLower.includes('normas')) {
    lines.push('NORMATIVIDAD APLICABLE:');
    lines.push('-'.repeat(40));
    const normas = inferirNormas(expedienteInfo);
    if (normas.length > 0) {
      for (const n of normas) {
        lines.push(`  • ${n}`);
      }
    } else {
      lines.push('  • Pendiente de determinar según el área jurídica específica del caso.');
    }
    lines.push('');
  }

  if (promptLower.includes('alternativas')) {
    lines.push('ALTERNATIVAS DE SOLUCIÓN:');
    lines.push('-'.repeat(40));
    lines.push('  1. Vía judicial: iniciar o continuar proceso según el área del caso.');
    lines.push('  2. Vía administrativa: agotar instancias administrativas si aplica.');
    lines.push('  3. Vía extrajudicial: conciliación, mediación o transacción.');
    lines.push('  • Se recomienda evaluar costos, tiempos y probabilidades de éxito de cada vía.');
    lines.push('');
  }

  if (promptLower.includes('términos') || promptLower.includes('plazos') || promptLower.includes('prescripción')) {
    lines.push('TÉRMINOS Y PLAZOS:');
    lines.push('-'.repeat(40));
    lines.push('  • Verificar términos procesales pendientes según el estado actual del expediente.');
    lines.push('  • Revisar posibles prescripciones o caducidades según el área jurídica.');
    lines.push('  • Consultar el Código de Procedimiento Civil aplicable para términos específicos.');
    lines.push('');
  }

  if (promptLower.includes('pruebas') && promptLower.includes('faltantes')) {
    lines.push('PRUEBAS FALTANTES:');
    lines.push('-'.repeat(40));
    if (docNames.length > 0) {
      lines.push(`  Documentos actuales: ${docNames.length}`);
      for (const name of docNames) {
        lines.push(`    - ${name}`);
      }
      lines.push('  • Se recomienda verificar si faltan: documentos de identidad, certificados,');
      lines.push('    pruebas documentales, testimoniales, periciales o inspecciones judiciales.');
    } else {
      lines.push('  • No hay documentos cargados. Se recomienda adjuntar todos los documentos');
      lines.push('    relacionados con el caso para identificar las pruebas faltantes.');
    }
    lines.push('');
  }

  if (promptLower.includes('estrategias')) {
    lines.push('ESTRATEGIAS JURÍDICAS:');
    lines.push('-'.repeat(40));
    lines.push('  1. Estrategia probatoria: recopilar y organizar pruebas documentales.');
    lines.push('  2. Estrategia procesal: asegurar cumplimiento de términos y oportunidades procesales.');
    lines.push('  3. Estrategia sustancial: fortalecer argumentos jurídicos centrales.');
    lines.push('  4. Estrategia negociadora: evaluar posibilidades de acuerdo o conciliación.');
    lines.push('');
  }

  if (promptLower.includes('acciones') || promptLower.includes('vías')) {
    lines.push('ACCIONES DISPONIBLES:');
    lines.push('-'.repeat(40));
    lines.push('  • Acción judicial principal según el área del caso.');
    lines.push('  • Medidas cautelares si la situación lo amerita.');
    lines.push('  • Incidentes procesales según sea necesario.');
    lines.push('  • Recursos contra decisiones adversas.');
    lines.push('');
  }

  if (promptLower.includes('conducta')) {
    lines.push('CONDUCTA A EVALUAR:');
    lines.push('-'.repeat(40));
    lines.push('  • Mantener diligencia procesal: cumplir términos y presentar escritos a tiempo.');
    lines.push('  • Comunicación fluida con el cliente sobre avances y riesgos.');
    lines.push('  • Documentar todas las actuaciones para el expediente.');
    lines.push('');
  }

  if (promptLower.includes('borrador')) {
    lines.push('BORRADOR DE DOCUMENTO JURÍDICO:');
    lines.push('-'.repeat(40));
    lines.push('  [Ciudad], [fecha]');
    lines.push('');
    lines.push(`  Señor(a) Juez/Autoridad`);
    lines.push('  [Despacho]');
    lines.push('  E. S. D.');
    lines.push('');
    lines.push(`  Referencia: ${expedienteInfo.titulo || 'Expediente pendiente de radicación'}`);
    lines.push('');
    lines.push('  Respetuosamente me permito solicitar...');
    lines.push('  [Completar según el tipo de documento requerido]');
    lines.push('');
    lines.push('  Atentamente,');
    lines.push('  [Nombre del abogado]');
    lines.push('  [Tarjeta profesional]');
    lines.push('');
    lines.push('  NOTA: Los datos entre corchetes deben ser completados con información específica.');
    lines.push('');
  }

  if (promptLower.includes('contradicciones') || promptLower.includes('debilidades')) {
    lines.push('CONTRADICCIONES Y DEBILIDADES:');
    lines.push('-'.repeat(40));
    lines.push('  • Revisar consistencia entre la descripción del caso y los documentos adjuntos.');
    if (docContents.length > 0) {
      lines.push('  • Verificar que el contenido de los documentos respalde las pretensiones.');
    } else {
      lines.push('  • Sin documentos cargados, no se pueden evaluar contradicciones probatorias.');
    }
    lines.push('  • Identificar posibles vacíos en la argumentación jurídica.');
    lines.push('  • Anticipar contraargumentos de la contraparte.');
    lines.push('');
  }

  if (promptLower.includes('informe') && promptLower.includes('integral')) {
    lines.push('INFORME JURÍDICO INTEGRAL:');
    lines.push('-'.repeat(40));
    lines.push('  1. HECHOS: Ver resumen cronológico arriba.');
    lines.push('  2. DOCUMENTOS: Ver lista de documentos analizados.');
    lines.push('  3. PROBLEMAS JURÍDICOS: Ver identificación de problemas arriba.');
    lines.push('  4. NORMATIVIDAD: Ver normatividad aplicable arriba.');
    lines.push('  5. JURISPRUDENCIA: Pendiente de investigación en bases oficiales.');
    lines.push('  6. ESTRATEGIAS: Ver estrategias propuestas arriba.');
    lines.push('  7. PLAZOS: Verificar según estado procesal actual.');
    lines.push('');
    lines.push('  CONCLUSIÓN: El expediente requiere complementación probatoria y revisión');
    lines.push('  detallada de la normativa aplicable antes de proceder.');
    lines.push('');
  }

  if (promptLower.includes('segunda') && promptLower.includes('revisión')) {
    lines.push('SEGUNDA REVISIÓN CRÍTICA:');
    lines.push('-'.repeat(40));
    lines.push('  • Verificar que todos los problemas jurídicos identificados estén sustentados.');
    lines.push('  • Comprobar que las normas citadas estén vigentes.');
    lines.push('  • Revisar coherencia interna del análisis.');
    lines.push('  • Confirmar que no se hayan omitido aspectos relevantes del expediente.');
    lines.push('');
  }

  lines.push('-'.repeat(50));
  lines.push('NOTA: Este análisis fue generado automáticamente a partir del contenido');
  lines.push('de los documentos y datos del expediente. Debe ser revisado y validado');
  lines.push('por un profesional del derecho antes de ser utilizado en un proceso judicial.');

  return { content: lines.join('\n'), provider: 'local' };
}

function extractField(context: string, ...labels: string[]): {
  titulo: string; area: string; descripcion: string;
  pretensiones: string; actuaciones: string; observaciones: string;
} {
  const result = {
    titulo: '', area: '', descripcion: '', pretensiones: '', actuaciones: '', observaciones: '',
  };
  const findField = (label: string): string => {
    const idx = context.indexOf(label);
    if (idx === -1) return '';
    const start = idx + label.length;
    const nextLabelIdx = labels
      .map((l) => l !== label ? context.indexOf(l, start) : -1)
      .filter((i) => i > -1)
      .sort((a, b) => a - b)[0];
    const end = nextLabelIdx > -1 ? nextLabelIdx : context.indexOf('CONTENIDO DE DOCUMENTOS', start);
    if (end > -1) return context.substring(start, end).trim();
    return context.substring(start).trim();
  };
  result.titulo = findField('Título:');
  result.area = findField('Área jurídica:');
  result.descripcion = findField('Descripción:');
  result.pretensiones = findField('Pretensiones:');
  result.actuaciones = findField('Actuaciones previas:');
  result.observaciones = findField('Observaciones:');
  return result;
}

function extractDocumentNames(context: string): string[] {
  const names: string[] = [];
  const regex = /--- Documento: (.+?) ---/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(context)) !== null) {
    names.push(match[1]);
  }
  return names;
}

function extractDocumentContents(context: string): { nombre: string; texto: string }[] {
  const docs: { nombre: string; texto: string }[] = [];
  const regex = /--- Documento: (.+?) ---\n([\s\S]*?)(?=\n--- Documento:|$)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(context)) !== null) {
    const nombre = match[1];
    const texto = match[2].trim();
    if (texto && !texto.startsWith('[') && !texto.startsWith('No hay documentos')) {
      docs.push({ nombre, texto });
    }
  }
  return docs;
}

function extractKeywords(text: string): string[] {
  const keywords: string[] = [];
  const legalTerms = [
    'demanda', 'sentencia', 'tutela', 'derecho', 'ley', 'decreto', 'resolución',
    'actor', 'demandado', 'juez', 'tribunal', 'competencia', 'jurisdicción',
    'pretensión', 'prueba', 'testimonio', 'declaración', 'contrato', 'acuerdo',
    'indemnización', 'daño', 'perjuicio', 'reparación', 'cumplimiento', 'incumplimiento',
    'contrato', 'obligación', 'responsabilidad', 'restitución', 'embargo', 'ejecución',
  ];
  const lower = text.toLowerCase();
  for (const term of legalTerms) {
    if (lower.includes(term) && !keywords.includes(term)) {
      keywords.push(term);
    }
  }
  return keywords.slice(0, 8);
}

function inferirProblemas(
  info: { titulo: string; area: string; descripcion: string; pretensiones: string; actuaciones: string },
  docs: { nombre: string; texto: string }[]
): string[] {
  const problemas: string[] = [];
  if (info.area) {
    problemas.push(`Problemas jurídicos relacionados con el área de ${info.area}.`);
  }
  if (info.pretensiones) {
    problemas.push(`Viabilidad jurídica de las pretensiones: ${info.pretensiones.substring(0, 100)}.`);
  }
  if (docs.length === 0) {
    problemas.push('Insuficiencia probatoria: no hay documentos cargados que respalden el caso.');
  } else {
    problemas.push(`Validez y autenticidad de los ${docs.length} documento(s) adjunto(s).`);
  }
  if (!info.actuaciones) {
    problemas.push('Falta de registro de actuaciones previas que puedan afectar términos procesales.');
  }
  problemas.push('Competencia y jurisdicción aplicable al caso concreto.');
  return problemas;
}

function inferirNormas(info: { area: string; descripcion: string }): string[] {
  const normas: string[] = [];
  const areaLower = (info.area || '').toLowerCase();
  if (areaLower.includes('civil') || areaLower.includes('familia')) {
    normas.push('Código Civil Colombiano (Ley 84 de 1873)');
    normas.push('Código General del Proceso (Ley 1564 de 2012)');
  }
  if (areaLower.includes('laboral')) {
    normas.push('Código Sustantivo del Trabajo');
    normas.push('Código Procesal del Trabajo (Ley 712 de 2001)');
  }
  if (areaLower.includes('penal')) {
    normas.push('Código Penal Colombiano (Ley 599 de 2000)');
    normas.push('Código de Procedimiento Penal (Ley 906 de 2004)');
  }
  if (areaLower.includes('administrativo')) {
    normas.push('Código de Procedimiento Administrativo y de lo Contencioso Administrativo (Ley 1437 de 2011)');
  }
  if (areaLower.includes('constitucional') || areaLower.includes('tutela')) {
    normas.push('Constitución Política de Colombia (1991)');
    normas.push('Decreto 2591 de 1991 (Acción de Tutela)');
  }
  if (normas.length === 0) {
    normas.push('Constitución Política de Colombia (1991) - principios fundamentales aplicables.');
    normas.push('Código General del Proceso (Ley 1564 de 2012) - normas procesales generales.');
  }
  return normas;
}

async function callOpenAI(prompt: string): Promise<AIResult> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'Eres un asistente jurídico colombiano. Proporciona análisis claros, estructurados y basados en el derecho colombiano. No inventes sentencias, artículos ni citas. Si no conoces un dato, indícalo como pendiente de verificar.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    return { content: '', provider: 'openai', error: `OpenAI error (${res.status}): ${errBody}` };
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';
  return { content, provider: 'openai' };
}

async function callGemini(prompt: string): Promise<AIResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: 'Eres un asistente jurídico colombiano. Proporciona análisis claros, estructurados y basados en el derecho colombiano. No inventes sentencias, artículos ni citas. Si no conoces un dato, indícalo como pendiente de verificar.',
            },
          ],
        },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    return { content: '', provider: 'gemini', error: `Gemini error (${res.status}): ${errBody}` };
  }

  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { content, provider: 'gemini' };
}
